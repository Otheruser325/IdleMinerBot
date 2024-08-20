const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const elevatorData = require('../../config/elevatorData.json').elevatorData;

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

        if (!currentMine.elevator) {
            return message.reply('You need to work in Mineshaft 1 before accessing the Elevator.');
        }

        switch (subcommand) {
            case 'overview':
                await handleElevatorOverview(message, user, currentMine);
                break;
            case 'upgrade':
                await handleElevatorUpgrade(message, user, currentMine);
                break;
            default:
                return message.reply('Invalid subcommand. Use `overview` or `upgrade`.');
        }
    }
};

// Function to handle the "overview" subcommand for elevator
async function handleElevatorOverview(message, user, currentMine) {
    const elevator = currentMine.elevator;

    if (!elevator) {
        return message.reply('Elevator is not initialized.');
    }

    const elevatorInfo = elevatorData.find(e => e.Level === elevator.level);

    if (!elevatorInfo) {
        return message.reply('Elevator data not found.');
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Elevator Overview`)
        .addFields(
            { name: 'Level', value: `${elevator.level}`, inline: true },
            { name: 'Speed', value: `${elevatorInfo.Speed} units/sec`, inline: true },
            { name: 'Capacity', value: `${elevatorInfo.Capacity} units`, inline: true },
            { name: 'Loading Rate', value: `${elevatorInfo.LoadingPerSecond} units/sec`, inline: true }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// Function to handle the "upgrade" subcommand for elevator
async function handleElevatorUpgrade(message, user, currentMine) {
    const elevator = currentMine.elevator;

    if (!elevator) {
        return message.reply('Elevator is not initialized.');
    }

    const currentLevel = elevator.level;
    const nextLevelData = elevatorData.find(e => e.Level === currentLevel + 1);

    if (!nextLevelData) {
        return message.reply('Elevator is already at the highest level.');
    }

    const upgradeCost = nextLevelData.UpgradeCost; // Assume upgrade cost is part of elevatorData
    if (user.cash < upgradeCost) {
        return message.reply(`You need ${numberFormat(upgradeCost)} cash to upgrade the elevator.`);
    }

    user.cash -= upgradeCost;
    elevator.level += 1;
    elevator.speed = nextLevelData.Speed;
    elevator.capacity = nextLevelData.Capacity;
    elevator.loadingPerSecond = nextLevelData.LoadingPerSecond;

    await updateUser(user.id, user);
    await message.reply(`Elevator upgraded to Level ${elevator.level}.`);
}
