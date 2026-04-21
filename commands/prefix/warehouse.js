import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import { EmbedBuilder } from 'discord.js';
import numberFormat from '../../utils/numberFormat.js';
import warehouseDataJson from '../../config/warehouseData.json' with { type: 'json' };
import getMineFactor from '../../utils/getMineFactor.js';
import {
    applyCapacityBoost,
    applyLoadingSpeedBoost,
    formatActiveAreaAbilities,
    getActiveEffects
} from '../../utils/managerAbilities.js';
import { getWarehouseTravelTimeMs } from '../../utils/movementTimes.js';

const warehouseData = warehouseDataJson.warehouseData;

export default {
    name: 'warehouse',
    description: 'Manage your warehouse with options to view and upgrade.',
    usage: '<subcommand>',
    exampleUsage: 'v warehouse overview | v warehouse upgrade',
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
                return message.reply(`<@${userId}>, to operate your warehouse, you'll need to use **im!warehouse overview** to view your warehouse's performance in your **__${currentMine.mine_name}__** or **im!warehouse upgrade** to upgrade your warehouse (you can also quick-upgrade using **im!warehouse upgrade 5** for example for 5 purchased warehouse levels, if you have the cash for it!)`);
            }
		
		    const subcommand = args[0].toLowerCase();

            if (!currentMine.warehouse) {
                currentMine.warehouse = [];
            }

            if (currentMine.warehouse.length === 0) {
                return message.reply('You need to work in the Elevator before accessing the Warehouse.');
            }

            const warehouse = currentMine.warehouse[0];

            switch (subcommand) {
                case 'overview':
                    return handleWarehouseOverview(message, user, warehouse, currentMine, args, userId);
                case 'upgrade':
                    return handleWarehouseUpgrade(message, user, warehouse, currentMine, args, userId);
                default:
			        return message.reply(`Invalid subcommand, <@${userId}>! To operate your warehouse, you'll need to use **im!warehouse overview** to view your warehouse's performance in your **__${currentMine.mine_name}__** or **im!warehouse upgrade** to upgrade your warehouse (you can also quick-upgrade using **im!warehouse upgrade 5** for example for 5 purchased warehouse levels, if you have the cash for it!).`);
            }
        });
    }
};

// Function to handle the "overview" subcommand for warehouse
async function handleWarehouseOverview(message, user, warehouse, currentMine, args, userId) {
    const warehouseInfo = warehouseData.find(w => w.Level === warehouse.level);

    if (!warehouseInfo) {
        return message.reply('Warehouse data not found.');
    }

    const mineFactor = getMineFactor(currentMine.mine_name);
    const adjustedCapacityPerWorker = warehouseInfo.CapacityPerWorker * mineFactor;
    const adjustedLoadingRate = warehouseInfo.LoadingPerSecond * mineFactor;
    const effects = getActiveEffects(currentMine);
    const baseWalkingTime = 4000 / Math.max(warehouseInfo.WorkerWalkingSpeedPerSecond || 1, 1);
    const boostedWalkingTime = getWarehouseTravelTimeMs(warehouse.worker_walking_speed_per_second || warehouseInfo.WorkerWalkingSpeedPerSecond, currentMine);
    const boostedCapacityPerWorker = applyCapacityBoost(adjustedCapacityPerWorker, 'warehouse', currentMine);
    const boostedLoadingRate = applyLoadingSpeedBoost(adjustedLoadingRate, 'warehouse', currentMine);
    const boostedIncome = effects.income_multiplier.warehouse > 1
        ? `${effects.income_multiplier.warehouse.toFixed(2)}x sale value`
        : 'No income multiplier active';

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Warehouse Overview in ${currentMine.mine_name}`)
        .addFields(
            { name: 'Level', value: `${warehouse.level}`, inline: true },
            { name: 'Number of Workers', value: `${warehouseInfo.NumberOfWorkers}`, inline: true },
            { name: 'Capacity per Worker', value: boostedCapacityPerWorker !== adjustedCapacityPerWorker ? `${numberFormat(adjustedCapacityPerWorker)} -> ${numberFormat(boostedCapacityPerWorker)} units` : `${numberFormat(adjustedCapacityPerWorker)} units`, inline: true },
            { name: 'Walking Speed', value: `${warehouseInfo.WorkerWalkingSpeedPerSecond} units/sec`, inline: true },
            { name: 'Walking Time', value: boostedWalkingTime !== baseWalkingTime ? `${(baseWalkingTime / 1000).toFixed(2)}s -> ${(boostedWalkingTime / 1000).toFixed(2)}s per trip` : `${(baseWalkingTime / 1000).toFixed(2)}s per trip`, inline: true },
            { name: 'Loading Rate', value: boostedLoadingRate !== adjustedLoadingRate ? `${numberFormat(adjustedLoadingRate)} -> ${numberFormat(boostedLoadingRate)} units/sec` : `${numberFormat(adjustedLoadingRate)} units/sec`, inline: true },
            { name: 'Income Effect', value: boostedIncome, inline: true },
            { name: 'Active Ability Boosts', value: formatActiveAreaAbilities(currentMine, 'warehouse'), inline: false }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// Function to handle the "upgrade" subcommand for the warehouse
async function handleWarehouseUpgrade(message, user, warehouse, currentMine, args, userId) {
    const upgradeCount = args[1] ? parseInt(args[1], 10) : 1; // Optional argument for upgrade count

    if (isNaN(upgradeCount) || upgradeCount < 1) {
        return message.reply('Please provide a valid number of upgrades (positive integer).');
    }

    let totalCost = 0;
    let superCashEarned = 0;
    let lastLevel = warehouse.level;
    const maxLevel = 4000;

    // Calculate total cost and check for max level
    for (let i = 0; i < upgradeCount; i++) {
        const nextLevel = lastLevel + 1;

        if (nextLevel > maxLevel) {
            return message.reply(`Your Warehouse is currently maxed out and cannot be upgraded any further.`);
        }

        const nextWarehouseInfo = warehouseData.find(w => w.Level === nextLevel);

        if (!nextWarehouseInfo) {
            return message.reply(`There is no upgrade available for the warehouse at Level ${nextLevel}.`);
        }

        totalCost += nextWarehouseInfo.Cost;
        lastLevel = nextLevel;
    }

    if (user.cash < totalCost) {
        return message.reply(`You do not have enough Cash to upgrade the warehouse ${upgradeCount} times. Total Cost: ${numberFormat(totalCost)}`);
    }

    // Apply upgrades
    let currentLevel = warehouse.level;
    for (let i = 0; i < upgradeCount; i++) {
        const nextLevel = currentLevel + 1;
        const nextWarehouseInfo = warehouseData.find(w => w.Level === nextLevel);

        if (nextWarehouseInfo) {
			user.cash -= nextWarehouseInfo.Cost;
			warehouse.level = lastLevel;
	        warehouse.number_of_workers = nextWarehouseInfo.NumberOfWorkers;
            warehouse.capacity_per_worker = nextWarehouseInfo.CapacityPerWorker * getMineFactor(currentMine.mine_name);
            warehouse.worker_walking_speed_per_second = nextWarehouseInfo.WorkerWalkingSpeedPerSecond;
            warehouse.loading_per_second = nextWarehouseInfo.LoadingPerSecond * getMineFactor(currentMine.mine_name);
            
            if (nextWarehouseInfo.BigUpdate === 1) {
                superCashEarned += 15;
            }

            currentLevel = nextLevel;
        } else {
            break; // Stop upgrading if no further upgrades are available
        }
    }

    // Add Super Cash if earned
    if (superCashEarned > 0) {
        user.super_cash = (user.super_cash || 0) + superCashEarned;
    }

    await updateUser(userId, user);

    return message.reply(`Warehouse upgraded to Level ${warehouse.level} for ${numberFormat(totalCost)} Cash in the ${currentMine.mine_name}. ${superCashEarned > 0 ? `You earned ${superCashEarned} Super Cash for hitting major upgrades!` : ''}`);
}
