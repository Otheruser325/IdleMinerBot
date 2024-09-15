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
                return interaction.reply(`Invalid subcommand, <@${userId}>! To operate your elevator, you'll need to use **/elevator overview** to view your elevator's performance in your **__${currentMine.MineName}__** or **/elevator upgrade** to upgrade your elevator (you can also quick-upgrade using **/elevator upgrade 5** for example for 5 purchased elevator levels, if you have the cash for it!)`);
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
	const upgradeCount = interaction.options.getInteger('upgrade_count') || 1;
	
	if (isNaN(upgradeCount) || upgradeCount < 1) {
        return interaction.reply('Please provide a valid number of upgrades (positive integer).');
    }
	
	let totalCost = 0;
	let superCashEarned = 0;
    let lastLevel = elevator.level;
    const maxLevel = 4000;
	
	// Calculate total cost and check for max level
    for (let i = 0; i < upgradeCount; i++) {
        const nextLevel = lastLevel + 1;

        if (nextLevel > maxLevel) {
            return interaction.reply(`Your Elevator is currently maxed out and cannot be upgraded any further.`);
        }

        const nextElevatorInfo = elevatorData.find(e => e.Level === nextLevel);

        if (!nextElevatorInfo) {
            return interaction.reply(`There is no upgrade available for the elevator at Level ${nextLevel}.`);
        }

        totalCost += nextElevatorInfo.Cost;
        lastLevel = nextLevel;
    }

    if (user.cash < totalCost) {
        return interaction.reply(`You do not have enough Cash to upgrade the elevator ${upgradeCount} times. Total Cost: ${numberFormat(totalCost)}`);
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
            elevator.capacity = nextElevatorInfo.Capacity * getMineFactor(currentMine.MineName);
			elevator.loadingPerSecond = nextElevatorInfo.LoadingPerSecond * getMineFactor(currentMine.MineName);
            
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
        user.superCash = (user.superCash || 0) + superCashEarned;
    }

    await updateUser(userId, user);
    await interaction.reply(`Elevator upgraded to Level ${elevator.level} for ${numberFormat(totalCost)} cash in the ${currentMine.MineName}. ${superCashEarned > 0 ? `You earned ${superCashEarned} Super Cash for hitting major upgrades!` : ''}`);
}