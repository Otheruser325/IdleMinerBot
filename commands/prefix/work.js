import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import numberFormat from '../../utils/numberFormat.js';
import shaftDataJson from '../../config/shaftData.json' with { type: 'json' };
import elevatorDataJson from '../../config/elevatorData.json' with { type: 'json' };
import warehouseDataJson from '../../config/warehouseData.json' with { type: 'json' };
import {
    applyIncomeMultiplier,
    applyShaftIncomeBeam,
    applyElevatorIncomeBeam,
    applyMiningSpeedBoost,
    applyLoadingSpeedBoost,
    isManagerAssigned,
    isShaftTierManaged
} from '../../utils/managerAbilities.js';
import {
    getElevatorSegmentTravelTimeMs,
    getShaftTravelTimeMs,
    getWarehouseTravelTimeMs
} from '../../utils/movementTimes.js';
import { getCashField, getCashLabelByField } from '../../utils/continentLooker.js';

const shaftData = shaftDataJson.shaftData;
const elevatorData = elevatorDataJson.elevatorData;
const warehouseData = warehouseDataJson.warehouseData;

const activeWorkSessions = new Map();
const areaCooldowns = new Map();
const AREA_COOLDOWN_MS = 2000;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getAreaKey(userId, area) {
    return `${userId}-${area}`;
}

function isAreaOnCooldown(userId, area) {
    const key = getAreaKey(userId, area);
    const cooldownEnd = areaCooldowns.get(key);
    return Boolean(cooldownEnd && Date.now() < cooldownEnd);
}

function getAreaCooldownRemaining(userId, area) {
    const key = getAreaKey(userId, area);
    const cooldownEnd = areaCooldowns.get(key);
    if (!cooldownEnd) {
        return 0;
    }

    return Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000));
}

function setAreaCooldown(userId, area) {
    const key = getAreaKey(userId, area);
    areaCooldowns.set(key, Date.now() + AREA_COOLDOWN_MS);
}

function hasActiveWorkInArea(userId, area) {
    return activeWorkSessions.has(getAreaKey(userId, area));
}

function startWorkSession(userId, area) {
    activeWorkSessions.set(getAreaKey(userId, area), { area, startTime: Date.now() });
}

function endWorkSession(userId, area) {
    activeWorkSessions.delete(getAreaKey(userId, area));
    setAreaCooldown(userId, area);
}

function ensureLogistics(currentMine) {
    if (!currentMine.elevator || currentMine.elevator.length === 0) {
        currentMine.elevator = [{
            level: 1,
            last_worked_on: 0,
            speed: elevatorData[0].Speed || 0.5,
            capacity: elevatorData[0].Capacity,
            loading_per_second: elevatorData[0].LoadingPerSecond,
            total_deposit: 0
        }];
    }
}

function ensureWarehouse(currentMine) {
    if (!currentMine.warehouse || currentMine.warehouse.length === 0) {
        currentMine.warehouse = [{
            level: 1,
            last_worked_on: 0,
            number_of_workers: warehouseData[0].NumberOfWorkers || 1,
            capacity_per_worker: warehouseData[0].CapacityPerWorker,
            worker_walking_speed_per_second: warehouseData[0].WorkerWalkingSpeedPerSecond,
            loading_per_second: warehouseData[0].LoadingPerSecond,
            total_deposit: 0
        }];
    }
}

export default {
    name: 'work',
    description: 'Operate your mineshafts, elevator or warehouse.',
    usage: '<subcommand> [tier]',
    exampleUsage: 'v work shaft 1 | v work elevator | v work warehouse',
    async execute(message, args) {
        const userId = message.author.id;

        return withUserLock(userId, async () => {
            const user = await getUser(userId);

            if (!user) {
                return message.reply('You need to start the game first by using `im!start` (or `/start` if using slash).');
            }

            const currentMine = user.mines.find(mine => mine.mine_name === user.current_mine);
            if (!currentMine) {
                return message.reply('Current mine data not found.');
            }

            if (args.length < 1) {
                return message.reply(`<@${userId}>, to start working your __${currentMine.mine_name}__, you'll need to do: use either **shaft**, **elevator** or **warehouse** as the subcommand to operate them in your mine. For shafts, you'll need to use **im!work shaft (shaftNum)** to operate a specific mineshaft in a specified order of their tier you own (i.e. **im!work shaft 1**).`);
            }

            const subcommand = args[0].toLowerCase();

            switch (subcommand) {
                case 'shaft': {
                    const tier = parseInt(args[1], 10);
                    if (isNaN(tier) || tier < 1 || tier > 40) {
                        return message.reply('Please provide a valid shaft tier number between 1 and 40. Usage: im!work shaft <tier>');
                    }

                    if (isShaftTierManaged(currentMine, tier)) {
                        return message.reply(`Shaft Tier ${tier} has a manager automating it. Use \`im!manager ability\` to activate special abilities, or remove the manager if you want to work manually on this tier.`);
                    }

                    const areaKey = `shaft-${tier}`;
                    if (hasActiveWorkInArea(userId, areaKey)) {
                        return message.reply(`Shaft Tier ${tier} is already being worked! Please wait for the current work to finish.`);
                    }

                    if (isAreaOnCooldown(userId, areaKey)) {
                        const remaining = getAreaCooldownRemaining(userId, areaKey);
                        return message.reply(`Please wait ${remaining} second(s) before working Shaft Tier ${tier} again.`);
                    }

                    startWorkSession(userId, areaKey);
                    try {
                        return await handleShaftWork(message, user, currentMine, userId, tier);
                    } finally {
                        endWorkSession(userId, areaKey);
                    }
                }
                case 'elevator': {
                    if ((!currentMine.elevator || currentMine.elevator.length === 0) && currentMine.mineshafts?.some(shaft => shaft.tier === 1)) {
                        ensureLogistics(currentMine);
                    }

                    if (!currentMine.elevator || currentMine.elevator.length === 0) {
                        return message.reply('You need to work in Mineshaft 1 before accessing the Elevator.');
                    }

                    if (isManagerAssigned(currentMine, 'elevator')) {
                        return message.reply('Your elevator manager is already automating this process. Use `im!manager ability` to activate special abilities, or remove the manager if you want to work manually.');
                    }

                    if (hasActiveWorkInArea(userId, 'elevator')) {
                        return message.reply('The elevator is already being operated! Please wait for the current work to finish.');
                    }

                    if (isAreaOnCooldown(userId, 'elevator')) {
                        const remaining = getAreaCooldownRemaining(userId, 'elevator');
                        return message.reply(`Please wait ${remaining} second(s) before operating the elevator again.`);
                    }

                    startWorkSession(userId, 'elevator');
                    try {
                        return await handleElevatorWork(message, user, currentMine, userId);
                    } finally {
                        endWorkSession(userId, 'elevator');
                    }
                }
                case 'warehouse': {
                    if (!currentMine.warehouse || currentMine.warehouse.length === 0) {
                        return message.reply('You need to work in the Elevator before accessing the Warehouse.');
                    }

                    if (isManagerAssigned(currentMine, 'warehouse')) {
                        return message.reply('Your warehouse manager is already automating this process. Use `im!manager ability` to activate special abilities, or remove the manager if you want to work manually.');
                    }

                    if (hasActiveWorkInArea(userId, 'warehouse')) {
                        return message.reply('The warehouse is already being operated! Please wait for the current work to finish.');
                    }

                    if (isAreaOnCooldown(userId, 'warehouse')) {
                        const remaining = getAreaCooldownRemaining(userId, 'warehouse');
                        return message.reply(`Please wait ${remaining} second(s) before operating the warehouse again.`);
                    }

                    startWorkSession(userId, 'warehouse');
                    try {
                        return await handleWarehouseWork(message, user, currentMine, userId);
                    } finally {
                        endWorkSession(userId, 'warehouse');
                    }
                }
                default:
                    return message.reply(`<@${userId}>! To start working your __${currentMine.mine_name}__, use either **shaft**, **elevator** or **warehouse**. For shafts, use **im!work shaft (shaftNum)**, for example **im!work shaft 1**.`);
            }
        });
    }
};

async function handleShaftWork(message, user, currentMine, userId, tier) {
    const shaft = currentMine.mineshafts.find(s => s.tier === tier);
    if (!shaft) {
        return message.reply(`You do not own a shaft of Tier ${tier} in the ${currentMine.mine_name}.`);
    }

    const now = Date.now();
    const miningTime = applyMiningSpeedBoost(4000, currentMine);

    if (shaft.last_worked_on && (now - shaft.last_worked_on < miningTime)) {
        const remainingTime = miningTime - (now - shaft.last_worked_on);
        return message.reply(`Please wait ${Math.ceil(remainingTime / 1000)} seconds for the mineshaft to fully mine minerals.`);
    }

    const shaftInfo = shaftData.find(s => s.Tier === tier && s.Level === shaft.level);
    if (!shaftInfo) {
        return message.reply(`Unable to find data for Shaft Tier ${tier} at Level ${shaft.level}.`);
    }

    const walletField = getCashField(currentMine.mine_number);

    const walkingTime = getShaftTravelTimeMs(shaft.worker_walking_speed_per_second, currentMine);

    shaft.last_worked_on = now;

    const statusMessage = await message.reply('Walking to deposit...');
    await delay(walkingTime);
    await statusMessage.edit(`Mining deposit in Shaft ${tier}...`);
    await delay(miningTime);
    await statusMessage.edit('Extracting minerals into the basket...');
    await delay(walkingTime);

    const deposit = (shaft.capacity_per_worker || 0) * (shaft.number_of_workers || 0);
    const beamResult = applyShaftIncomeBeam(deposit, currentMine);

    if (beamResult.beamAmount > 0) {
        user[walletField] = (user[walletField] || 0) + beamResult.beamAmount;
    }

    shaft.total_deposit = (shaft.total_deposit || 0) + beamResult.remainingDeposit;

    await updateUser(userId, user);

    let replyMessage = `Successfully mined minerals with Shaft Tier ${tier}. Total deposit now: ${numberFormat(shaft.total_deposit)}.`;
    if (beamResult.beamAmount > 0) {
        replyMessage += `\nIncome Beam: ${numberFormat(beamResult.beamAmount)} minerals instantly converted to cash!`;
    }

    await statusMessage.edit(replyMessage);

}

async function handleElevatorWork(message, user, currentMine, userId) {
    const elevator = currentMine.elevator?.[0];
    if (!elevator) {
        return message.reply('You need to work in Mineshaft 1 before accessing the Elevator.');
    }

    const elevatorInfo = elevatorData.find(e => e.Level === elevator.level);
    if (!elevatorInfo) {
        return message.reply('Elevator data not found.');
    }

    const now = Date.now();
    const loadingPerSecond = applyLoadingSpeedBoost(elevatorInfo.LoadingPerSecond, 'elevator', currentMine);
    const travelTime = getElevatorSegmentTravelTimeMs(elevator.speed || elevatorInfo.Speed, currentMine);
    const walletField = getCashField(currentMine.mine_number);

    if (elevator.last_worked_on && (now - elevator.last_worked_on < travelTime)) {
        const remainingTime = travelTime - (now - elevator.last_worked_on);
        return message.reply(`Please wait ${Math.ceil(remainingTime / 1000)} seconds for the elevator to finish its tasks.`);
    }

    elevator.last_worked_on = now;
    const statusMessage = await message.reply('Travelling to the shafts...');

    let totalDeposit = 0;
    let totalBeamCash = 0;
    let visitedShafts = 0;

    for (const shaft of currentMine.mineshafts) {
        const shaftDeposit = shaft.total_deposit || 0;
        if (shaftDeposit <= 0) {
            continue;
        }

        visitedShafts += 1;
        await statusMessage.edit(`Arriving at Shaft Tier ${shaft.tier}...`);
        await delay(travelTime);

        const remainingCapacity = elevator.capacity - (elevator.total_deposit || 0);
        if (remainingCapacity <= 0) {
            break;
        }

        const amountToExtract = Math.min(shaftDeposit, remainingCapacity);
        await statusMessage.edit(`Extracting ${numberFormat(amountToExtract)} minerals from Shaft Tier ${shaft.tier}...`);
        await delay((amountToExtract / loadingPerSecond) * 1000);

        const beamResult = applyElevatorIncomeBeam(amountToExtract, currentMine);
        totalBeamCash += beamResult.beamAmount || 0;

        shaft.total_deposit -= amountToExtract;
        elevator.total_deposit = (elevator.total_deposit || 0) + beamResult.remainingDeposit;
        totalDeposit += amountToExtract;

        if (elevator.total_deposit >= elevator.capacity) {
            await statusMessage.edit('Elevator is full. Returning to base...');
            break;
        }
    }

    if (totalDeposit === 0) {
        return statusMessage.edit('No minerals were extracted, as there were none available in the shafts.');
    }

    if (totalBeamCash > 0) {
        user[walletField] = (user[walletField] || 0) + totalBeamCash;
    }

    await statusMessage.edit('Travelling back to extraction base...');
    await delay(travelTime * Math.max(1, visitedShafts));
    await statusMessage.edit('Importing minerals into the deposit tank...');
    await delay((totalDeposit / loadingPerSecond) * 1000);

    const hadWarehouse = currentMine.warehouse?.length > 0;
    if (!hadWarehouse) {
        ensureWarehouse(currentMine);
    }

    await updateUser(userId, user);

    let replyMessage = `Successfully imported ${numberFormat(totalDeposit)} minerals into the deposit tank.`;
    if (totalBeamCash > 0) {
        replyMessage += `\nIncome Beam: ${numberFormat(totalBeamCash)} minerals instantly converted to cash!`;
    }

    if (!hadWarehouse) {
        replyMessage += '\nWarehouse has now been initialized. You can start moving minerals out for sale.';
    }

    await statusMessage.edit(replyMessage);
}

async function handleWarehouseWork(message, user, currentMine, userId) {
    const warehouse = currentMine.warehouse?.[0];
    const elevator = currentMine.elevator?.[0];

    if (!warehouse) {
        return message.reply('Warehouse is not initialized.');
    }

    if (!elevator || (elevator.total_deposit || 0) <= 0) {
        return message.reply('The elevator\'s deposit tank is empty.');
    }

    const warehouseInfo = warehouseData.find(w => w.Level === warehouse.level);
    if (!warehouseInfo) {
        return message.reply('Warehouse data not found.');
    }

    const walletField = getCashField(currentMine.mine_number);
    const walletLabel = getCashLabelByField(walletField);

    const now = Date.now();
    const totalWorkerCapacity = warehouseInfo.CapacityPerWorker * warehouseInfo.NumberOfWorkers;
    const extractableAmount = Math.min(elevator.total_deposit || 0, totalWorkerCapacity);
    const boostedLoadingRate = applyLoadingSpeedBoost(warehouseInfo.LoadingPerSecond, 'warehouse', currentMine);
    const loadingTime = (extractableAmount / boostedLoadingRate) * 1000;
    const walkingTime = getWarehouseTravelTimeMs(warehouseInfo.WorkerWalkingSpeedPerSecond, currentMine);

    if (warehouse.last_worked_on && (now - warehouse.last_worked_on < loadingTime + (walkingTime * 2))) {
        const remainingTime = loadingTime + (walkingTime * 2) - (now - warehouse.last_worked_on);
        return message.reply(`Please wait ${Math.ceil(remainingTime / 1000)} seconds for the warehouse to finish its tasks.`);
    }

    warehouse.last_worked_on = now;
    const statusMessage = await message.reply(`Walking into the deposit base with ${warehouseInfo.NumberOfWorkers} transporters...`);

    await delay(walkingTime);
    await statusMessage.edit('Extracting minerals from the deposit tank...');
    await delay(loadingTime);

    warehouse.total_deposit = (warehouse.total_deposit || 0) + extractableAmount;
    elevator.total_deposit -= extractableAmount;
    await updateUser(userId, user);

    await statusMessage.edit('Returning to the warehouse with extracted minerals...');
    await delay(walkingTime);
    await statusMessage.edit('Selling minerals...');

    const cashReward = warehouse.total_deposit || 0;
    warehouse.total_deposit = 0;

    const incomeResult = applyIncomeMultiplier(cashReward, currentMine);
    const finalCash = incomeResult.finalCash;
    user[walletField] = (user[walletField] || 0) + finalCash;

    await updateUser(userId, user);

    let replyMessage = `Successfully sold minerals worth ${numberFormat(cashReward)} ${walletLabel}.`;
    if (incomeResult.multiplier > 1) {
        replyMessage += `\nManager Income Multiplier: ${incomeResult.multiplier.toFixed(2)}x`;
        replyMessage += `\nTotal received: ${numberFormat(finalCash)} ${walletLabel}!`;
    }

    await statusMessage.edit(replyMessage);
}
