const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const elevatorData = require('../../config/elevatorData.json').elevatorData;
const getMineFactor = require('../../utils/getMineFactor');

module.exports = {
    name: 'elevator',
    description: 'Manage your elevator with options to view and upgrade.',
    usage: '<subcommand>',
    exampleUsage: 'v elevator overview | v elevator upgrade',
    async execute(message, args) {
        const userId = message.author.id;
        const user = await getUser(userId);

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        const currentMine = user.mines.find(mine => mine.mine_name === user.current_mine);
        if (!currentMine) {
            return message.reply('Current mine data not found.');
        }

        if (args.length < 1) {
            return message.reply(`<@${userId}>, to operate your elevator, you'll need to use **im!elevator overview** to view your elevator's performance in your **__${currentMine.mine_name}__** or **im!elevator upgrade** to upgrade your elevator (you can also quick-upgrade using **im!elevator upgrade 5** for example for 5 purchased elevator levels, if you have the cash for it!)`);
        }

        const subcommand = args[0].toLowerCase();

        // Lazy initialization of elevator
        if (!currentMine.elevator) {
            currentMine.elevator = [];
        }

        if (currentMine.elevator.length === 0) {
            return message.reply('You need to work in Mineshaft 1 before accessing the Elevator.');
        }

        const elevator = currentMine.elevator[0]; // Accessing the first elevator

        switch (subcommand) {
            case 'overview':
                await handleElevatorOverview(message, user, elevator, currentMine, args, userId);
                break;
            case 'upgrade':
                await handleElevatorUpgrade(message, user, elevator, currentMine, args, userId);
                break;
            default:
                return message.reply(`Invalid subcommand, <@${userId}>! To operate your elevator, you'll need to use **im!elevator overview** to view your elevator's performance in your **__${currentMine.mine_name}__** or **im!elevator upgrade** to upgrade your elevator (you can also quick-upgrade using **im!elevator upgrade 5** for example for 5 purchased elevator levels, if you have the cash for it!)`);
        }
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

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Elevator Overview in ${currentMine.mine_name} (Level ${elevator.level})`)
        .addFields(
            { name: 'Speed', value: `${elevatorInfo.Speed} units/sec`, inline: true },
            { name: 'Capacity', value: `${numberFormat(adjustedCapacity)} units`, inline: true },
            { name: 'Loading Rate', value: `${numberFormat(adjustedLoadingRate)} units/sec`, inline: true },
            { name: 'Total Deposit', value: `${numberFormat(elevatorInfo.total_deposit)}`, inline: true }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// Function to handle the "upgrade" subcommand for the elevator
async function handleElevatorUpgrade(message, user, elevator, currentMine, args, userId) {
    const upgradeCount = args[1] ? parseInt(args[1], 10) : 1; // Optional argument for upgrade count

    if (isNaN(upgradeCount) || upgradeCount < 1) {
        return message.reply('Please provide a valid number of upgrades (positive integer).');
    }

    let totalCost = 0;
    let superCashEarned = 0;
    let lastLevel = elevator.level;
    const maxLevel = 4000;

    // Calculate total cost and check for max level
    for (let i = 0; i < upgradeCount; i++) {
        const nextLevel = lastLevel + 1;

        if (nextLevel > maxLevel) {
            return message.reply(`Your Elevator is currently maxed out and cannot be upgraded any further.`);
        }

        const nextElevatorInfo = elevatorData.find(e => e.Level === nextLevel);

        if (!nextElevatorInfo) {
            return message.reply(`There is no upgrade available for the elevator at Level ${nextLevel}.`);
        }

        totalCost += nextElevatorInfo.Cost;
        lastLevel = nextLevel;
    }

    if (user.cash < totalCost) {
        return message.reply(`You do not have enough Cash to upgrade the elevator ${upgradeCount} times. Total Cost: ${numberFormat(totalCost)}`);
    }

    // Apply upgrades
    let currentLevel = elevator.level;
    for (let i = 0; i < upgradeCount; i++) {
        const nextLevel = currentLevel + 1;
        const nextElevatorInfo = elevatorData.find(e => e.Level === nextLevel);

        if (nextElevatorInfo) {
            user.cash -= nextElevatorInfo.Cost;
            elevator.level = nextLevel;
            elevator.speed = nextElevatorInfo.Speed;
            elevator.capacity = nextElevatorInfo.Capacity * getMineFactor(currentMine.mine_name);
            elevator.loading_per_second = nextElevatorInfo.LoadingPerSecond * getMineFactor(currentMine.mine_name);

            if (nextElevatorInfo.BigUpdate === 1) {
                superCashEarned += nextElevatorInfo.SuperCashReward;
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

    return message.reply(`Elevator upgraded to Level ${elevator.level} for ${numberFormat(totalCost)} Cash in the ${currentMine.mine_name}. ${superCashEarned > 0 ? `You earned ${superCashEarned} Super Cash for hitting major upgrades!` : ''}`);
}