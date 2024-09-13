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
                .addIntegerOption(option =>
                    option
                        .setName('upgrade_count')
                        .setDescription('The number of levels to upgrade.')
                        .setRequired(false)
                )
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

        // Lazy initialization of elevator
        if (!currentMine.elevator) {
            currentMine.elevator = [];
        }

        if (currentMine.elevator.length === 0) {
            return interaction.reply('You need to work in Mineshaft 1 before accessing the Elevator.');
        }
		
		const elevator = currentMine.elevator[0]; // Access the first elevator object

        switch (subcommand) {
            case 'overview':
                await handleElevatorOverview(interaction, user, elevator, currentMine, userId);
                break;
            case 'upgrade':
                await handleElevatorUpgrade(interaction, user, elevator, currentMine, userId);
                break;
            default:
                return interaction.reply('Invalid subcommand. Use `overview` or `upgrade`.');
        }
    }
};

// Function to handle the "overview" subcommand for elevator
async function handleElevatorOverview(interaction, user, elevator, currentMine, userId) {
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
        .setTitle(`Elevator Overview in ${currentMine.MineName} (Level ${elevator.level})`)
        .addFields(
            { name: 'Speed', value: `${elevatorInfo.Speed} units/sec`, inline: true },
            { name: 'Capacity', value: `${numberFormat(adjustedCapacity)} units`, inline: true },
            { name: 'Loading Rate', value: `${numberFormat(adjustedLoadingRate)} units/sec`, inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

// Function to handle the "upgrade" subcommand for elevator
async function handleElevatorUpgrade(interaction, user, elevator, currentMine, userId) {
	const levelsToUpgrade = interaction.options.getInteger('upgrade_count') || 1;
    const currentLevel = elevator.level;
    let totalCost = 0;
    let superCashEarned = 0;
    let lastLevel = currentLevel;

    // Iterate over the number of levels to upgrade
    for (let i = 0; i < levelsToUpgrade; i++) {
        const nextLevelData = elevatorData.find(e => e.Level === lastLevel + 1);

        if (!nextLevelData) {
            return interaction.reply(`Elevator is already at the highest level, or no data is available for Level ${lastLevel + 1}.`);
        }

        totalCost += nextLevelData.UpgradeCost;

        if (user.cash < totalCost) {
            return interaction.reply(`You need ${numberFormat(totalCost)} cash to upgrade the elevator by ${levelsToUpgrade} levels.`);
        }

        // Track if it's a "Big Update" to award SuperCash
        if (nextLevelData.BigUpdate === 1) {
            superCashEarned += nextLevelData.SuperCashReward;
        }

        lastLevel++; // Increment the last level processed
    }

    // Deduct the total cost
    user.cash -= totalCost;

    // Apply the final upgrade to the elevator
    const mineFactor = getMineFactor(currentMine.MineName);
    const finalLevelData = elevatorData.find(e => e.Level === lastLevel);

    elevator.level = lastLevel;
    elevator.speed = finalLevelData.Speed;
    elevator.capacity = finalLevelData.Capacity * mineFactor; // Apply mine factor
    elevator.loadingPerSecond = finalLevelData.LoadingPerSecond * mineFactor; // Apply mine factor

    // Add SuperCash if earned
    if (superCashEarned > 0) {
        user.superCash = (user.superCash || 0) + superCashEarned;
    }

    await updateUser(userId, user);
    await interaction.reply(`Elevator upgraded to Level ${elevator.level} for ${numberFormat(totalCost)} cash. ${superCashEarned > 0 ? `You earned ${superCashEarned} SuperCash for hitting major upgrades!` : ''}`);
}