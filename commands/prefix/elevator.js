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
            return interaction.reply('You need to work in Mineshaft 1 before accessing the Elevator.');
        }

        const elevator = currentMine.elevator[0]; // Accessing the first elevator

        switch (subcommand) {
            case 'overview':
                await handleElevatorOverview(message, elevator, currentMine);
                break;
            case 'upgrade':
                await handleElevatorUpgrade(message, user, elevator, currentMine);
                break;
            default:
                return message.reply('Invalid subcommand. Use `overview` or `upgrade`.');
        }
    }
};

// Function to handle the "overview" subcommand for elevator
async function handleElevatorOverview(message, elevator, currentMine) {
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
async function handleElevatorUpgrade(message, user, elevator, currentMine) {
    const currentLevel = elevator.level;
    const nextLevelData = elevatorData.find(e => e.Level === currentLevel + 1);

    if (!nextLevelData) {
        return message.reply('Elevator is already at the highest level.');
    }

    const mineFactor = getMineFactor(currentMine.MineName);
    const upgradeCost = nextLevelData.UpgradeCost;

    if (user.cash < upgradeCost) {
        return message.reply(`You need ${numberFormat(upgradeCost)} cash to upgrade the elevator.`);
    }

    user.cash -= upgradeCost;
    elevator.level += 1;
    elevator.speed = nextLevelData.Speed;
    elevator.capacity = nextLevelData.Capacity * mineFactor;
    elevator.loadingPerSecond = nextLevelData.LoadingPerSecond * mineFactor;

    await updateUser(user.id, user);
    await message.reply(`Elevator upgraded to Level ${elevator.level}.`);
}
