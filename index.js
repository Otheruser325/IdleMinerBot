import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { fileURLToPath, pathToFileURL } from 'url';

import { deployCommands } from './deploy-commands.js';
import { getUser, getAllUsers, updateUser, withUserLock } from './dataManager.js';
import { updateBotStatus } from './utils/botStatus.js';
import numberFormat from './utils/numberFormat.js';
import guildDM from './utils/guildDM.js';
import { 
    getManagerAutomationStatus, 
    getManagedShaftTiers,
    applyIncomeMultiplier,
    applyShaftIncomeBeam,
    applyElevatorIncomeBeam,
    applyMiningSpeedBoost,
    applyLoadingSpeedBoost
} from './utils/managerAbilities.js';
import {
    getElevatorSegmentTravelTimeMs,
    getShaftTravelTimeMs,
    getWarehouseTravelTimeMs
} from './utils/movementTimes.js';
import mineRegionsJson from './config/mineRegions.json' with { type: 'json' };
import continentDataJson from './config/continentData.json' with { type: 'json' };
import { normalizeMineData, normalizeOwnedContinents } from './utils/continentLooker.js';

const mineRegions = mineRegionsJson.regions;
const continentData = continentDataJson.continents;

import { EventEmitter } from 'events';
import { classifyDiscordError, safeReply, logError } from './utils/errorHandling.js';
import { initializeDatabase, isDatabaseReady } from './utils/dbInit.js';

EventEmitter.defaultMaxListeners = 20;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();

// Introduce a delay between updates to avoid hitting rate limits
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function markUserAsActive(userId) {
    if (!userId) {
        return;
    }

    try {
        await withUserLock(userId, async () => {
            const activeUser = await getUser(userId);
            if (!activeUser) {
                return;
            }

            await updateUser(userId, { last_idle: Date.now() });
        });
    } catch (error) {
        logError('markUserAsActive', error, { userId });
    }
}

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // Optional: for guild-specific commands
const prefixes = ['im!', 'IM!', 'Im!'];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageTyping // Ensure this intent is included if you use message typing events
    ]
});

client.commands = new Collection();
client.slashCommands = new Collection();
client.interactions = new Collection();

async function importCommandModule(absolutePath) {
    const fileUrl = pathToFileURL(absolutePath).href;
    const mod = await import(fileUrl);
    return mod?.default || mod;
}

// Load prefix commands
const prefixCommandFiles = fs.readdirSync(path.join(__dirname, 'commands/prefix')).filter(file => file.endsWith('.js'));
for (const file of prefixCommandFiles) {
    const commandPath = path.join(__dirname, 'commands/prefix', file);
    const command = await importCommandModule(commandPath);
    client.commands.set(command.name, command);
    if (command.aliases) {
        command.aliases.forEach(alias => client.commands.set(alias, command));
    }
}

// Load slash commands
const slashCommandFiles = fs.readdirSync(path.join(__dirname, 'commands/slash')).filter(file => file.endsWith('.js'));
for (const file of slashCommandFiles) {
    const commandPath = path.join(__dirname, 'commands/slash', file);
    const command = await importCommandModule(commandPath);
    client.slashCommands.set(command.data.name, command);
}

// Schedule updates regularly
async function scheduleNextUpdate(client) {
    cron.schedule('*/5 * * * *', async () => {
        try {
            await updateBotStatus(client);
        } catch (error) {
            logError('cron:updateBotStatus', error);
        }
    });

    cron.schedule('*/10 * * * * *', async () => {
        try {
            await handleMissingData();
        } catch (error) {
            logError('cron:handleMissingData', error);
        }
    });
	
	// Check barrier unlock time every 10 seconds
    cron.schedule('*/10 * * * * *', async () => {
        try {
            await handleBarrierUnlockTime();
        } catch (error) {
            logError('cron:handleBarrierUnlockTime', error);
        }
    });
	
	// Schedule boost timer updates every 30 seconds
    cron.schedule('*/30 * * * * *', async () => {
        try {
            await handleBoostTimers();
        } catch (error) {
            logError('cron:handleBoostTimers', error);
        }
    });
	
	// Schedule manager work for all users every minute
    cron.schedule('*/60 * * * * *', async () => {
        try {
            const allUsers = await getAllUsers();
            for (const user of allUsers) {
                try {
                    await handleManagerWork(user, user.user_id);
					await delay(100);
                } catch (userError) {
                    console.warn(`Manager work for user ${user.user_id} failed.`, userError);
                    continue;
                }
            }
        } catch (error) {
            logError('cron:handleManagerWork', error);
        }
    });
}

// Function to simulate shaft work by managers (per tier)
function automateShaftWork(currentMine, managedTiers) {
    const FOUR_SECONDS = 4000;
    
    currentMine.mineshafts.forEach(shaft => {
        // Only automate shafts that have a manager assigned
        if (!managedTiers.includes(shaft.tier)) return;
        
        const now = Date.now();
        
        // Apply speed boosts - mining time
        const miningTime = applyMiningSpeedBoost(FOUR_SECONDS, currentMine);
        
        const walkingTime = getShaftTravelTimeMs(shaft.worker_walking_speed_per_second, currentMine);
        
        // Total cycle time: walk to deposit + mine + walk back
        const totalCycleTime = walkingTime + miningTime + walkingTime;
        
        // Calculate how many mining cycles could have completed
        const lastWorkTime = shaft.manager_last_worked || 0;
        const timeSinceLastWork = now - lastWorkTime;
        const cyclesCompleted = Math.floor(timeSinceLastWork / totalCycleTime);
        
        if (cyclesCompleted < 1) return; // Not enough time for a cycle
        
        // Update last worked timestamp (keep remainder for partial progress)
        shaft.manager_last_worked = now - (timeSinceLastWork % totalCycleTime);
        
        // Process completed cycles
        for (let i = 0; i < cyclesCompleted; i++) {
            // Calculate deposit per cycle (same as work command)
            const depositPerCycle = (shaft.capacity_per_worker || 0) * (shaft.number_of_workers || 0);
            
            // Apply income beam
            const beamResult = applyShaftIncomeBeam(depositPerCycle, currentMine);
            
            // Add beam cash directly to mine cash (instant)
            if (beamResult.beamAmount > 0) {
                currentMine._beamCash = (currentMine._beamCash || 0) + beamResult.beamAmount;
            }
            
            // Add remaining to shaft deposit
            shaft.total_deposit = (shaft.total_deposit || 0) + beamResult.remainingDeposit;
        }
    });
}

// Function to simulate elevator work by manager
function automateElevatorWork(currentMine) {
    const elevator = currentMine.elevator?.[0];
    if (!elevator) return;
    
    const now = Date.now();
    const LOADING_PER_SECOND = applyLoadingSpeedBoost(elevator.loading_per_second || 150, 'elevator', currentMine);
    const elevatorCapacity = elevator.capacity || 600;
    
    // Time to visit all shafts
    const elevatorSpeed = elevator.speed || 0.5;
    const BASE_TRAVEL_TIME = getElevatorSegmentTravelTimeMs(elevatorSpeed, currentMine);
    const managedTiers = getManagedShaftTiers(currentMine);
    const shaftCount = Math.max(1, managedTiers.length);
    const totalManagedDeposit = currentMine.mineshafts
        .filter(shaft => managedTiers.includes(shaft.tier))
        .reduce((sum, shaft) => sum + (shaft.total_deposit || 0), 0);
    const extractableThisCycle = Math.min(totalManagedDeposit, Math.max(0, elevatorCapacity - (elevator.total_deposit || 0)));
    const loadingTime = extractableThisCycle > 0 ? (extractableThisCycle / LOADING_PER_SECOND) * 1000 : 0;
    const cycleTime = (BASE_TRAVEL_TIME * shaftCount * 2) + (loadingTime * 2);
    
    // Check if a cycle has completed
    const lastWorkTime = elevator.manager_last_worked || 0;
    const timeSinceLastWork = now - lastWorkTime;
    const cyclesCompleted = Math.floor(timeSinceLastWork / cycleTime);
    
    if (cyclesCompleted < 1) return;
    
    // Update last worked timestamp
    elevator.manager_last_worked = now;
    
    // Extract from managed shafts only
    let totalExtracted = 0;
    let totalBeamCash = 0;
    
    for (const shaft of currentMine.mineshafts) {
        if (!managedTiers.includes(shaft.tier)) continue;
        
        const shaftDeposit = shaft.total_deposit || 0;
        if (shaftDeposit === 0) continue;
        
        // How much can elevator load from this shaft
        const remainingCapacity = elevatorCapacity - (elevator.total_deposit || 0);
        if (remainingCapacity <= 0) break;
        
        const amountToExtract = Math.min(shaftDeposit, remainingCapacity);
        
        // Apply income beam
        const beamResult = applyElevatorIncomeBeam(amountToExtract, currentMine);
        if (beamResult.beamAmount > 0) {
            totalBeamCash += beamResult.beamAmount;
        }
        
        // Update deposits
        shaft.total_deposit -= amountToExtract;
        elevator.total_deposit = (elevator.total_deposit || 0) + beamResult.remainingDeposit;
        totalExtracted += amountToExtract;
        
        if (elevator.total_deposit >= elevatorCapacity) break;
    }
    
    return { extracted: totalExtracted, beamCash: totalBeamCash };
}

// Function to simulate warehouse work by manager
function automateWarehouseWork(currentMine, user) {
    const warehouse = currentMine.warehouse?.[0];
    const elevator = currentMine.elevator?.[0];
    if (!warehouse) return 0; // Warehouse manager needs warehouse to exist
    if (!elevator) return 0; // Need elevator deposits to extract from
    
    const now = Date.now();
    const LOADING_PER_SECOND = warehouse.loading_per_second || 250;
    const NumberOfWorkers = warehouse.number_of_workers || 1;
    const CapacityPerWorker = warehouse.capacity_per_worker || 1000;
    
    // Time to complete one cycle
    const totalWorkerCapacity = CapacityPerWorker * NumberOfWorkers;
    const extractableAmount = Math.min(elevator.total_deposit || 0, totalWorkerCapacity);
    
    if (extractableAmount <= 0) return 0; // Nothing to extract
    
    // Apply loading speed boost
    const boostedLoadingRate = applyLoadingSpeedBoost(LOADING_PER_SECOND, 'warehouse', currentMine);
    
    // Apply walking speed boost
    const walkingTime = getWarehouseTravelTimeMs(warehouse.worker_walking_speed_per_second, currentMine);

    const LOADING_TIME = (extractableAmount / boostedLoadingRate) * 1000;
    const cycleTime = LOADING_TIME + (walkingTime * 2);
    
    // Check if a cycle has completed
    const lastWorkTime = warehouse.manager_last_worked || 0;
    const timeSinceLastWork = now - lastWorkTime;
    const cyclesCompleted = Math.floor(timeSinceLastWork / cycleTime);
    
    if (cyclesCompleted < 1) return 0;
    
    // Update last worked timestamp (keep remainder for partial progress)
    warehouse.manager_last_worked = now - (timeSinceLastWork % cycleTime);
    
    // Process completed cycles
    let totalCash = 0;
    for (let i = 0; i < cyclesCompleted; i++) {
        // Workers extract from elevator
        let totalExtracted = 0;
        for (let w = 0; w < NumberOfWorkers; w++) {
            const workerExtracted = Math.min(CapacityPerWorker, extractableAmount - (CapacityPerWorker * w));
            if (workerExtracted > 0 && elevator.total_deposit > 0) {
                const actualExtract = Math.min(workerExtracted, elevator.total_deposit);
                totalExtracted += actualExtract;
                elevator.total_deposit -= actualExtract;
            }
        }
        
        // Convert extracted minerals to cash
        if (totalExtracted > 0) {
            const incomeResult = applyIncomeMultiplier(totalExtracted, currentMine);
            totalCash += incomeResult.finalCash;
        }
    }
    
    return totalCash;
}

// Function to start manager work
async function handleManagerWork(user, userId) {
    if (!userId) {
        console.error('User data is undefined or invalid.');
        return;
    }

    await withUserLock(userId, async () => {
        const freshUser = await getUser(userId);
        if (!freshUser) {
            console.error(`User ${userId} could not be loaded for manager automation.`);
            return;
        }

        freshUser.mines = freshUser.mines || [];
        freshUser.cash = freshUser.cash || 0;
        freshUser.idle_cash = freshUser.idle_cash || 0;
        freshUser.last_idle = freshUser.last_idle || Date.now();
        freshUser.current_mine = freshUser.current_mine || (freshUser.mines.length > 0 ? freshUser.mines[0].mine_name : null);

        const currentMine = freshUser.mines.find(mine =>
            mine.mine_name.toLowerCase() === freshUser.current_mine.toLowerCase()
        );
        if (!currentMine) {
            console.error(`Current mine data for user ${userId} not found.`);
            return;
        }

        currentMine.managers = currentMine.managers || { shaft: [], elevator: [], warehouse: [] };
        currentMine.mineshafts = currentMine.mineshafts || [];
        currentMine.elevator = currentMine.elevator || [];
        currentMine.warehouse = currentMine.warehouse || [];

        if (currentMine.mineshafts.length === 0) {
            return;
        }

        const autoStatus = getManagerAutomationStatus(currentMine);
        const managedTiers = getManagedShaftTiers(currentMine);
        const currentTime = Date.now();
        const isIdle = currentTime - freshUser.last_idle > 10 * 60 * 1000;
        const idleEfficiency = freshUser.has_premium ? 0.2 : 0.1;

        let totalCashGenerated = 0;
        const workflowStats = {
            shaftDepositsAdded: 0,
            elevatorExtracted: 0,
            warehouseCash: 0,
            elevatorBeamCash: 0
        };

        try {
            if (managedTiers.length > 0) {
                automateShaftWork(currentMine, managedTiers);

                currentMine.mineshafts.forEach(shaft => {
                    if (managedTiers.includes(shaft.tier)) {
                        workflowStats.shaftDepositsAdded = (workflowStats.shaftDepositsAdded || 0) + (shaft.total_deposit || 0);
                    }
                });

                if (currentMine._beamCash > 0) {
                    freshUser.cash += currentMine._beamCash;
                    currentMine._beamCash = 0;
                }
            }

            if (autoStatus.elevator) {
                const elevatorResult = automateElevatorWork(currentMine);
                if (elevatorResult) {
                    workflowStats.elevatorExtracted = elevatorResult.extracted;
                    workflowStats.elevatorBeamCash = elevatorResult.beamCash;
                    if (elevatorResult.beamCash > 0) {
                        freshUser.cash += elevatorResult.beamCash;
                    }
                }
            }

            if (autoStatus.warehouse) {
                const warehouseCash = automateWarehouseWork(currentMine, freshUser);
                if (warehouseCash > 0) {
                    workflowStats.warehouseCash = warehouseCash;
                    totalCashGenerated += isIdle ? warehouseCash * idleEfficiency : warehouseCash;
                }
            }

            if (totalCashGenerated > 0) {
                if (isIdle) {
                    freshUser.idle_cash += totalCashGenerated;
                } else {
                    freshUser.cash += totalCashGenerated;
                }
            }

            currentMine._managerWorkStats = workflowStats;
        } catch (error) {
            console.error('Error in manager automation:', error);
        }

        try {
            await updateUser(userId, {
                cash: freshUser.cash,
                idle_cash: freshUser.idle_cash,
                last_idle: freshUser.last_idle,
                mines: freshUser.mines
            });
        } catch (error) {
            console.error('Error updating user data:', error);
        }
    });
}

// Function to handle missing data for all users
async function handleMissingData() {
    try {
        const allUsers = await getAllUsers();
        for (const user of allUsers) {
            await withUserLock(user.user_id, async () => {
                const freshUser = await getUser(user.user_id);
                if (!freshUser) {
                    return;
                }

                freshUser.username = freshUser.username || 'Unknown';
                freshUser.user_id = freshUser.user_id || user.user_id;
                freshUser.continents = normalizeOwnedContinents(freshUser.continents || [continentData[0].ContinentName]);
                freshUser.mines = (freshUser.mines || []).map(normalizeMineData);
                freshUser.cash = freshUser.cash || 0;
                freshUser.ice_cash = freshUser.ice_cash || 0;
                freshUser.fire_cash = freshUser.fire_cash || 0;
                freshUser.idle_cash = freshUser.idle_cash || 0;
                freshUser.idle_ice_cash = freshUser.idle_ice_cash || 0;
                freshUser.idle_fire_cash = freshUser.idle_fire_cash || 0;
                freshUser.super_cash = freshUser.super_cash || 0;
                freshUser.streak = freshUser.streak || 0;
                freshUser.last_daily = freshUser.last_daily || Date.now();
                freshUser.last_idle = freshUser.last_idle || Date.now();
			    freshUser.has_premium = freshUser.has_premium || false;
                freshUser.current_continent = freshUser.current_continent || 'Start Continent';
                freshUser.current_mine = freshUser.current_mine || (freshUser.mines.length > 0 ? freshUser.mines[0].mine_name : null);

                for (const mine of freshUser.mines) {
                    mine.prestige_count = mine.prestige_count || 0;
                    mine.mine_number = mine.mine_number || 1;
                    mine.factor = mine.factor || 1;
                    mine.mineshafts = mine.mineshafts || [];
                    mine.elevator = mine.elevator || [];
                    mine.warehouse = mine.warehouse || [];
                    mine.managers = mine.managers || { shaft: [], elevator: [], warehouse: [] };

                    if (!mine.barriers || mine.barriers.length < mineRegions.length) {
                        mine.barriers = mine.barriers || [];
                        mineRegions.forEach((region, index) => {
                            if (!mine.barriers[index]) {
                                mine.barriers[index] = {
                                    ...region,
                                    unlocked: index === 0
                                };
                            }
                        });
                    }
                }

                await updateUser(freshUser.user_id, freshUser);
            });
        }
    } catch (error) {
        logError('handleMissingData', error);
    }
}

// Function to handle barrier unlock time
async function handleBarrierUnlockTime() {
    try {
        const allUsers = await getAllUsers();

        for (const user of allUsers) {
            await withUserLock(user.user_id, async () => {
                const freshUser = await getUser(user.user_id);
                if (!freshUser) {
                    return;
                }

                freshUser.mines.forEach(mine => {
                    if (!mine.barriers || mine.barriers.length < mineRegions.length) {
                        mine.barriers = mine.barriers || [];
                        mineRegions.forEach((region, index) => {
                            if (!mine.barriers[index]) {
                                mine.barriers[index] = {
                                    ...region,
                                    unlocked: index === 0
                                };
                            }
                        });
                    }

                    mine.barriers.forEach(barrier => {
                        if (barrier.unlock_time && Date.now() >= barrier.unlock_time) {
                            barrier.unlocked = true;
                            barrier.unlock_time = null;
                        }
                    });
                });

                await updateUser(freshUser.user_id, freshUser);
            });
        }
    } catch (error) {
        logError('handleBarrierUnlockTime', error);
    }
}

// Function to handle boost timers
async function handleBoostTimers() {
    try {
        const allUsers = await getAllUsers();

        for (const user of allUsers) {
            await withUserLock(user.user_id, async () => {
                const freshUser = await getUser(user.user_id);
                if (!freshUser) {
                    return;
                }

                freshUser.active_boosts = freshUser.active_boosts || [];
                freshUser.active_boosts = freshUser.active_boosts.filter(boost => boost.end_time > Date.now());
                await updateUser(freshUser.user_id, freshUser);
            });
        }
    } catch (error) {
        logError('handleBoostTimers', error);
    }
}

// Function to check if the bot is online based on the readyAt property
async function isBotOnline(client) {
    if (client.readyAt) {
        return true; // Bot is online if readyAt is set
    } else {
        console.warn('Bot is not ready or offline.');
        return false;
    }
}

// Retry mechanism for status check
async function retryOnlineCheck(client, retries = 5) {
    let isOnline = await isBotOnline(client);
    while (!isOnline && retries > 0) {
        console.warn(`Retrying online check... (${retries} attempts remaining)`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
        isOnline = await isBotOnline(client);
        retries--;
    }
    return isOnline;
}

// Main function to initialize bot tasks when online
async function initializeBotTasks(client) {
    const isOnline = await retryOnlineCheck(client);
    if (isOnline) {
        console.log('Bot is confirmed to be online. Proceeding with updates.');
		
		// Updates the bot status
        await updateBotStatus(client);

        // Deploy slash commands on bot startup
        await deployCommands(clientId, token, client.slashCommands);

        // Load and initialize guild data
        await scheduleNextUpdate(client);
    } else {
        console.error('Failed to confirm bot online status after multiple retries. Skipping updates.');
    }
}

client.once('ready', async () => {
    console.log('Bot is online!');
    console.log(`Logged in as ${client.user.tag}`);

    // Check if the bot is online and proceed with task initialization
    await initializeBotTasks(client);
});

client.on('guildCreate', async (guild) => {
    // Get the user who added the bot to the guild
    let owner;
    try {
        owner = await guild.fetchOwner();
    } catch (error) {
        logError('guildCreate:fetchOwner', error, { guildId: guild?.id, guildName: guild?.name });
        return;
    }

    try {
        // Send a DM to the owner
        await guildDM(owner.user, `Thank you for adding me to ${guild.name}! I'm here to help you manage your mining experience for your entire guild. Use im!help to see what I can do!`);
    } catch (error) {
        logError('guildCreate:dmOwner', error, { guildId: guild?.id, guildName: guild?.name, ownerId: owner?.id });
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Determine if message starts with a valid prefix or mentions the bot
    let prefix = prefixes.find(p => message.content.startsWith(p));
    const botMention = `<@${client.user.id}>`;
    if (!prefix && !message.content.includes(botMention)) return;

    // Handle idle cash collection if the user mentions the bot
    if (message.content.includes(botMention)) {
        const userId = message.author.id;
        let user;
        try {
            user = await getUser(userId);
        } catch (error) {
            logError('messageCreate:getUser', error, { userId });
            return;
        }
        if (user) {
            const currentTime = Date.now();
            const isIdle = currentTime - user.last_idle > 10 * 60 * 1000;

            if (isIdle) {
                const currentMine = user.mines.find(mine => mine.mine_name === user.current_mine);
                if (!currentMine) {
                    await safeReply(message, 'Current mine data not found.');
                    return;
                }

                try {
                    await handleManagerWork(user, userId);
                    
                    // Check automation status for informative message
                    const autoStatus = getManagerAutomationStatus(currentMine);
                    const managedTiers = getManagedShaftTiers(currentMine);
                    const bottleneck = currentMine._lastBottleneck;
                    
                    let replyMessage;
                    if (user.idle_cash > 0) {
                        replyMessage = `💰 You have collected **${numberFormat(user.idle_cash)}** cash from your idle workers!`;
                        
                        // Show bottleneck info if available
                        if (bottleneck && bottleneck.efficiency < 1) {
                            const limitingName = bottleneck.limitingFactor.replace('_', ' ');
                            replyMessage += `\n⚠️ **Bottleneck:** ${limitingName} (${(bottleneck.efficiency * 100).toFixed(0)}% efficiency)`;
                        }
                        
                        // Show workflow breakdown
                        if (bottleneck && bottleneck.rates) {
                            const shaftRate = bottleneck.rates.find(r => r.name === 'shaft_production');
                            const elevatorRate = bottleneck.rates.find(r => r.name === 'elevator_extraction');
                            const warehouseRate = bottleneck.rates.find(r => r.name === 'warehouse_transport');
                            replyMessage += `\n\n📊 **Workflow Rates:**`;
                            replyMessage += `\n⛏️ Shafts: ${numberFormat(shaftRate?.rate || 0)}/s (cap: ${numberFormat(shaftRate?.capacity || 0)})`;
                            replyMessage += `\n🛗 Elevator: ${numberFormat(elevatorRate?.rate || 0)}/s (cap: ${numberFormat(elevatorRate?.capacity || 0)})`;
                            replyMessage += `\n🏭 Warehouse: ${numberFormat(warehouseRate?.rate || 0)}/s (cap: ${numberFormat(warehouseRate?.capacity || 0)})`;
                        }
                    } else if (managedTiers.length === 0) {
                        replyMessage = `⚠️ No idle cash generated. You need at least one shaft manager.`;
                        replyMessage += `\n💡 Hire and assign a manager to any shaft tier to enable production.`;
                    } else if (!autoStatus.elevator || !autoStatus.warehouse) {
                        const missing = [];
                        if (!autoStatus.elevator) missing.push('elevator');
                        if (!autoStatus.warehouse) missing.push('warehouse');
                        replyMessage = `⚠️ No idle cash generated. Missing managers in: ${missing.join(', ')}`;
                        replyMessage += `\n💡 Hire and assign managers to elevator and warehouse to transport minerals.`;
                    } else if (bottleneck && bottleneck.efficiency === 0) {
                        replyMessage = `⚠️ Your mine is fully automated but production is stalled. Check that shafts have workers and all components have capacity.`;
                    } else {
                        replyMessage = `💤 Your managers are working, but no cash was accumulated yet. Check back later!`;
                    }
                    
                    await safeReply(message, replyMessage);
                    await withUserLock(userId, async () => {
                        const collectUser = await getUser(userId);
                        if (!collectUser) {
                            return;
                        }

                        collectUser.cash += collectUser.idle_cash || 0;
                        collectUser.idle_cash = 0;
                        collectUser.last_idle = currentTime;
                        await updateUser(userId, collectUser);
                    });
                } catch (error) {
                    logError('messageCreate:collectIdle', error, { userId });
                }
            } else {
                const timeSinceLastActive = Math.floor((currentTime - user.last_idle) / 1000);
                const remainingIdleTime = Math.max(0, 600 - timeSinceLastActive);
                const minutes = Math.floor(remainingIdleTime / 60);
                const seconds = remainingIdleTime % 60;
                
                await safeReply(message, `⏳ You need to be idle for **10 minutes** to collect idle cash.\nTime remaining: ${minutes}m ${seconds}s`);
            }
        } else {
            await safeReply(message, 'User data not found.');
        }
    }

    // Handle commands
    if (prefix) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = client.commands.get(commandName);
        if (!command) return;

        try {
            await command.execute(message, args);
        } catch (error) {
            logError('prefixCommand:execute', error, { commandName, userId: message?.author?.id, guildId: message?.guild?.id });
            await safeReply(message, 'There was an error trying to execute that command!');
        } finally {
            await markUserAsActive(message?.author?.id);
        }
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isCommand()) {
        const command = client.slashCommands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            logError('slashCommand:execute', error, { commandName: interaction?.commandName, userId: interaction?.user?.id, guildId: interaction?.guildId });
            if (!interaction.replied) {
                await safeReply(interaction, { content: 'There was an error executing this command!', ephemeral: true });
            } else {
                await safeReply(interaction, { content: 'There was an error executing this command!', ephemeral: true });
            }
        } finally {
            await markUserAsActive(interaction?.user?.id);
        }
    } 
	
	// Handle Select Menus
    else if (interaction.isStringSelectMenu()) {
        try {
            await handleSelectMenuInteraction(interaction);
        } catch (error) {
            logError('selectMenu:unhandled', error, { customId: interaction?.customId, userId: interaction?.user?.id, guildId: interaction?.guildId });
            await safeReply(interaction, { content: 'There was an error trying to process the selection menu!', ephemeral: true });
        } finally {
            await markUserAsActive(interaction?.user?.id);
        }

    // Handle Buttons
    } else if (interaction.isButton()) {
		try {
            await handleButtonInteraction(interaction);
        } catch (error) {
            logError('button:unhandled', error, { customId: interaction?.customId, userId: interaction?.user?.id, guildId: interaction?.guildId });
            await safeReply(interaction, { content: 'There was an error trying to process that button!', ephemeral: true });
        } finally {
            await markUserAsActive(interaction?.user?.id);
        }
		
	// Handle Modal Forms
    } else if (interaction.isModalSubmit()) {
		try {
            await handleModalFormInteraction(interaction);
        } catch (error) {
            logError('modal:unhandled', error, { customId: interaction?.customId, userId: interaction?.user?.id, guildId: interaction?.guildId });
            await safeReply(interaction, { content: 'There was an error trying to submit this form!', ephemeral: true });
        } finally {
            await markUserAsActive(interaction?.user?.id);
        }
		
    } else {
        console.error('Received an unhandled interaction type.');
    }
});

// Centralized Error Handler
function handleInteractionError(interaction, errorMessage) {
    if (!interaction.replied) {
        safeReply(interaction, { content: errorMessage, ephemeral: true });
    } else {
        safeReply(interaction, { content: errorMessage, ephemeral: true });
    }
}

// Handle Select Menu Interaction
async function handleSelectMenuInteraction(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    const user = await getUser(userId);

    try {
        // Handle selection menu interactions
    } catch (error) {
        handleInteractionError(interaction, 'There was an error trying to process the selection menu!');
        console.error('Error executing select menu interaction:', error);
    }
}

// Handle Button Interaction
async function handleButtonInteraction(interaction) {
    const customId = interaction.customId;
	const userId = interaction.user.id;
    const user = await getUser(userId);

    try {
        // Handle button interactions
    } catch (error) {
        handleInteractionError(interaction, 'There was an error trying to process that button!');
        console.error('Error executing button interaction:', error);
    }
}

// Handle Modal Form Interaction
async function handleModalFormInteraction(interaction) {
    const customId = interaction.customId;
	const userId = interaction.user.id;
    const user = await getUser(userId);

    try {
        // Handle modal form interactions
    } catch (error) {
        handleInteractionError(interaction, 'There was an error trying to submit this form!');
        console.error('Error executing modal form interaction:', error);  
    }
}

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log(' Starting Idle Miner Bot...');
console.log(' Initializing database connection...');

const dbStatus = await initializeDatabase();

if (!dbStatus.allReady) {
    console.warn('  Warning: Database tables may be missing. Some features may not work correctly.');
    console.warn('   Run the SQL shown above in your Supabase dashboard to create missing tables.');
}

// Log in to Discord
client.login(token);
