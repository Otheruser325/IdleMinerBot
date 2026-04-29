import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import { EmbedBuilder } from 'discord.js';
import numberFormat from '../../utils/numberFormat.js';
import elevatorDataJson from '../../config/elevatorData.json' with { type: 'json' };
import getMineFactor from '../../utils/getMineFactor.js';
import {
    applyCapacityBoost,
    applyLoadingSpeedBoost,
    formatActiveAreaAbilities,
    getActiveEffects
} from '../../utils/managerAbilities.js';
import { getElevatorSegmentTravelTimeMs } from '../../utils/movementTimes.js';
import { getMaxElevatorLevel } from '../../utils/miscConfig.js';
import { scaleMineCost } from '../../utils/mineDifficulty.js';
import { getCashField, getCashLabelByField } from '../../utils/continentLooker.js';
import { getMineNumber } from '../../utils/mineLooker.js';
import { parsePurchaseAmount } from '../../utils/purchaseAmount.js';

const elevatorData = elevatorDataJson.elevatorData;

export default {
    name: 'elevator',
    description: 'Manage your elevator with options to view and upgrade.',
    usage: '<subcommand>',
    exampleUsage: 'v elevator overview | v elevator upgrade',
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
                return message.reply(`<@${userId}>, to operate your elevator, you'll need to use **im!elevator overview** to view your elevator's performance in your **__${currentMine.mine_name}__** or **im!elevator upgrade** to upgrade your elevator (you can also quick-upgrade using **im!elevator upgrade 5** for example for 5 purchased elevator levels, if you have the cash for it!)`);
            }

            const subcommand = args[0].toLowerCase();

            if (!currentMine.elevator) {
                currentMine.elevator = [];
            }

            if (currentMine.elevator.length === 0) {
                return message.reply('You need to work in Mineshaft 1 before accessing the Elevator.');
            }

            const elevator = currentMine.elevator[0];

            switch (subcommand) {
                case 'overview':
                    return handleElevatorOverview(message, user, elevator, currentMine, args, userId);
                case 'upgrade':
                    return handleElevatorUpgrade(message, user, elevator, currentMine, args, userId);
                default:
                    return message.reply(`Invalid subcommand, <@${userId}>! To operate your elevator, you'll need to use **im!elevator overview** to view your elevator's performance in your **__${currentMine.mine_name}__** or **im!elevator upgrade** to upgrade your elevator (you can also quick-upgrade using **im!elevator upgrade 5** for example for 5 purchased elevator levels, if you have the cash for it!)`);
            }
        });
    }
};

// Function to handle the "overview" subcommand for elevator
async function handleElevatorOverview(message, user, elevator, currentMine, args, userId) {
    const elevatorInfo = elevatorData.find(e => e.Level === elevator.level);

    if (!elevatorInfo) {
        return message.reply('Elevator data not found.');
    }

    const mineFactor = getMineFactor(currentMine.mine_name);
    const adjustedCapacity = elevatorInfo.Capacity * mineFactor;
    const adjustedLoadingRate = elevatorInfo.LoadingPerSecond * mineFactor;
    const effects = getActiveEffects(currentMine);
    const baseTravelTime = 1000 / Math.max(elevatorInfo.Speed || 1, 0.1);
    const boostedTravelTime = getElevatorSegmentTravelTimeMs(elevator.speed || elevatorInfo.Speed, currentMine);
    const boostedCapacity = applyCapacityBoost(adjustedCapacity, 'elevator', currentMine);
    const boostedLoadingRate = applyLoadingSpeedBoost(adjustedLoadingRate, 'elevator', currentMine);
    const boostedIncome = effects.income_multiplier.elevator > 1
        ? `${effects.income_multiplier.elevator.toFixed(2)}x sale value`
        : 'No income multiplier active';

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Elevator Overview in ${currentMine.mine_name}`)
        .addFields(
            { name: 'Level', value: `${elevator.level}`, inline: true },
            { name: 'Speed', value: `${elevatorInfo.Speed} units/sec`, inline: true },
            { name: 'Travel Time', value: boostedTravelTime !== baseTravelTime ? `${(baseTravelTime / 1000).toFixed(2)}s -> ${(boostedTravelTime / 1000).toFixed(2)}s per trip` : `${(baseTravelTime / 1000).toFixed(2)}s per trip`, inline: true },
            { name: 'Capacity', value: boostedCapacity !== adjustedCapacity ? `${numberFormat(adjustedCapacity)} -> ${numberFormat(boostedCapacity)} units` : `${numberFormat(adjustedCapacity)} units`, inline: true },
            { name: 'Loading Rate', value: boostedLoadingRate !== adjustedLoadingRate ? `${numberFormat(adjustedLoadingRate)} -> ${numberFormat(boostedLoadingRate)} units/sec` : `${numberFormat(adjustedLoadingRate)} units/sec`, inline: true },
            { name: 'Income Effect', value: boostedIncome, inline: true },
            { name: 'Total Deposit', value: `${numberFormat(elevator.total_deposit)}`, inline: true },
            { name: 'Active Ability Boosts', value: formatActiveAreaAbilities(currentMine, 'elevator'), inline: false }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// Function to handle the "upgrade" subcommand for the elevator
async function handleElevatorUpgrade(message, user, elevator, currentMine, args, userId) {
    const walletField = getCashField(parseInt(currentMine.mine_number, 10) || getMineNumber(currentMine.mine_name));
    const walletLabel = getCashLabelByField(walletField);
    const purchaseAmount = parsePurchaseAmount(args[1]);

    if (!purchaseAmount.ok) {
        return message.reply(purchaseAmount.message);
    }

    let totalCost = 0;
    let superCashEarned = 0;
    let lastLevel = elevator.level;
    const maxLevel = getMaxElevatorLevel();
    const desiredUpgradeCount = purchaseAmount.isMax ? Infinity : purchaseAmount.amount;
    let affordableUpgradeCount = 0;
    let availableCash = user[walletField] || 0;

    for (let i = 0; i < desiredUpgradeCount; i++) {
        const nextLevel = lastLevel + 1;

        if (nextLevel > maxLevel) {
            break;
        }

        const nextElevatorInfo = elevatorData.find(e => e.Level === nextLevel);

        if (!nextElevatorInfo) {
            break;
        }

        const nextCost = scaleMineCost(nextElevatorInfo.Cost, currentMine);
        if (availableCash < nextCost) {
            break;
        }

        totalCost += nextCost;
        availableCash -= nextCost;
        lastLevel = nextLevel;
        affordableUpgradeCount++;
    }

    if (affordableUpgradeCount < 1) {
        if (purchaseAmount.isMax) {
            return message.reply(`You do not have enough ${walletLabel} to upgrade the elevator any further right now.`);
        }

        return message.reply(`You do not have enough ${walletLabel} to upgrade the elevator ${purchaseAmount.label}. Available: ${numberFormat(user[walletField] || 0)} ${walletLabel}.`);
    }

    if (!purchaseAmount.isMax && affordableUpgradeCount < purchaseAmount.amount) {
        if (lastLevel >= maxLevel) {
            return message.reply(`The elevator cannot be upgraded ${purchaseAmount.label} because it would exceed the maximum level of ${maxLevel}.`);
        }

        return message.reply(`You do not have enough ${walletLabel} to upgrade the elevator ${purchaseAmount.label}. Available: ${numberFormat(user[walletField] || 0)} ${walletLabel}.`);
    }

    // Apply upgrades
    let currentLevel = elevator.level;
    for (let i = 0; i < affordableUpgradeCount; i++) {
        const nextLevel = currentLevel + 1;
        const nextElevatorInfo = elevatorData.find(e => e.Level === nextLevel);

        if (nextElevatorInfo) {
            user[walletField] -= scaleMineCost(nextElevatorInfo.Cost, currentMine);
            elevator.level = nextLevel;
            elevator.speed = nextElevatorInfo.Speed;
            elevator.capacity = nextElevatorInfo.Capacity * getMineFactor(currentMine.mine_name);
            elevator.loading_per_second = nextElevatorInfo.LoadingPerSecond * getMineFactor(currentMine.mine_name);

            if (nextElevatorInfo.BigUpdate === 1) {
                superCashEarned += 15;
            }

            currentLevel = nextLevel;
        } else {
            break;
        }
    }

    // Add Super Cash if earned
    if (superCashEarned > 0) {
        user.super_cash = (user.super_cash || 0) + superCashEarned;
    }

    await updateUser(userId, user);

    const purchaseLabel = purchaseAmount.isMax ? `MAX (${affordableUpgradeCount} levels)` : purchaseAmount.label;
    return message.reply(`Elevator upgraded to Level ${elevator.level} using ${purchaseLabel} for ${numberFormat(totalCost)} ${walletLabel} in the ${currentMine.mine_name}. ${superCashEarned > 0 ? `You earned ${superCashEarned} Super Cash for hitting major upgrades!` : ''}`);
}
