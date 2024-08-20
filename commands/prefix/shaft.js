const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const shaftData = require('../../config/shaftData.json');

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

        switch (subcommand) {
            case 'overview':
                await handleOverview(message, user, args);
                break;
            case 'buy':
                await handleBuy(message, user, args);
                break;
            case 'upgrade':
                await handleUpgrade(message, user, args);
                break;
            default:
                return message.reply('Invalid subcommand. Use `overview`, `buy`, or `upgrade`.');
        }
    }
};

// Function to handle the "overview" subcommand
async function handleOverview(message, user, args) {
    const tier = parseInt(args[1], 10);

    if (isNaN(tier) || tier < 1 || tier > 40) {
        return message.reply('Please provide a valid shaft tier number between 1 and 40.');
    }

    const shaft = user.mineshafts.find(s => s.tier === tier);

    if (!shaft) {
        return message.reply(`You do not own a shaft of Tier ${tier}.`);
    }

    const shaftInfo = shaftData.find(s => s.Tier === tier && s.Level === shaft.level);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Mineshaft Tier ${tier} Overview`)
        .addFields(
            { name: 'Level', value: `${shaft.level}`, inline: true },
            { name: 'Workers', value: `${shaftInfo.NumberOfWorkers}`, inline: true },
            { name: 'Gain per Second', value: `${numberFormat(shaftInfo.GainPerSecondPerWorker * shaftInfo.NumberOfWorkers)}`, inline: true },
            { name: 'Capacity per Worker', value: `${numberFormat(shaftInfo.CapacityPerWorker)}`, inline: true },
            { name: 'Worker Speed', value: `${shaftInfo.WorkerWalkingSpeedPerSecond} units/sec`, inline: true }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// Function to handle the "buy" subcommand
async function handleBuy(message, user, args) {
    const tier = parseInt(args[1], 10);

    if (isNaN(tier) || tier < 1 || tier > 40) {
        return message.reply('Please provide a valid shaft tier number between 1 and 40.');
    }

    const existingShaft = user.mineshafts.find(s => s.tier === tier);

    if (existingShaft) {
        return message.reply(`You already own a shaft of Tier ${tier}.`);
    }

    const shaftInfo = shaftData.find(s => s.Tier === tier && s.Level === 1);

    if (!shaftInfo) {
        return message.reply(`Invalid shaft tier provided.`);
    }

    if (user.superCash < shaftInfo.StartCost) {
        return message.reply(`You do not have enough Super Cash to buy this shaft. Cost: ${numberFormat(shaftInfo.StartCost)}`);
    }

    user.superCash -= shaftInfo.StartCost;
    user.shafts.push({ tier, level: 1 });

    await updateUser(user.id, user);

    return message.reply(`Successfully purchased Shaft Tier ${tier} for ${numberFormat(shaftInfo.StartCost)} Super Cash.`);
}

// Function to handle the "upgrade" subcommand
async function handleUpgrade(message, user, args) {
    const tier = parseInt(args[1], 10);

    if (isNaN(tier) || tier < 1 || tier > 40) {
        return message.reply('Please provide a valid shaft tier number between 1 and 40.');
    }

    const shaft = user.mineshafts.find(s => s.tier === tier);

    if (!shaft) {
        return message.reply(`You do not own a shaft of Tier ${tier}.`);
    }

    const nextLevel = shaft.level + 1;
    const nextShaftInfo = shaftData.find(s => s.Tier === tier && s.Level === nextLevel);

    if (!nextShaftInfo) {
        return message.reply(`There is no upgrade available for Shaft Tier ${tier} at Level ${nextLevel}.`);
    }

    if (user.superCash < nextShaftInfo.Cost) {
        return message.reply(`You do not have enough Super Cash to upgrade this shaft. Cost: ${numberFormat(nextShaftInfo.Cost)}`);
    }

    user.superCash -= nextShaftInfo.Cost;
    shaft.level = nextLevel;

    await updateUser(user.id, user);

    return message.reply(`Successfully upgraded Shaft Tier ${tier} to Level ${nextLevel} for ${numberFormat(nextShaftInfo.Cost)} Super Cash.`);
}
