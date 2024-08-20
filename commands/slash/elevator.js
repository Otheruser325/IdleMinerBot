const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const elevatorData = require('../../config/elevatorData.json').elevatorData;
const getMineFactor = require('../../utils/getMineFactor');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('elevator')
        .setDescription('Manage your elevator with options to view and upgrade.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('overview')
                .setDescription('View details of your elevator.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('upgrade')
                .setDescription('Upgrade your elevator.')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const user = await getUser(userId);

        if (!user) {
            return interaction.reply('You need to start the game first by using `im!start`.');
        }

        const currentMine = user.mines.find(mine => mine.MineName === user.currentMine);
        if (!currentMine) {
            return interaction.reply('Current mine data not found.');
        }

        if (!currentMine.elevator || currentMine.elevator.length === 0) {
            return interaction.reply('You need to work in Mineshaft 1 before accessing the Elevator.');
        }

        switch (subcommand) {
            case 'overview':
                await handleElevatorOverview(interaction, user, currentMine);
                break;
            case 'upgrade':
                await handleElevatorUpgrade(interaction, user, currentMine);
                break;
            default:
                return interaction.reply('Invalid subcommand. Use `overview` or `upgrade`.');
        }
    }
};

// Function to handle the "overview" subcommand for elevator
async function handleElevatorOverview(interaction, user, currentMine) {
    const elevator = currentMine.elevator[0]; // Access the first elevator object

    if (!elevator) {
        return interaction.reply('Elevator is not initialized.');
    }

    const elevatorInfo = elevatorData.find(e => e.Level === elevator.level);

    if (!elevatorInfo) {
        return interaction.reply('Elevator data not found.');
    }

    const mineFactor = getMineFactor(currentMine.MineName);
    const adjustedCapacity = elevatorInfo.Capacity * mineFactor;
    const adjustedLoadingRate = elevatorInfo.LoadingPerSecond * mineFactor;

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Elevator Overview`)
        .addFields(
            { name: 'Level', value: `${elevator.level}`, inline: true },
            { name: 'Speed', value: `${elevatorInfo.Speed} units/sec`, inline: true },
            { name: 'Capacity', value: `${numberFormat(adjustedCapacity)} units`, inline: true },
            { name: 'Loading Rate', value: `${numberFormat(adjustedLoadingRate)} units/sec`, inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

// Function to handle the "upgrade" subcommand for elevator
async function handleElevatorUpgrade(interaction, user, currentMine) {
    const elevator = currentMine.elevator[0]; // Access the first elevator object

    if (!elevator) {
        return interaction.reply('Elevator is not initialized.');
    }

    const currentLevel = elevator.level;
    const nextLevelData = elevatorData.find(e => e.Level === currentLevel + 1);

    if (!nextLevelData) {
        return interaction.reply('Elevator is already at the highest level.');
    }

    const mineFactor = getMineFactor(currentMine.MineName);
    const upgradeCost = nextLevelData.UpgradeCost;

    if (user.cash < upgradeCost) {
        return interaction.reply(`You need ${numberFormat(upgradeCost)} cash to upgrade the elevator.`);
    }

    user.cash -= upgradeCost;
    elevator.level += 1;
    elevator.speed = nextLevelData.Speed;
    elevator.capacity = nextLevelData.Capacity * mineFactor; // Apply mine factor
    elevator.loadingPerSecond = nextLevelData.LoadingPerSecond * mineFactor; // Apply mine factor

    await updateUser(user.id, user);
    await interaction.reply(`Elevator upgraded to Level ${elevator.level}.`);
}
