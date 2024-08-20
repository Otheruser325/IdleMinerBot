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

        if (!currentMine.warehouse) {
            return interaction.reply('Warehouse is not initialized.');
        }

        switch (subcommand) {
            case 'overview':
                await handleWarehouseOverview(interaction, user, currentMine);
                break;
            case 'upgrade':
                await handleWarehouseUpgrade(interaction, user, currentMine);
                break;
            default:
                return interaction.reply('Invalid subcommand. Use `overview` or `upgrade`.');
        }
    }
};

// Function to handle the "overview" subcommand for warehouse
async function handleWarehouseOverview(interaction, user, currentMine) {
    const warehouse = currentMine.warehouse;

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
        .setTitle(`Warehouse Overview (Level ${warehouse.level})`)
        .addFields(
            { name: 'Cost', value: `${numberFormat(warehouseInfo.Cost)} cash`, inline: true },
            { name: 'Number of Workers', value: `${warehouseInfo.NumberOfWorkers}`, inline: true },
            { name: 'Capacity per Worker', value: `${numberFormat(adjustedCapacityPerWorker)} units`, inline: true },
            { name: 'Worker Walking Speed', value: `${warehouseInfo.WorkerWalkingSpeedPerSecond} units/sec`, inline: true },
            { name: 'Loading Rate', value: `${numberFormat(adjustedLoadingRate)} units/sec`, inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

// Function to handle the "upgrade" subcommand for warehouse
async function handleWarehouseUpgrade(interaction, user, currentMine) {
    const warehouse = currentMine.warehouse;

    if (!warehouse) {
        return interaction.reply('Warehouse is not initialized.');
    }

    const currentLevel = warehouse.level;
    const nextLevelData = warehouseData.find(w => w.Level === currentLevel + 1);

    if (!nextLevelData) {
        return interaction.reply('Warehouse is already at the highest level.');
    }

    const mineFactor = getMineFactor(currentMine.MineName);
    const upgradeCost = nextLevelData.Cost;

    if (user.cash < upgradeCost) {
        return interaction.reply(`You need ${numberFormat(upgradeCost)} cash to upgrade the warehouse.`);
    }

    user.cash -= upgradeCost;
    warehouse.level += 1;
    warehouse.capacityPerWorker = nextLevelData.CapacityPerWorker * mineFactor; // Apply mine factor
    warehouse.workerWalkingSpeedPerSecond = nextLevelData.WorkerWalkingSpeedPerSecond;
    warehouse.loadingPerSecond = nextLevelData.LoadingPerSecond * mineFactor; // Apply mine factor

    await updateUser(user.id, user);
    await interaction.reply(`Warehouse upgraded to Level ${warehouse.level}.`);
}
