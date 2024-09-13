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
        const userId = message.author.id;
        const user = await getUser(userId);

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        const currentMine = user.mines.find(mine => mine.MineName === user.currentMine);
        if (!currentMine) {
            return message.reply('Current mine data not found.');
        }
		
		if (args.length < 1) {
            return message.reply(`<@${userId}>, to operate your warehouse, you'll need to use **im!warehouse overview** to view your warehouse's performance in your **${currentMine.MineName}** or **im!warehouse upgrade** to upgrade your warehouse (you can also quick-upgrade using **im!warehouse upgrade 5** for example for 5 purchased warehouse levels, if you have the cash for it!)`);
        }
		
		const subcommand = args[0].toLowerCase();

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
                await handleWarehouseOverview(message, user, warehouse, currentMine, args, userId);
                break;
            case 'upgrade':
                await handleWarehouseUpgrade(message, user, warehouse, currentMine, args, userId);
                break;
            default:
			    return message.reply(`Invalid subcommand, <@${userId}>! To operate your warehouse, you'll need to use **im!warehouse overview** to view your warehouse's performance in your **${currentMine.MineName}** or **im!warehouse upgrade** to upgrade your warehouse (you can also quick-upgrade using **im!warehouse upgrade 5** for example for 5 purchased warehouse levels, if you have the cash for it!).`);
        }
    }
};

// Function to handle the "overview" subcommand for warehouse
async function handleWarehouseOverview(message, user, warehouse, currentMine, args, userId) {
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
async function handleWarehouseUpgrade(message, user, warehouse, currentMine, args, userId) {
	const levelsToUpgrade = args[1] ? parseInt(args[1], 10) : 1; // Optional argument for number of levels to upgrade
    const currentLevel = warehouse.level;
	let totalCost = 0;
    let superCashEarned = 0;
	let lastLevel = currentLevel;
	
	// Iterate over the number of levels to upgrade
    for (let i = 0; i < levelsToUpgrade; i++) {
        const nextLevelData = warehouseData.find(e => e.Level === lastLevel + 1);

        if (!nextLevelData) {
            return message.reply(`Warehouse is already at the highest level, or no data is available for Level ${lastLevel + 1}.`);
        }

        totalCost += nextLevelData.Cost;

        if (user.cash < totalCost) {
            return message.reply(`You need ${numberFormat(totalCost)} cash to upgrade the Warehouse by ${levelsToUpgrade} levels.`);
        }

        // Track if it's a "Big Update" to award SuperCash
        if (nextLevelData.BigUpdate === 1) {
            superCashEarned += nextLevelData.SuperCashReward;
        }

        lastLevel++; // Increase the last level processed
    }
	
	// Deduct the total cost
    user.cash -= totalCost;

    // Apply the upgrade to the warehouse
    const mineFactor = getMineFactor(currentMine.MineName);
    const finalLevelData = warehouseData.find(w => w.Level === lastLevel);

    warehouse.level = lastLevel;
	warehouse.numberOfWorkers = finalLevelData.NumberOfWorkers;
    warehouse.capacityPerWorker = finalLevelData.CapacityPerWorker * mineFactor;
    warehouse.workerWalkingSpeedPerSecond = finalLevelData.WorkerWalkingSpeedPerSecond;
    warehouse.loadingPerSecond = finalLevelData.LoadingPerSecond * mineFactor;
	
	// Add Super Cash if earned
    if (superCashEarned > 0) {
        user.superCash = (user.superCash || 0) + superCashEarned;
    }

    await updateUser(userId, user);
    await message.reply(`Warehouse upgraded to Level ${warehouse.level} for ${numberFormat(totalCost)} cash in the ${currentMine.MineName}. ${superCashEarned > 0 ? `You earned ${superCashEarned} Super Cash for hitting major upgrades!` : ''}`);
}
