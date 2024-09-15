const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const warehouseData = require('../../config/warehouseData.json').warehouseData;
const getMineFactor = require('../../utils/getMineFactor');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warehouse')
        .setDescription('Manage your warehouse with options to view and upgrade.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('overview')
                .setDescription('View details of your warehouse.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('upgrade')
                .setDescription('Upgrade your warehouse.')
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

        // Lazy initialization of warehouse
        if (!currentMine.warehouse) {
            currentMine.warehouse = [];
        }

        if (currentMine.warehouse.length === 0) {
            return interaction.reply('You need to work in the Elevator before accessing the Warehouse.');
        }
		
		const warehouse = currentMine.warehouse[0]; // Access the first warehouse object

        switch (subcommand) {
            case 'overview':
                await handleWarehouseOverview(interaction, user, warehouse, currentMine, userId);
                break;
            case 'upgrade':
                await handleWarehouseUpgrade(interaction, user, warehouse, currentMine, userId);
                break;
            default:
                return interaction.reply(`Invalid subcommand, <@${userId}>! To operate your warehouse, you'll need to use **/warehouse overview** to view your warehouse's performance in your **__${currentMine.MineName}__** or **/warehouse upgrade** to upgrade your warehouse (you can also quick-upgrade using **/warehouse upgrade 5** for example for 5 purchased warehouse levels, if you have the cash for it!).`);
        }
    }
};

// Function to handle the "overview" subcommand for warehouse
async function handleWarehouseOverview(interaction, user, warehouse, currentMine, userId) {
    if (!warehouse) {
        return interaction.reply('Warehouse is not initialized.');
    }

    const warehouseInfo = warehouseData.find(w => w.Level === warehouse.level);

    if (!warehouseInfo) {
        return interaction.reply('Warehouse data not found.');
    }

    const mineFactor = getMineFactor(currentMine.MineName);
    const adjustedCapacityPerWorker = warehouseInfo.CapacityPerWorker * mineFactor;
    const adjustedLoadingRate = warehouseInfo.LoadingPerSecond * mineFactor;

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Warehouse Overview in ${currentMine.MineName} (Level ${warehouse.level})`)
        .addFields(
            { name: 'Number of Workers', value: `${warehouseInfo.NumberOfWorkers}`, inline: true },
            { name: 'Capacity per Worker', value: `${numberFormat(adjustedCapacityPerWorker)} units`, inline: true },
            { name: 'Worker Walking Speed', value: `${warehouseInfo.WorkerWalkingSpeedPerSecond} units/sec`, inline: true },
            { name: 'Loading Rate', value: `${numberFormat(adjustedLoadingRate)} units/sec`, inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

// Function to handle the "upgrade" subcommand for warehouse
async function handleWarehouseUpgrade(interaction, user, warehouse, currentMine, userId) {
	const upgradeCount = interaction.options.getInteger('upgrade_count') || 1;
	
	if (isNaN(upgradeCount) || upgradeCount < 1) {
        return interaction.reply('Please provide a valid number of upgrades (positive integer).');
    }
	
    let totalCost = 0;
	let superCashEarned = 0;
    let lastLevel = warehouse.level;
    const maxLevel = 4000;

    // Calculate total cost and check for max level
    for (let i = 0; i < upgradeCount; i++) {
        const nextLevel = lastLevel + 1;

        if (nextLevel > maxLevel) {
            return interaction.reply(`Your Warehouse is currently maxed out and cannot be upgraded any further.`);
        }

        const nextWarehouseInfo = warehouseData.find(w => w.Level === nextLevel);

        if (!nextWarehouseInfo) {
            return interaction.reply(`There is no upgrade available for the warehouse at Level ${nextLevel}.`);
        }

        totalCost += nextWarehouseInfo.Cost;
        lastLevel = nextLevel;
    }

    if (user.cash < totalCost) {
        return interaction.reply(`You do not have enough Cash to upgrade the warehouse ${upgradeCount} times. Total Cost: ${numberFormat(totalCost)}`);
    }

    // Apply upgrades
    let currentLevel = warehouse.level;
    for (let i = 0; i < upgradeCount; i++) {
        const nextLevel = currentLevel + 1;
        const nextWarehouseInfo = warehouseData.find(w => w.Level === nextLevel);

        if (nextWarehouseInfo) {
			user.cash -= nextWarehouseInfo.Cost;
			warehouse.level = lastLevel;
	        warehouse.numberOfWorkers = nextWarehouseInfo.NumberOfWorkers;
            warehouse.capacityPerWorker = nextWarehouseInfo.CapacityPerWorker * getMineFactor(currentMine.MineName);
            warehouse.workerWalkingSpeedPerSecond = nextWarehouseInfo.WorkerWalkingSpeedPerSecond;
            warehouse.loadingPerSecond = nextWarehouseInfo.LoadingPerSecond * getMineFactor(currentMine.MineName);
            
            if (nextWarehouseInfo.BigUpdate === 1) {
                superCashEarned += nextWarehouseInfo.SuperCashReward;
            }

            currentLevel = nextLevel;
        } else {
            break; // Stop upgrading if no further upgrades are available
        }
    }

    // Add SuperCash if earned
    if (superCashEarned > 0) {
        user.superCash = (user.superCash || 0) + superCashEarned;
    }

    await updateUser(userId, user);
    await interaction.reply(`Warehouse upgraded to Level ${warehouse.level} for ${numberFormat(totalCost)} cash in the ${currentMine.MineName}. ${superCashEarned > 0 ? `You earned ${superCashEarned} Super Cash for hitting major upgrades!` : ''}`);
}