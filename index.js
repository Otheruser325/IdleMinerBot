'use strict';

import { Client, GatewayIntentBits, Collection, Events, PermissionsBitField } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';

import { deployCommands } from './deploy-commands.js';
import { getUser, forEachUserPage, updateUser, updateUserTransaction, withUserLock, removeTestUsers, markUserActive } from './dataManager.js';
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
    applyCapacityBoost,
    applyLoadingSpeedBoost
} from './utils/managerAbilities.js';
import {
    getElevatorSegmentTravelTimeMs,
    getShaftTravelTimeMs,
    getWarehouseTravelTimeMs
} from './utils/movementTimes.js';
import { getMineIdleCashPerSecond, getMineProductionPerSecond } from './utils/mineOverview.js';
import { getActiveBoostMultiplier, getActiveInstantCashSeconds, filterActiveBoosts } from './utils/boosts.js';
import { moneyAdd, moneySub, toMoney } from './utils/economyConstants.js';
import { resolveAutomationCycles, clampIdleAccrualSeconds } from './utils/automationCycles.js';
import mineRegionsJson from './config/mineRegions.json' with { type: 'json' };
import continentDataJson from './config/continentData.json' with { type: 'json' };
import {
    getCashField,
    getCashLabelByField,
    getIdleCashField,
    normalizeMineData,
    normalizeOwnedContinents
} from './utils/continentLooker.js';
import { startPremiumPaymentServer } from './utils/premiumPayments.js';
import { purgeDuplicateManagersFromMine } from './utils/managerDuplicates.js';
import {
    getInteractionContext,
    installGlobalErrorHandlers,
    safelyReplyToInteraction,
    safelyReplyToMessage,
    logError,
    wrapAsync,
    wrapCommand
} from './utils/errorHandling.js';
import { registerInteraction, getStandaloneHandler } from './utils/interactionDispatcher.js';
import {
    acknowledgeComponent,
    claimComponentAction,
    hasActiveComponentCollector,
    getComponentCollectorOwner,
    isComponentTokenOwner,
    trackComponentCollector,
    cleanupComponentMessages
} from './utils/interactionSessions.js';
import automatedTasks from './utils/automatedTasks.js';
import { initializeDatabase } from './utils/dbInit.js';
import { normalizeUserPreferences } from './utils/userPreferences.js';
import { checkCommandCooldown } from './cooldownManager.js';

EventEmitter.defaultMaxListeners = 20;
installGlobalErrorHandlers();

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const prefixes = ['im!', 'IM!', 'Im!'];
const mineRegions = mineRegionsJson.regions || [];
const continentData = continentDataJson.continents || [];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageTyping
    ]
});

client.commands = new Collection();
client.slashCommands = new Collection();
client.interactions = new Collection();
installGlobalErrorHandlers(client);

async function importModule(absolutePath) {
    const module = await import(pathToFileURL(absolutePath).href);
    return module?.default || module;
}

async function checkPermissions(target, permissions = []) {
    if (!target?.guild || !Array.isArray(permissions) || permissions.length === 0) return true;
    try {
        const member = target.member || await target.guild.members.fetch(
            target.user?.id || target.author?.id
        );
        const missing = permissions.filter(permission => {
            const flag = PermissionsBitField.Flags[permission] || permission;
            return !member?.permissions?.has(flag);
        });
        if (!missing.length) return true;
        const text = `You don't have the necessary permissions to use this command: ${missing.map(value => `\`${value}\``).join(', ')}`;
        if (target.isRepliable?.()) await safelyReplyToInteraction(target, text);
        else await safelyReplyToMessage(target, text);
        return false;
    } catch (error) {
        logError('permissions.user', error, getInteractionContext(target));
        return false;
    }
}

async function checkBotPermissions(target, permissions = []) {
    if (!target?.guild || !Array.isArray(permissions) || permissions.length === 0) return true;
    try {
        const botMember = target.guild.members.me || await target.guild.members.fetchMe();
        const permissionSet = botMember?.permissionsIn?.(target.channel) || botMember?.permissions;
        const missing = permissions.filter(permission => {
            const flag = PermissionsBitField.Flags[permission] || permission;
            return !permissionSet?.has(flag);
        });
        if (!missing.length) return true;
        const text = `I am missing the following permissions to execute this command: ${missing.map(value => `\`${value}\``).join(', ')}`;
        if (target.isRepliable?.()) await safelyReplyToInteraction(target, text);
        else await safelyReplyToMessage(target, text);
        return false;
    } catch (error) {
        logError('permissions.bot', error, getInteractionContext(target));
        return false;
    }
}

async function enforceCommandCooldown(target, commandName, { isInteraction = false } = {}) {
    const userId = target?.user?.id || target?.author?.id;
    const outcome = checkCommandCooldown(userId, commandName);
    if (!outcome.limited) return true;

    const text = `⏳ Slow down! \`${commandName}\` can be used again in ${outcome.remainingSeconds}s.`;
    if (isInteraction) await safelyReplyToInteraction(target, text);
    else await safelyReplyToMessage(target, text);
    return false;
}

for (const file of fs.readdirSync(path.join(__dirname, 'commands/interactions')).filter(file => file.endsWith('.js'))) {
    const handler = await importModule(path.join(__dirname, 'commands/interactions', file));
    // Empty placeholder modules are valid during development; only report a
    // malformed module when it actually exports an interaction-like value.
    if (!handler?.customId && typeof handler?.execute !== 'function') continue;
    if (!registerInteraction(client.interactions, handler)) {
        logError('startup:interactionValidation', new Error('Invalid interaction module shape'), { file });
    }
}

for (const file of fs.readdirSync(path.join(__dirname, 'commands/prefix')).filter(file => file.endsWith('.js'))) {
    const command = await importModule(path.join(__dirname, 'commands/prefix', file));
    if (!command?.name || typeof command.execute !== 'function') {
        logError('startup:prefixCommandValidation', new Error('Invalid prefix command module shape'), { file });
        continue;
    }
    const safeCommand = wrapCommand(command, 'prefix');
    client.commands.set(command.name, safeCommand);
    for (const alias of command.aliases || []) client.commands.set(alias, safeCommand);
}

for (const file of fs.readdirSync(path.join(__dirname, 'commands/slash')).filter(file => file.endsWith('.js'))) {
    const command = await importModule(path.join(__dirname, 'commands/slash', file));
    if (!command?.data?.name || typeof command.execute !== 'function') {
        logError('startup:slashCommandValidation', new Error('Invalid slash command module shape'), { file });
        continue;
    }
    client.slashCommands.set(command.data.name, wrapCommand(command, 'slash'));
}

// Activity marking is best-effort and must never delay a command response.
// The throttled, single-read touch lives in the data manager; here we only
// schedule it and swallow failures.
function scheduleActivityTouch(userId) {
    if (!userId) return;
    wrapAsync(async () => {
        try {
            await markUserActive(userId);
        } catch (error) {
            logError('markUserActive', error, { userId });
        }
    }, 'activity.touch')();
}

async function collectIdleCashForMention(message) {
    const userId = message?.author?.id;
    if (!userId) return false;

    let response = null;
    await withUserLock(userId, async () => {
        const initialUser = await getUser(userId);
        if (!initialUser) {
            response = 'User data not found. Use `im!start` to begin playing.';
            return;
        }

        const now = Date.now();
        const preferences = normalizeUserPreferences(initialUser.preferences, initialUser.has_premium);
        const idleThresholdMs = preferences.idle_time_minutes * 60 * 1000;
        const lastActive = Number(initialUser.last_idle || now);
        if (now - lastActive < idleThresholdMs) {
            const remainingMs = Math.max(0, idleThresholdMs - (now - lastActive));
            const minutes = Math.floor(remainingMs / 60000);
            const seconds = Math.floor((remainingMs % 60000) / 1000);
            response = `⏳ You need to be idle for **${preferences.idle_time_minutes} minutes** to collect idle cash.\nTime remaining: ${minutes}m ${seconds}s`;
            return;
        }

        // Accrue manager work first, then collect inside a single transaction so
        // the amount credited is read from the same committed row it is zeroed
        // in. The previous read-then-write could credit a stale snapshot.
        await handleManagerWork(userId);

        const collection = await updateUserTransaction(userId, current => {
            if (!current) return undefined;
            const mine = (current.mines || []).find(candidate =>
                candidate.mine_name?.toLowerCase() === current.current_mine?.toLowerCase()
            );
            if (!mine) return undefined;

            const field = getCashField(mine.mine_number);
            const idleField = getIdleCashField(mine.mine_number);
            const accrued = toMoney(current[idleField] || 0);
            current[field] = moneyAdd(current[field], accrued);
            current[idleField] = 0;
            current.last_idle = now;
            current.last_idle_accrued_at = now;
            return current;
        });

        if (!collection.committed) {
            response = 'Current mine data not found.';
            return;
        }

        const collectedUser = collection.user;
        const currentMine = collectedUser.mines.find(mine =>
            mine.mine_name?.toLowerCase() === collectedUser.current_mine?.toLowerCase()
        );
        const cashField = getCashField(currentMine.mine_number);
        const idleCashField = getIdleCashField(currentMine.mine_number);
        const idleCash = moneySub(collectedUser[cashField], toMoney(initialUser[cashField] || 0));
        const cashLabel = getCashLabelByField(cashField);
        const awayMinutes = Math.floor(Math.max(0, now - lastActive) / 60000);
        const awayHours = Math.floor(awayMinutes / 60);
        const awayTimeLabel = awayHours > 0
            ? `${awayHours}h ${awayMinutes % 60}m`
            : `${awayMinutes}m`;

        if (idleCash > 0) {
            response = `💰 You collected **${numberFormat(idleCash)}** ${cashLabel} from your idle workers!\n🕒 You were away for **${awayTimeLabel}**.`;
        } else {
            const managedTiers = getManagedShaftTiers(currentMine);
            const automation = getManagerAutomationStatus(currentMine);
            if (managedTiers.length === 0) {
                response = '⚠️ No idle cash generated. Assign a manager to at least one shaft tier first.';
            } else if (!automation.elevator || !automation.warehouse) {
                const missing = [];
                if (!automation.elevator) missing.push('elevator');
                if (!automation.warehouse) missing.push('warehouse');
                response = `⚠️ No idle cash generated. Missing managers in: ${missing.join(', ')}.`;
            } else {
                response = '💤 Your managers are working, but no idle cash was accumulated yet.';
            }
        }
    });

    return safelyReplyToMessage(message, response || 'Unable to collect idle cash right now.');
}

// Idle accrual is credited as `rate * elapsed`. The elapsed window is bounded by
// `clampIdleAccrualSeconds` so a stale `last_idle_accrued_at` cannot mint an
// arbitrarily large balance in one tick; anything older simply stops accruing.

function automateShaftWork(currentMine, managedTiers) {
    const now = Date.now();
    for (const shaft of currentMine.mineshafts || []) {
        if (!managedTiers.includes(shaft.tier)) continue;
        const miningTime = applyMiningSpeedBoost(4000, currentMine);
        const walkingTime = getShaftTravelTimeMs(shaft.worker_walking_speed_per_second, currentMine);
        const totalCycleTime = walkingTime + miningTime + walkingTime;
        if (!Number.isFinite(totalCycleTime) || totalCycleTime <= 0) continue;
        const lastWorkTime = shaft.manager_last_worked || now;
        if (!shaft.manager_last_worked) {
            shaft.manager_last_worked = now;
            continue;
        }
        const { cyclesToProcess, nextLastWorked } = resolveAutomationCycles(lastWorkTime, totalCycleTime, now);
        if (cyclesToProcess < 1) continue;
        // Advance only past the cycles actually simulated; the rest stay queued.
        shaft.manager_last_worked = nextLastWorked;

        // The deposit and beam split are constant for the tick, so compute them
        // once and scale by the cycle count instead of re-deriving per cycle.
        const deposit = (shaft.capacity_per_worker || 0) * (shaft.number_of_workers || 0);
        const beamResult = applyShaftIncomeBeam(deposit, currentMine);
        if (beamResult.beamAmount > 0) {
            currentMine._beamCash = (currentMine._beamCash || 0) + (beamResult.beamAmount * cyclesToProcess);
        }
        shaft.total_deposit = (shaft.total_deposit || 0) + (beamResult.remainingDeposit * cyclesToProcess);
    }
}

function automateElevatorWork(currentMine) {
    const elevator = currentMine.elevator?.[0];
    if (!elevator) return null;
    const now = Date.now();
    const loadingRate = applyLoadingSpeedBoost(elevator.loading_per_second || 150, 'elevator', currentMine);
    const capacity = applyCapacityBoost(elevator.capacity || 600, 'elevator', currentMine);
    const travelTime = getElevatorSegmentTravelTimeMs(elevator.speed || 0.5, currentMine);
    const managedTiers = getManagedShaftTiers(currentMine);
    const shaftCount = Math.max(1, managedTiers.length);
    const totalDeposit = (currentMine.mineshafts || [])
        .filter(shaft => managedTiers.includes(shaft.tier))
        .reduce((sum, shaft) => sum + (shaft.total_deposit || 0), 0);
    const extractable = Math.min(totalDeposit, Math.max(0, capacity - (elevator.total_deposit || 0)));
    const loadingTime = extractable > 0 ? (extractable / loadingRate) * 1000 : 0;
    const cycleTime = (travelTime * shaftCount * 2) + (loadingTime * 2);
    if (!Number.isFinite(cycleTime) || cycleTime <= 0) return null;
    const lastWorkTime = elevator.manager_last_worked || now;
    if (!elevator.manager_last_worked) {
        elevator.manager_last_worked = now;
        return null;
    }
    const { cyclesToProcess, nextLastWorked } = resolveAutomationCycles(lastWorkTime, cycleTime, now);
    if (cyclesToProcess < 1) return null;
    // Advance only past the cycles actually simulated; the rest stay queued.
    elevator.manager_last_worked = nextLastWorked;

    let extracted = 0;
    let beamCash = 0;
    for (const shaft of currentMine.mineshafts || []) {
        if (!managedTiers.includes(shaft.tier)) continue;
        const remainingCapacity = capacity - (elevator.total_deposit || 0);
        if (remainingCapacity <= 0) break;
        const amount = Math.min(shaft.total_deposit || 0, remainingCapacity);
        if (amount <= 0) continue;
        const beamResult = applyElevatorIncomeBeam(amount, currentMine);
        shaft.total_deposit -= amount;
        elevator.total_deposit = (elevator.total_deposit || 0) + beamResult.remainingDeposit;
        extracted += amount;
        beamCash += beamResult.beamAmount || 0;
    }
    return { extracted, beamCash };
}

function automateWarehouseWork(currentMine, playerBoostMultiplier = 1) {
    const warehouse = currentMine.warehouse?.[0];
    const elevator = currentMine.elevator?.[0];
    if (!warehouse || !elevator) return 0;
    const workerCount = warehouse.number_of_workers || 1;
    const workerCapacity = warehouse.capacity_per_worker || 1000;
    const totalWorkerCapacity = applyCapacityBoost(workerCapacity * workerCount, 'warehouse', currentMine);
    const extractable = Math.min(elevator.total_deposit || 0, totalWorkerCapacity);
    if (extractable <= 0) return 0;
    const loadingRate = applyLoadingSpeedBoost(warehouse.loading_per_second || 250, 'warehouse', currentMine);
    const walkingTime = getWarehouseTravelTimeMs(warehouse.worker_walking_speed_per_second, currentMine);
    const cycleTime = (extractable / loadingRate) * 1000 + (walkingTime * 2);
    if (!Number.isFinite(cycleTime) || cycleTime <= 0) return 0;
    const now = Date.now();
    const lastWorkTime = warehouse.manager_last_worked || now;
    if (!warehouse.manager_last_worked) {
        warehouse.manager_last_worked = now;
        return 0;
    }
    const { cyclesToProcess, nextLastWorked } = resolveAutomationCycles(lastWorkTime, cycleTime, now);
    if (cyclesToProcess < 1) return 0;
    // Advance only past the cycles actually simulated; the rest stay queued.
    warehouse.manager_last_worked = nextLastWorked;

    let totalCash = 0;
    for (let index = 0; index < cyclesToProcess; index += 1) {
        const extracted = Math.min(extractable, elevator.total_deposit || 0);
        elevator.total_deposit = Math.max(0, (elevator.total_deposit || 0) - extracted);
        totalCash += applyIncomeMultiplier(extracted, currentMine, playerBoostMultiplier).finalCash;
    }
    return totalCash;
}

async function handleManagerWork(userId) {
    if (!userId) return;

    await updateUserTransaction(userId, async user => {
        if (!user) return undefined;

        user.mines = user.mines || [];
        user.current_mine = user.current_mine || user.mines[0]?.mine_name;
        const currentMine = user.mines.find(mine => mine.mine_name?.toLowerCase() === user.current_mine?.toLowerCase());
        if (!currentMine) return undefined;
        currentMine.managers = currentMine.managers || { shaft: [], elevator: [], warehouse: [] };
        currentMine.mineshafts = currentMine.mineshafts || [];
        currentMine.elevator = currentMine.elevator || [];
        currentMine.warehouse = currentMine.warehouse || [];

        const currentTime = Date.now();
        const idleMinutes = Math.max(1, Math.min(60, Number(user.preferences?.idle_time_minutes || 10)));
        const isIdle = currentTime - (user.last_idle || currentTime) > idleMinutes * 60 * 1000;
        const cashField = getCashField(currentMine.mine_number);
        const idleCashField = getIdleCashField(currentMine.mine_number);
        let generatedCash = 0;

        if (isIdle) {
            const accrualStart = Number(user.last_idle_accrued_at || user.last_idle || currentTime);
            // Clamp the accrual window: a process that was down for weeks, or a
            // document carrying a stale/hostile timestamp, must not convert an
            // unbounded gap into a single windfall. Negative windows (clock moved
            // backwards) credit nothing.
            const elapsedSeconds = clampIdleAccrualSeconds((currentTime - accrualStart) / 1000);
            generatedCash = getMineIdleCashPerSecond(currentMine, user.has_premium) * elapsedSeconds;
            user.last_idle_accrued_at = currentTime;
        } else {
            const managedTiers = getManagedShaftTiers(currentMine);
            if (managedTiers.length > 0) {
                automateShaftWork(currentMine, managedTiers);
                if (currentMine._beamCash > 0) {
                    user[cashField] = moneyAdd(user[cashField], currentMine._beamCash);
                    currentMine._beamCash = 0;
                }
            }

            if (getManagerAutomationStatus(currentMine).elevator) {
                const elevatorResult = automateElevatorWork(currentMine);
                if (elevatorResult?.beamCash > 0) user[cashField] = moneyAdd(user[cashField], elevatorResult.beamCash);
            }
            if (getManagerAutomationStatus(currentMine).warehouse) {
                generatedCash = automateWarehouseWork(currentMine, getActiveBoostMultiplier(user, currentTime));
            }
            user.last_idle_accrued_at = currentTime;
        }

        if (generatedCash > 0) {
            const boostMultiplier = getActiveBoostMultiplier(user, currentTime);
            generatedCash = toMoney(generatedCash * boostMultiplier);
            user[isIdle ? idleCashField : cashField] = moneyAdd(user[isIdle ? idleCashField : cashField], generatedCash);
        }

        // Instant-cash items are paid once, on the next manager tick, then
        // removed so they cannot pay out again.
        const instantSeconds = getActiveInstantCashSeconds(user, currentTime);
        if (instantSeconds > 0) {
            const rate = Math.max(
                getMineIdleCashPerSecond(currentMine, user.has_premium),
                getMineProductionPerSecond(currentMine)
            );
            user[cashField] = moneyAdd(user[cashField], toMoney(rate * instantSeconds));
            user.active_boosts = filterActiveBoosts(user.active_boosts, currentTime).filter(boost => {
                const seconds = Number(boost?.instant_cash ?? boost?.instantCash ?? 0);
                return !(Number.isFinite(seconds) && seconds > 0);
            });
        }

        return user;
    });
}

async function handleMissingData() {
    await forEachUserPage(async row => {
        const userId = row.id || row.data?.user_id || row.data?.userId;
        if (!userId) return;

        try {
            // Mutate the freshly read row inside the optimistic transaction. This
            // mirrors VivacityAPI's backfill contract: maintenance may add
            // missing structure, but it must never write a stale full snapshot
            // over a command that committed concurrently.
            await updateUserTransaction(userId, currentUser => {
                if (!currentUser) return undefined;
                let changed = false;

                if (!currentUser.username) {
                    currentUser.username = 'Unknown';
                    changed = true;
                }
                if (!currentUser.user_id) {
                    currentUser.user_id = currentUser.userId || userId;
                    changed = true;
                }
                if (!currentUser.userId) {
                    currentUser.userId = currentUser.user_id || userId;
                    changed = true;
                }

                const normalizedContinents = normalizeOwnedContinents(
                    currentUser.continents || [continentData[0]?.ContinentName || 'Start Continent']
                );
                if (JSON.stringify(normalizedContinents) !== JSON.stringify(currentUser.continents)) {
                    currentUser.continents = normalizedContinents;
                    changed = true;
                }

                const sourceMines = Array.isArray(currentUser.mines) ? currentUser.mines : [];
                const normalizedMines = sourceMines.map(sourceMine => {
                    const mine = normalizeMineData(sourceMine);
                    if (JSON.stringify(mine) !== JSON.stringify(sourceMine)) changed = true;

                    for (const [field, fallback] of [
                        ['mineshafts', []],
                        ['elevator', []],
                        ['warehouse', []],
                        ['managers', { shaft: [], elevator: [], warehouse: [] }]
                    ]) {
                        if (mine[field] === undefined || mine[field] === null) {
                            mine[field] = structuredClone(fallback);
                            changed = true;
                        }
                    }

                    if (!Array.isArray(mine.barriers) || mine.barriers.length < mineRegions.length) {
                        const barriers = Array.isArray(mine.barriers) ? mine.barriers : [];
                        mine.barriers = [...barriers];
                        mineRegions.forEach((region, index) => {
                            if (!mine.barriers[index]) {
                                mine.barriers[index] = { ...region, unlocked: index === 0 };
                                changed = true;
                            }
                        });
                    }
                    return mine;
                });
                if (!Array.isArray(currentUser.mines) || normalizedMines.length !== currentUser.mines.length) {
                    changed = true;
                }
                currentUser.mines = normalizedMines;

                if (!currentUser.current_continent) {
                    currentUser.current_continent = 'Start Continent';
                    changed = true;
                }
                if (!currentUser.current_mine) {
                    currentUser.current_mine = currentUser.mines[0]?.mine_name || null;
                    changed = true;
                }

                return changed ? currentUser : undefined;
            });
        } catch (error) {
            logError('handleMissingData:user', error, { userId });
        }
    });
}

async function handleBarrierUnlockTime() {
    await forEachUserPage(async row => {
        const userId = row.id || row.data?.user_id || row.data?.userId;
        if (!userId) return;
        try {
            await updateUserTransaction(userId, currentUser => {
                if (!currentUser) return undefined;
                let changed = false;
                for (const mine of Array.isArray(currentUser.mines) ? currentUser.mines : []) {
                    for (const barrier of Array.isArray(mine?.barriers) ? mine.barriers : []) {
                        if (barrier && barrier.unlock_time && Date.now() >= Number(barrier.unlock_time)) {
                            barrier.unlocked = true;
                            barrier.unlock_time = null;
                            changed = true;
                        }
                    }
                }
                return changed ? currentUser : undefined;
            });
        } catch (error) {
            logError('handleBarrierUnlockTime:user', error, { userId });
        }
    });
}

async function handleBoostTimers() {
    await forEachUserPage(async row => {
        const userId = row.id || row.data?.user_id || row.data?.userId;
        if (!userId) return;
        try {
            await updateUserTransaction(userId, currentUser => {
                if (!currentUser) return undefined;
                const activeBoosts = Array.isArray(currentUser.active_boosts) ? currentUser.active_boosts : [];
                const boosts = activeBoosts.filter(boost => Number(boost?.end_time) > Date.now());
                return boosts.length !== activeBoosts.length
                    ? { ...currentUser, active_boosts: boosts }
                    : undefined;
            });
        } catch (error) {
            logError('handleBoostTimers:user', error, { userId });
        }
    });
}

async function handleDuplicateManagerPurge(clientInstance) {
    await forEachUserPage(async row => {
        const userId = row.id || row.data?.user_id || row.data?.userId;
        if (!userId) return;
        try {
            const dmLines = [];
            let updated = false;
            await updateUserTransaction(userId, currentUser => {
                if (!currentUser) return undefined;
                let changedThisAttempt = false;
                dmLines.length = 0;
                for (const mine of Array.isArray(currentUser.mines) ? currentUser.mines : []) {
                    const result = purgeDuplicateManagersFromMine(currentUser, mine);
                    if (!result) continue;
                    changedThisAttempt = true;
                    dmLines.push(result.compensationEvents.map(event =>
                        `- ${mine.mine_name} | ${event.area}: ${event.managerName} (${event.managerDisplayId}) -> ${numberFormat(event.compensation)} ${event.walletLabel}`
                    ).join('\n'));
                }
                updated = changedThisAttempt;
                return changedThisAttempt ? currentUser : undefined;
            });
            if (updated && dmLines.length && clientInstance?.users?.fetch) {
                try {
                    const discordUser = await clientInstance.users.fetch(userId);
                    await discordUser.send(`Duplicate managers were purged automatically and compensated:\n${dmLines.join('\n')}`);
                } catch (error) {
                    logError('handleDuplicateManagerPurge:dm', error, { userId });
                }
            }
        } catch (error) {
            logError('handleDuplicateManagerPurge:user', error, { userId });
        }
    });
}

function scheduleNextUpdate(clientInstance) {
    return automatedTasks.scheduleAutomatedTasks({
        client: clientInstance,
        updateStatus: () => updateBotStatus(clientInstance),
        missingData: handleMissingData,
        dailyProperties: async () => undefined,
        barrierUnlocks: handleBarrierUnlockTime,
        boostTimers: handleBoostTimers,
        managerWork: async () => {
            await forEachUserPage(async row => {
                const userId = row.id || row.data?.user_id || row.data?.userId;
                if (!userId) return;
                try {
                    await handleManagerWork(userId);
                } catch (error) {
                    logError('cron.handleManagerWork:user', error, { userId });
                }
                await delay(100);
            });
        },
        duplicateManagerPurge: () => handleDuplicateManagerPurge(clientInstance)
    });
}

async function initializeBotTasks(clientInstance) {
    if (!clientInstance.readyAt) {
        console.warn('Bot is not ready or offline.');
        return;
    }
    console.log('Bot is confirmed to be online. Proceeding with updates.');
    await Promise.allSettled([
        updateBotStatus(clientInstance),
        cleanupComponentMessages(clientInstance, { closeAll: true })
    ]);

    automatedTasks.runStartupTasks({
        client: clientInstance,
        startupTasks: [
            ['removeTestUsers', removeTestUsers],
            ['handleMissingData', handleMissingData],
            ['handleBarrierUnlockTime', handleBarrierUnlockTime],
            ['handleBoostTimers', handleBoostTimers],
            ['handleDuplicateManagerPurge', () => handleDuplicateManagerPurge(clientInstance)]
        ]
    });

    scheduleNextUpdate(clientInstance);
    await deployCommands(clientId, token, clientInstance.slashCommands);
}

client.once(Events.ClientReady, wrapAsync(async () => {
    console.log('Bot is online!');
    console.log(`Logged in as ${client.user.tag}`);
    await initializeBotTasks(client);
}, 'event.clientReady'));

client.on('guildCreate', wrapAsync(async guild => {
    const owner = await guild.fetchOwner();
    await guildDM(owner.user, `Thank you for adding me to ${guild.name}! I'm here to help you manage your mining experience for your entire guild. Use im!help to see what I can do!`);
}, 'event.guildCreate'));

client.on('messageCreate', wrapAsync(async message => {
    if (message.author.bot) return;
    const mention = client.user?.id ? new RegExp(`^<@!?${client.user.id}>`) : null;
    const prefix = prefixes.find(value => message.content.startsWith(value));
    const mentionMatch = mention?.exec(message.content);
    const activePrefix = mentionMatch ? mentionMatch[0] : prefix;
    if (!activePrefix) return;

    const remainder = message.content.slice(activePrefix.length).trim();
    if (mentionMatch && !remainder) {
        if (!await enforceCommandCooldown(message, 'hello')) return;
        const helloCommand = client.commands.get('hello');
        if (helloCommand) return helloCommand.execute(message, []);
        return safelyReplyToMessage(message, 'Hello fellow miner! Ready to dig some precious jewels?');
    }

    const normalizedRemainder = prefixes.some(value => remainder.startsWith(value))
        ? remainder.slice(remainder.indexOf('!') + 1).trim()
        : remainder;
    const args = normalizedRemainder ? normalizedRemainder.split(/ +/) : [];
    const commandName = args.shift()?.toLowerCase();
    if (!commandName) return;
    const command = client.commands.get(commandName);
    if (!command) return;
    message.commandPrefix = activePrefix;
    if (!await enforceCommandCooldown(message, commandName)) return;
    const requiredPermissions = command.permissions || ['SendMessages', 'ViewChannel', 'ReadMessageHistory'];
    if (!await checkPermissions(message, requiredPermissions)) return;
    if (!await checkBotPermissions(message, ['SendMessages', 'ViewChannel', 'ReadMessageHistory'])) return;
    await command.execute(message, args);
    scheduleActivityTouch(message.author.id);
}, 'event.messageCreate', async (_error, message) => {
    await safelyReplyToMessage(message, 'There was an error trying to execute that command!');
}));

async function replyToBusyComponent(interaction) {
    const ownerId = getComponentCollectorOwner(interaction?.message?.id);
    if (ownerId && ownerId !== interaction?.user?.id) {
        await safelyReplyToInteraction(interaction, 'This control belongs to another user.');
    }
}

/**
 * Standalone components are addressed only by an opaque token in their custom ID,
 * so the responder must prove they own that token.
 *
 * A handler with a static (exact-string) custom ID has no per-user token and is
 * allowed through. A handler with a dynamic (RegExp) ID is user-scoped, so it
 * must declare the token prefixes it accepts and the responder must own the
 * token. A dynamic handler that declares no prefixes is refused: denying on an
 * unbound or unverifiable token is deliberate, because these handlers can spend
 * currency and an ownership check that "fails open" is worse than the control
 * doing nothing.
 */
function extractComponentToken(customId, ...prefixes) {
    const value = String(customId || '');
    for (const prefix of prefixes) {
        if (value.startsWith(prefix)) return value.slice(prefix.length);
    }
    return null;
}

function authorizeStandaloneComponent(interaction, handler) {
    if (!(handler.customId instanceof RegExp)) return true;
    const prefixes = Array.isArray(handler.tokenPrefixes) ? handler.tokenPrefixes : [];
    if (!prefixes.length) return false;
    const token = extractComponentToken(interaction.customId, ...prefixes);
    return Boolean(token) && isComponentTokenOwner(interaction, token);
}

async function handleSelectMenuInteraction(interaction) {
    if (hasActiveComponentCollector(interaction.message?.id)) {
        await replyToBusyComponent(interaction);
        return;
    }
    const handler = getStandaloneHandler(client.interactions, interaction.customId);
    if (!handler) return safelyReplyToInteraction(interaction, 'This selection menu is no longer active.');
    if (!authorizeStandaloneComponent(interaction, handler)) {
        return safelyReplyToInteraction(interaction, 'This selection menu belongs to another user.');
    }
    const release = claimComponentAction(interaction);
    if (!release) return safelyReplyToInteraction(interaction, 'That selection is already being processed.');
    try {
        if (!await acknowledgeComponent(interaction, 'interaction.selectMenu')) return;
        await handler.execute(interaction, interaction.user.id, await getUser(interaction.user.id));
    } finally {
        release();
    }
}

async function handleButtonInteraction(interaction) {
    if (hasActiveComponentCollector(interaction.message?.id)) {
        await replyToBusyComponent(interaction);
        return;
    }
    const handler = getStandaloneHandler(client.interactions, interaction.customId);
    if (!handler) return safelyReplyToInteraction(interaction, 'This button is no longer active.');
    if (!authorizeStandaloneComponent(interaction, handler)) {
        return safelyReplyToInteraction(interaction, 'This button belongs to another user.');
    }
    const release = claimComponentAction(interaction);
    if (!release) return safelyReplyToInteraction(interaction, 'That button action is already being processed.');
    try {
        if (!await acknowledgeComponent(interaction, 'interaction.button')) return;
        await handler.execute(interaction, interaction.user.id, await getUser(interaction.user.id));
    } finally {
        release();
    }
}

async function handleModalFormInteraction(interaction) {
    const handler = getStandaloneHandler(client.interactions, interaction.customId);
    if (!handler) return safelyReplyToInteraction(interaction, 'This form is no longer active.');
    const release = claimComponentAction(interaction);
    if (!release) return safelyReplyToInteraction(interaction, 'That form is already being processed.');
    try {
        if (!await acknowledgeComponent(interaction, 'interaction.modal')) return;
        await handler.execute(interaction, interaction.user.id, await getUser(interaction.user.id));
    } finally {
        release();
    }
}

client.on(Events.InteractionCreate, wrapAsync(async interaction => {
    if (interaction.isChatInputCommand?.() || interaction.isCommand?.()) {
        const command = client.slashCommands.get(interaction.commandName);
        if (!command) return safelyReplyToInteraction(interaction, 'That slash command is unavailable.');
        if (!await enforceCommandCooldown(interaction, interaction.commandName, { isInteraction: true })) return;
        const requiredPermissions = command.permissions || ['SendMessages', 'ViewChannel', 'ReadMessageHistory'];
        if (!await checkPermissions(interaction, requiredPermissions)) return;
        if (!await checkBotPermissions(interaction, ['SendMessages', 'ViewChannel', 'ReadMessageHistory'])) return;
        await command.execute(interaction);
    } else if (interaction.isStringSelectMenu?.()) {
        await handleSelectMenuInteraction(interaction);
    } else if (interaction.isButton?.()) {
        await handleButtonInteraction(interaction);
    } else if (interaction.isModalSubmit?.()) {
        await handleModalFormInteraction(interaction);
    } else {
        logError('event.interactionCreate', new Error('Received an unhandled interaction type.'), getInteractionContext(interaction));
        await safelyReplyToInteraction(interaction, 'This interaction is no longer supported.');
    }
    scheduleActivityTouch(interaction.user?.id);
}, 'event.interactionCreate', async (_error, interaction) => {
    await safelyReplyToInteraction(interaction, 'There was an error processing this interaction. Please try again.');
}));

console.log('Starting Idle Miner Bot...');
console.log('Initializing database connection...');
const dbStatus = await initializeDatabase();
if (!dbStatus.allReady) console.warn('Some database tables are missing or incompatible; run tools/supabase-init.sql.');
await startPremiumPaymentServer(client);

if (!token) {
    console.error('TOKEN is missing; the bot cannot log in.');
} else {
    wrapAsync(() => client.login(token), 'client.login')();
}
