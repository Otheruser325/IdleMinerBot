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
        if (args.length < 1) {
            return message.reply('Please provide a subcommand: `overview` or `upgrade`.');
        }

        const subcommand = args[0].toLowerCase();
        const userId = message.author.id;
        const user = await getUser(userId);

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        const currentMine = user.mines.find(mine => mine.MineName === user.currentMine);
        if (!currentMine) {
            return message.reply('Current mine data not found.');
        }

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
                return message.reply('Invalid subcommand. Use `overview` or `upgrade`.');
        }
    }
};

// Function to handle the "overview" subcommand for elevator
async function handleElevatorOverview(message, user, elevator, currentMine, args, userId) {
    const elevatorInfo = elevatorData.find(e => e.Level === elevator.level);

    if (!elevatorInfo) {
        return message.reply('Elevator data not found.');
    }

    const mineFactor = getMineFactor(currentMine.MineName);
    const adjustedCapacity = elevatorInfo.Capacity * mineFactor;
    const adjustedLoadingRate = elevatorInfo.LoadingPerSecond * mineFactor;

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Elevator Overview in ${currentMine.MineName} (Level ${elevator.level})`)
        .addFields(
            { name: 'Speed', value: `${elevatorInfo.Speed} units/sec`, inline: true },
            { name: 'Capacity', value: `${numberFormat(adjustedCapacity)} units`, inline: true },
            { name: 'Loading Rate', value: `${numberFormat(adjustedLoadingRate)} units/sec`, inline: true },
            { name: 'Total Deposit', value: `${numberFormat(elevatorInfo.totalDeposit)}`, inline: true }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// Function to handle the "upgrade" subcommand for elevator
async function handleElevatorUpgrade(message, user, elevator, currentMine, args, userId) {
	const levelsToUpgrade = args[1] ? parseInt(args[1], 10) : 1; // Optional argument for number of levels to upgrade
    const currentLevel = elevator.level;
    let totalCost = 0;
    let superCashEarned = 0;
    let lastLevel = currentLevel;

    // Iterate over the number of levels to upgrade
    for (let i = 0; i < levelsToUpgrade; i++) {
        const nextLevelData = elevatorData.find(e => e.Level === lastLevel + 1);

        if (!nextLevelData) {
            return message.reply(`Elevator is already at the highest level, or no data is available for Level ${lastLevel + 1}.`);
        }

        totalCost += nextLevelData.Cost;

        if (user.cash < totalCost) {
            return message.reply(`You need ${numberFormat(totalCost)} cash to upgrade the elevator by ${levelsToUpgrade} levels.`);
        }

        // Track if it's a "Big Update" to award SuperCash
        if (nextLevelData.BigUpdate === 1) {
            superCashEarned += nextLevelData.SuperCashReward;
        }

        lastLevel++; // Increase the last level processed
    }

    // Deduct the total cost
    user.cash -= totalCost;

    // Apply the upgrade to the elevator
    const mineFactor = getMineFactor(currentMine.MineName);
    const finalLevelData = elevatorData.find(e => e.Level === lastLevel);

    elevator.level = lastLevel;
    elevator.speed = finalLevelData.Speed;
    elevator.capacity = finalLevelData.Capacity * mineFactor;
    elevator.loadingPerSecond = finalLevelData.LoadingPerSecond * mineFactor;

    // Add Super Cash if earned
    if (superCashEarned > 0) {
        user.superCash = (user.superCash || 0) + superCashEarned;
    }

    await updateUser(userId, user);
    await message.reply(`Elevator upgraded to Level ${elevator.level} for ${numberFormat(totalCost)} cash. ${superCashEarned > 0 ? `You earned ${superCashEarned} Super Cash for hitting major upgrades!` : ''}`);
}