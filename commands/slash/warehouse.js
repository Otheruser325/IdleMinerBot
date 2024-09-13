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
                return interaction.reply('Invalid subcommand. Use `overview` or `upgrade`.');
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
	const levelsToUpgrade = interaction.options.getInteger('upgrade_count') || 1;
    const currentLevel = warehouse.level;
    let totalCost = 0;
    let superCashEarned = 0;
    let lastLevel = currentLevel;

    // Iterate over the number of levels to upgrade
    for (let i = 0; i < levelsToUpgrade; i++) {
        const nextLevelData = warehouseData.find(w => w.Level === lastLevel + 1);

        if (!nextLevelData) {
            return interaction.reply(`Warehouse is already at the highest level, or no data is available for Level ${lastLevel + 1}.`);
        }

        totalCost += nextLevelData.UpgradeCost;

        if (user.cash < totalCost) {
            return interaction.reply(`You need ${numberFormat(totalCost)} cash to upgrade the warehouse by ${levelsToUpgrade} levels.`);
        }

        // Track if it's a "Big Update" to award SuperCash
        if (nextLevelData.BigUpdate === 1) {
            superCashEarned += nextLevelData.SuperCashReward;
        }

        lastLevel++; // Increment the last level processed
    }

    // Deduct the total cost
    user.cash -= totalCost;

    // Apply the final upgrade to the warehouse
    const mineFactor = getMineFactor(currentMine.MineName);
    const finalLevelData = warehouseData.find(w => w.Level === lastLevel);

    warehouse.level = lastLevel;
    warehouse.capacityPerWorker = finalLevelData.CapacityPerWorker * mineFactor; // Apply mine factor
    warehouse.workerWalkingSpeedPerSecond = finalLevelData.WorkerWalkingSpeedPerSecond;
    warehouse.loadingPerSecond = finalLevelData.LoadingPerSecond * mineFactor; // Apply mine factor

    // Add SuperCash if earned
    if (superCashEarned > 0) {
        user.superCash = (user.superCash || 0) + superCashEarned;
    }

    await updateUser(userId, user);
    await interaction.reply(`Warehouse upgraded to Level ${warehouse.level} for ${numberFormat(totalCost)} cash. ${superCashEarned > 0 ? `You earned ${superCashEarned} SuperCash for hitting major upgrades!` : ''}`);
}