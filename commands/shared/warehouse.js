import { getUser, commitUserSnapshot, withUserLock } from '../../dataManager.js';
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
import { getMaxGroundLevel } from '../../utils/miscConfig.js';
import { scaleMineCost } from '../../utils/mineDifficulty.js';
import { getCashField, getCashLabelByField } from '../../utils/continentLooker.js';
import { getMineNumber } from '../../utils/mineLooker.js';
import { parsePurchaseAmount } from '../../utils/purchaseAmount.js';
import { moneyAdd } from '../../utils/economyConstants.js';
import { planUpgrade } from '../../utils/upgradeEngine.js';
import commandContext from './context.js';

const warehouseData = warehouseDataJson.warehouses || [];

export default {
    name: 'warehouse',
    description: 'Manage your warehouse with options to view and upgrade.',
    usage: '<subcommand>',
    exampleUsage: 'v warehouse overview | v warehouse upgrade',
    async execute(message, args = []) {
        const userId = message.user?.id || message.author?.id;
        return withUserLock(userId, async () => {
            const user = await getUser(userId);

            if (!user) {
                return message.reply(`You need to start the game first by using \`${commandContext.commandReference(message, 'start')}\`.`);
            }

            const currentMine = user.mines.find(mine => mine.mine_name === user.current_mine);
            if (!currentMine) {
                return message.reply('Current mine data not found.');
            }            if (args.length < 1) {
                return message.reply(`<@${userId}>, use **${commandContext.commandReference(message, 'warehouse', 'overview')}** to view your warehouse's performance in **__${currentMine.mine_name}__**, or **${commandContext.commandReference(message, 'warehouse', 'upgrade')}** to upgrade it. You can quick-upgrade with **${commandContext.commandReference(message, 'warehouse', 'upgrade 5')}**.`);
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
                default:            			        return message.reply(`Invalid subcommand, <@${userId}>! Use **${commandContext.commandReference(message, 'warehouse', 'overview')}** to view your warehouse or **${commandContext.commandReference(message, 'warehouse', 'upgrade')}** to upgrade it.`);
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

    const mineFactor = getMineFactor(currentMine);
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
    const walletField = getCashField(parseInt(currentMine.mine_number, 10) || getMineNumber(currentMine.mine_name));
    const walletLabel = getCashLabelByField(walletField);
    const purchaseAmount = parsePurchaseAmount(args[1]);

    if (!purchaseAmount.ok) {
        return message.reply(purchaseAmount.message);
    }

    const maxLevel = getMaxGroundLevel();
    const availableCash = user[walletField] || 0;
    const plan = planUpgrade({
        records: warehouseData,
        currentLevel: warehouse.level,
        maxLevel,
        availableCash,
        purchaseAmount,
        scaleCost: record => scaleMineCost(record.Cost, currentMine),
        superCashPerBigUpdate: 15
    });

    if (plan.affordableCount < 1) {
        if (purchaseAmount.isMax) {
            return message.reply(`You do not have enough ${walletLabel} to upgrade the warehouse any further right now.`);
        }
        return message.reply(`You do not have enough ${walletLabel} to upgrade the warehouse ${purchaseAmount.label}. Available: ${numberFormat(availableCash)} ${walletLabel}.`);
    }

    if (plan.exceededRequest) {
        if (plan.finalLevel >= maxLevel) {
            return message.reply(`The warehouse cannot be upgraded ${purchaseAmount.label} because it would exceed the maximum level of ${maxLevel}.`);
        }
        return message.reply(`You do not have enough ${walletLabel} to upgrade the warehouse ${purchaseAmount.label}. Available: ${numberFormat(availableCash)} ${walletLabel}.`);
    }

    const mineFactor = getMineFactor(currentMine);
    for (const nextWarehouseInfo of plan.appliedLevels) {
        warehouse.level = nextWarehouseInfo.Level;
        warehouse.number_of_workers = nextWarehouseInfo.NumberOfWorkers;
        warehouse.capacity_per_worker = nextWarehouseInfo.CapacityPerWorker * mineFactor;
        warehouse.worker_walking_speed_per_second = nextWarehouseInfo.WorkerWalkingSpeedPerSecond;
        warehouse.loading_per_second = nextWarehouseInfo.LoadingPerSecond * mineFactor;
    }

    user[walletField] = plan.remainingCash;
    if (plan.superCashEarned > 0) {
        user.super_cash = moneyAdd(user.super_cash, plan.superCashEarned);
    }

    await commitUserSnapshot(userId, user);

    const purchaseLabel = purchaseAmount.isMax ? `MAX (${plan.appliedCount} levels)` : purchaseAmount.label;
    return message.reply(`Warehouse upgraded to Level ${warehouse.level} using ${purchaseLabel} for ${numberFormat(plan.totalCost)} ${walletLabel} in the ${currentMine.mine_name}. ${plan.superCashEarned > 0 ? `You earned ${plan.superCashEarned} Super Cash for hitting major upgrades!` : ''}`);
}
