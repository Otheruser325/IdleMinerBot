const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const shaftData = require('../../config/shaftData.json').shaftData;
const getMineFactor = require('../../utils/getMineFactor');

module.exports = {
    name: 'shaft',
    description: 'Manage your mineshafts with options to view, buy, or upgrade.',
    usage: '<subcommand> [arguments]',
    exampleUsage: 'v shaft buy 1 | v shaft upgrade 1 | v shaft overview 1',
    async execute(message, args) {
        const userId = message.author.id;
        const user = await getUser(userId);

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        const currentMine = user.mines.find(mine => mine.mine_name === user.current_mine);
        if (!currentMine) {
            return message.reply('Current mine data not found.');
        }
		
		if (args.length < 1) {
            return message.reply(`<@${userId}>, to operate your shafts, you'll need to use **im!shaft overview** to view your shaft's performance in your **__${currentMine.mine_name}__**, based on the tier you provide (i.e. **im!shaft overview 1**), **im!shaft buy** for purchasing a new shaft in your **__${currentMine.mine_name}__** or **im!shaft upgrade** to upgrade your shaft of your choice (i.e. **im!shaft upgrade 1**, or you can also quick-upgrade using **im!shaft upgrade 1 5** for example for 5 purchased shaft levels on the 1st shaft, if you have the cash for it!).`);
        }
		
		const subcommand = args[0].toLowerCase();

        // Lazy initialization of mineshafts
        if (!currentMine.mineshafts) {
            currentMine.mineshafts = [];
        }

        switch (subcommand) {
            case 'overview':
                await handleOverview(message, user, currentMine, args, userId);
                break;
            case 'buy':
                await handleBuy(message, user, currentMine, args, userId);
                break;
            case 'upgrade':
                await handleUpgrade(message, user, currentMine, args, userId);
                break;
            default:
                return message.reply(`Invalid subcommand, <@${userId}>! To operate your shafts, you'll need to use **im!shaft overview** to view your shaft's performance in your **__${currentMine.mine_name}__**, based on the tier you provide (i.e. **im!shaft overview 1**), **im!shaft buy** for purchasing a new shaft in your **__${currentMine.mine_name}__** or **im!shaft upgrade** to upgrade your shaft of your choice (i.e. **im!shaft upgrade 1**, or you can also quick-upgrade using **im!shaft upgrade 1 5** for example for 5 purchased shaft levels on the 1st shaft, if you have the cash for it!).`);
        }
    }
};

// Function to handle the "overview" subcommand
async function handleOverview(message, user, currentMine, args, userId) {
    const tier = parseInt(args[1], 10);

    if (isNaN(tier) || tier < 1 || tier > 40) {
        return message.reply('Please provide a valid shaft tier number between 1 and 40.');
    }

    const shaft = currentMine.mineshafts.find(s => s.tier === tier);

    if (!shaft) {
        return message.reply(`You do not own a shaft of Tier ${tier} in the ${currentMine.mine_name}.`);
    }

    // Lazy initialization of totalDeposit
    if (shaft.totalDeposit === undefined) {
        shaft.totalDeposit = 0; // Initialize to 0 if not set
    }

    const shaftInfo = shaftData.find(s => s.Tier === tier && s.Level === shaft.level);
    if (!shaftInfo) {
        return message.reply(`Unable to find data for Shaft Tier ${tier} at Level ${shaft.level}.`);
    }

    // Adjust shaft stats based on the mine's factor
    const mineFactor = getMineFactor(currentMine.mine_name);
    const adjustedGain = shaftInfo.GainPerSecondPerWorker * mineFactor;
    const adjustedCapacity = shaftInfo.CapacityPerWorker * mineFactor;

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Mineshaft Tier ${tier} Overview in ${currentMine.mine_name}`)
        .addFields(
            { name: 'Level', value: `${shaft.level}`, inline: true },
            { name: 'Workers', value: `${shaft.number_of_workers}`, inline: true },
            { name: 'Gain per Second', value: `${numberFormat(adjustedGain)}`, inline: true },
            { name: 'Capacity per Worker', value: `${numberFormat(adjustedCapacity)}`, inline: true },
            { name: 'Worker Speed', value: `${shaft.worker_walking_speed_per_second} units/sec`, inline: true },
            { name: 'Total Deposit', value: `${numberFormat(shaft.total_deposit)}`, inline: true }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// Function to handle the "buy" subcommand
async function handleBuy(message, user, currentMine, args, userId) {
    const tier = parseInt(args[1], 10);

    if (isNaN(tier) || tier < 1 || tier > 40) {
        return message.reply('Please provide a valid shaft tier number between 1 and 40.');
    }

    // Check if the shaft can be purchased based on tier order
    const previousTierShaft = currentMine.mineshafts.find(s => s.tier === tier - 1);
    if (tier > 1 && !previousTierShaft) {
        return message.reply(`You need to own Shaft Tier ${tier - 1} before purchasing Shaft Tier ${tier}.`);
    }

    // Check if there is a locked barrier preventing further shaft unlocks
    const barrierBlocking = currentMine.barriers.find(barrier => !barrier.unlocked && tier > barrier.from_tier && tier <= barrier.to_tier);
    if (barrierBlocking) {
        return message.reply(`Shaft Tier ${tier} is blocked by a barrier. Unlock the barrier from Tier ${barrierBlocking.from_tier} to Tier ${barrierBlocking.to_tier} first.`);
    }

    const existingShaft = currentMine.mineshafts.find(s => s.tier === tier);

    if (existingShaft) {
        return message.reply(`You already own a shaft of Tier ${tier} in the ${currentMine.mine_name}.`);
    }

    const shaftInfo = shaftData.find(s => s.Tier === tier && s.Level === 1);
    if (!shaftInfo) {
        return message.reply(`Invalid shaft tier provided.`);
    }

    if (user.cash < shaftInfo.Cost) {
        return message.reply(`You do not have enough Cash to buy this shaft. Cost: ${numberFormat(shaftInfo.Cost)}`);
    }

    user.cash -= shaftInfo.Cost;

    // Adjust shaft stats based on the mine's factor
    const mineFactor = getMineFactor(currentMine.mine_name);
    const adjustedGain = shaftInfo.GainPerSecondPerWorker * mineFactor;
    const adjustedCapacity = shaftInfo.CapacityPerWorker * mineFactor;

    currentMine.mineshafts.push({
        tier,
        level: 1,
        number_of_workers: shaftInfo.NumberOfWorkers,
        gain_per_second_per_worker: adjustedGain,
        capacity_per_worker: adjustedCapacity,
        worker_walking_speed_per_second: shaftInfo.WorkerWalkingSpeedPerSecond,
        total_deposit: 0
    });

    await updateUser(userId, user);

    return message.reply(`Successfully purchased Shaft Tier ${tier} for ${numberFormat(shaftInfo.Cost)} Cash in the ${currentMine.mine_name}.`);
}

// Function to handle the "upgrade" subcommand
async function handleUpgrade(message, user, currentMine, args, userId) {
    const tier = parseInt(args[1], 10);
    const upgradeCount = args[2] ? parseInt(args[2], 10) : 1; // Optional argument for upgrade count

    if (isNaN(tier) || tier < 1 || tier > 40) {
        return message.reply('Please provide a valid shaft tier number between 1 and 40.');
    }

    if (isNaN(upgradeCount) || upgradeCount < 1) {
        return message.reply('Please provide a valid number of upgrades (positive integer).');
    }

    const shaft = currentMine.mineshafts.find(s => s.tier === tier);

    if (!shaft) {
        return message.reply(`You do not own a shaft of Tier ${tier} in the ${currentMine.mine_name}.`);
    }

    let totalCost = 0;
	let superCashEarned = 0;
    let lastLevel = shaft.level;
    const maxLevel = 1000;

    // Calculate total cost and check for max level
    for (let i = 0; i < upgradeCount; i++) {
        const nextLevel = lastLevel + 1;

        if (nextLevel > maxLevel) {
            return message.reply(`Your Mineshaft Tier ${tier} is currently maxed out and cannot be upgraded any further.`);
        }

        const nextShaftInfo = shaftData.find(s => s.Tier === tier && s.Level === nextLevel);

        if (!nextShaftInfo) {
            return message.reply(`There is no upgrade available for Shaft Tier ${tier} at Level ${nextLevel}.`);
        }

        totalCost += nextShaftInfo.Cost;
        lastLevel = nextLevel;
    }

    if (user.cash < totalCost) {
        return message.reply(`You do not have enough Cash to upgrade this shaft ${upgradeCount} times. Total Cost: ${numberFormat(totalCost)}`);
    }

    // Apply upgrades
    let currentLevel = shaft.level;
    for (let i = 0; i < upgradeCount; i++) {
        const nextLevel = currentLevel + 1;
        const nextShaftInfo = shaftData.find(s => s.Tier === tier && s.Level === nextLevel);

        if (nextShaftInfo) {
            user.cash -= nextShaftInfo.Cost;
            shaft.level = nextLevel;
            shaft.number_of_workers = nextShaftInfo.NumberOfWorkers;
            shaft.gain_per_second_per_worker = nextShaftInfo.GainPerSecondPerWorker * getMineFactor(currentMine.mine_name);
            shaft.capacity_per_worker = nextShaftInfo.CapacityPerWorker * getMineFactor(currentMine.mine_name);
            shaft.worker_walking_speed_per_second = nextShaftInfo.WorkerWalkingSpeedPerSecond;

            if (nextShaftInfo.BigUpdate === 1) {
                superCashEarned += nextShaftInfo.SuperCashReward;
            }

            currentLevel = nextLevel;
        } else {
            break; // Stop upgrading if no further upgrades are available
        }
    }
	
	// Add Super Cash if earned
    if (superCashEarned > 0) {
        user.super_cash = (user.super_cash || 0) + superCashEarned;
    }

    await updateUser(userId, user);

    return message.reply(`Shaft Tier ${tier} to Level ${shaft.level} for ${numberFormat(totalCost)} Cash in the ${currentMine.mine_name}. ${superCashEarned > 0 ? `You earned ${superCashEarned} Super Cash for hitting major upgrades!` : ''}`);
}