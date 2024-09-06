const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const warehouseData = require('../../config/warehouseData.json').warehouseData;
const getMineFactor = require('../../utils/getMineFactor');

module.exports = {
    name: 'warehouse',
    description: 'Manage your warehouse with options to view and upgrade.',
    usage: '<subcommand>',
    exampleUsage: 'v warehouse overview | v warehouse upgrade',
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

        // Lazy initialization of warehouse
        if (!currentMine.warehouse) {
            currentMine.warehouse = [];
        }

        if (currentMine.warehouse.length === 0) {
            return interaction.reply('You need to work in the Elevator before accessing the Warehouse.');
        }

        const warehouse = currentMine.warehouse[0]; // Accessing the first warehouse

        switch (subcommand) {
            case 'overview':
                await handleWarehouseOverview(message, warehouse, currentMine, userId);
                break;
            case 'upgrade':
                await handleWarehouseUpgrade(message, user, warehouse, currentMine, userId);
                break;
            default:
                return message.reply('Invalid subcommand. Use `overview` or `upgrade`.');
        }
    }
};

// Function to handle the "overview" subcommand for warehouse
async function handleWarehouseOverview(message, warehouse, currentMine, userId) {
    const warehouseInfo = warehouseData.find(w => w.Level === warehouse.level);

    if (!warehouseInfo) {
        return message.reply('Warehouse data not found.');
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

    await message.reply({ embeds: [embed] });
}

// Function to handle the "upgrade" subcommand for warehouse
async function handleWarehouseUpgrade(message, user, warehouse, currentMine, userId) {
    const currentLevel = warehouse.level;
    const nextLevelData = warehouseData.find(w => w.Level === currentLevel + 1);

    if (!nextLevelData) {
        return message.reply('Warehouse is already at the highest level.');
    }

    const mineFactor = getMineFactor(currentMine.MineName);
    const upgradeCost = nextLevelData.Cost;

    if (user.cash < upgradeCost) {
        return message.reply(`You need ${numberFormat(upgradeCost)} cash to upgrade the warehouse.`);
    }

    user.cash -= upgradeCost;
    warehouse.level += 1;
    warehouse.capacityPerWorker = nextLevelData.CapacityPerWorker * mineFactor;
    warehouse.workerWalkingSpeedPerSecond = nextLevelData.WorkerWalkingSpeedPerSecond;
    warehouse.loadingPerSecond = nextLevelData.LoadingPerSecond * mineFactor;

    await updateUser(userId, user);
    await message.reply(`Warehouse upgraded to Level ${warehouse.level}.`);
}
