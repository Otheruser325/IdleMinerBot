const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const mineRegions = require('../../config/mineRegions.json');

module.exports = {
    name: 'barrier',
    description: 'Manage barriers in your mine to unlock new tiers.',
    usage: '<subcommand> [arguments]',
    exampleUsage: 'v barrier unlock 1',
    async execute(message, args) {
        if (args.length < 1) {
            return message.reply('Please provide a subcommand: `unlock`.');
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

        switch (subcommand) {
            case 'unlock':
                await handleUnlock(message, user, currentMine, args, userId);
                break;
            default:
                return message.reply('Invalid subcommand. Use `unlock`.');
        }
    }
};

// Function to handle the "unlock" subcommand
async function handleUnlock(message, user, currentMine, args, userId) {
    const barrierOrder = parseInt(args[1], 10);

    if (isNaN(barrierOrder) || barrierOrder < 1 || barrierOrder >= currentMine.barriers.length) {
        return message.reply('Please provide a valid barrier order number.');
    }

    const barrier = currentMine.barriers[barrierOrder];
    if (!barrier) {
        return message.reply('Barrier data not found.');
    }

    if (barrier.unlocked) {
        return message.reply(`Barrier ${barrierOrder} is already unlocked.`);
    }

    if (user.cash < barrier.Cost) {
        return message.reply(`You do not have enough Cash to unlock this barrier. Cost: ${numberFormat(barrier.Cost)}`);
    }

    // Deduct the cash and set the barrier as unlocked
    user.cash -= barrier.Cost;
    barrier.unlocked = true;

    await updateUser(userId, user);

    return message.reply(`Successfully unlocked Barrier ${barrierOrder}, allowing you to access shafts from Tier ${barrier.FromTier} to ${barrier.ToTier}.`);
}
