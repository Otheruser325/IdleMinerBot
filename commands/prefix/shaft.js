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
        if (args.length < 1) {
            return message.reply('Please provide a subcommand: `overview`, `buy`, or `upgrade`.');
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

        // Lazy initialization of mineshafts
        if (!currentMine.mineshafts) {
            currentMine.mineshafts = [];
        }

        switch (subcommand) {
            case 'overview':
                await handleOverview(message, user, currentMine, args);
                break;
            case 'buy':
                await handleBuy(message, user, currentMine, args);
                break;
            case 'upgrade':
                await handleUpgrade(message, user, currentMine, args);
                break;
            default:
                return message.reply('Invalid subcommand. Use `overview`, `buy`, or `upgrade`.');
        }
    }
};

// Function to handle the "overview" subcommand
async function handleOverview(message, user, currentMine, args) {
    const tier = parseInt(args[1], 10);

    if (isNaN(tier) || tier < 1 || tier > 40) {
        return message.reply('Please provide a valid shaft tier number between 1 and 40.');
    }

    const shaft = currentMine.mineshafts.find(s => s.tier === tier);

    if (!shaft) {
        return message.reply(`You do not own a shaft of Tier ${tier} in the ${currentMine.MineName}.`);
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
    const mineFactor = getMineFactor(currentMine.MineName);
    const adjustedGain = shaftInfo.GainPerSecondPerWorker * mineFactor;
    const adjustedCapacity = shaftInfo.CapacityPerWorker * mineFactor;

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Mineshaft Tier ${tier} Overview in ${currentMine.MineName}`)
        .addFields(
            { name: 'Level', value: `${shaft.level}`, inline: true },
            { name: 'Workers', value: `${shaft.numberOfWorkers}`, inline: true },
            { name: 'Gain per Second', value: `${numberFormat(adjustedGain)}`, inline: true },
            { name: 'Capacity per Worker', value: `${numberFormat(adjustedCapacity)}`, inline: true },
            { name: 'Worker Speed', value: `${shaft.workerWalkingSpeedPerSecond} units/sec`, inline: true },
            { name: 'Total Deposit', value: `${numberFormat(shaft.totalDeposit)}`, inline: true }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// Function to handle the "buy" subcommand
async function handleBuy(message, user, currentMine, args) {
    const tier = parseInt(args[1], 10);

    if (isNaN(tier) || tier < 1 || tier > 40) {
        return message.reply('Please provide a valid shaft tier number between 1 and 40.');
    }

    const existingShaft = currentMine.mineshafts.find(s => s.tier === tier);

    if (existingShaft) {
        return message.reply(`You already own a shaft of Tier ${tier} in the ${currentMine.MineName}.`);
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
    const mineFactor = getMineFactor(currentMine.MineName);
    const adjustedGain = shaftInfo.GainPerSecondPerWorker * mineFactor;
    const adjustedCapacity = shaftInfo.CapacityPerWorker * mineFactor;

    currentMine.mineshafts.push({
        tier,
        level: 1,
        numberOfWorkers: shaftInfo.NumberOfWorkers,
        gainPerSecondPerWorker: adjustedGain,
        capacityPerWorker: adjustedCapacity,
        workerWalkingSpeedPerSecond: shaftInfo.WorkerWalkingSpeedPerSecond,
        totalDeposit: 0 // Initialize totalDeposit for new shaft
    });

    await updateUser(user.id, user);

    return message.reply(`Successfully purchased Shaft Tier ${tier} for ${numberFormat(shaftInfo.Cost)} Cash in the ${currentMine.MineName}.`);
}

// Function to handle the "upgrade" subcommand
async function handleUpgrade(message, user, currentMine, args) {
    const tier = parseInt(args[1], 10);

    if (isNaN(tier) || tier < 1 || tier > 40) {
        return message.reply('Please provide a valid shaft tier number between 1 and 40.');
    }

    const shaft = currentMine.mineshafts.find(s => s.tier === tier);

    if (!shaft) {
        return message.reply(`You do not own a shaft of Tier ${tier} in the ${currentMine.MineName}.`);
    }

    const nextLevel = shaft.level + 1;
    const nextShaftInfo = shaftData.find(s => s.Tier === tier && s.Level === nextLevel);

    if (!nextShaftInfo) {
        return message.reply(`There is no upgrade available for Shaft Tier ${tier} at Level ${nextLevel}.`);
    }

    if (user.cash < nextShaftInfo.Cost) {
        return message.reply(`You do not have enough Cash to upgrade this shaft. Cost: ${numberFormat(nextShaftInfo.Cost)}`);
    }

    user.cash -= nextShaftInfo.Cost;

    // Adjust shaft stats based on the mine's factor
    const mineFactor = getMineFactor(currentMine.MineName);
    const adjustedGain = nextShaftInfo.GainPerSecondPerWorker * mineFactor;
    const adjustedCapacity = nextShaftInfo.CapacityPerWorker * mineFactor;

    shaft.level = nextLevel;
    shaft.numberOfWorkers = nextShaftInfo.NumberOfWorkers;
    shaft.gainPerSecondPerWorker = adjustedGain;
    shaft.capacityPerWorker = adjustedCapacity;
    shaft.workerWalkingSpeedPerSecond = nextShaftInfo.WorkerWalkingSpeedPerSecond;

    await updateUser(user.id, user);

    return message.reply(`Successfully upgraded Shaft Tier ${tier} to Level ${nextLevel} for ${numberFormat(nextShaftInfo.Cost)} Cash in the ${currentMine.MineName}.`);
}
