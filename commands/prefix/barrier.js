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
            return message.reply(`<@${userId}>, to manage your barriers, you'll need to do: unlock a new barrier from the order in your __${currentMine.MineName}__ using **im!barrier unlock (index)**, view all current barriers in your mine using **im!barrier overview** or demolish a barrier that is finished using **im!barrier remove (index)**.`);
        }
		
		const subcommand = args[0].toLowerCase();

        switch (subcommand) {
            case 'unlock':
                await handleUnlock(message, user, currentMine, args, userId);
                break;
            case 'overview':
                await handleOverview(message, currentMine);
                break;
            case 'remove':
                await handleRemove(message, user, currentMine, args, userId);
                break;
            default:
			    return message.reply(`Invalid subcommand, <@${userId}>! To manage your barriers, you'll need to do: unlock a new barrier from the order in your __${currentMine.MineName}__ using **im!barrier unlock (index)**, view all current barriers in your mine using **im!barrier overview** or demolish a barrier that is finished using **im!barrier remove (index)**.`);
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
    const previousBarrier = currentMine.barriers[barrierOrder - 1];

    if (!barrier) {
        return message.reply('Barrier data not found.');
    }

    if (!previousBarrier.unlocked && barrierOrder > 1) {
        return message.reply(`You must unlock Barrier ${barrierOrder - 1} before unlocking Barrier ${barrierOrder}.`);
    }

    const requiredTier = (barrierOrder === 1) ? 5 : 10;
    const requiredShaftsUnlocked = currentMine.mineshafts.some(shaft => shaft.tier >= requiredTier);

    if (!requiredShaftsUnlocked) {
        return message.reply(`You must have unlocked shafts of tier ${requiredTier} to unlock Barrier ${barrierOrder}.`);
    }

    if (barrier.unlocked) {
        return message.reply(`Barrier ${barrierOrder} is already unlocked.`);
    }

    if (user.cash < barrier.Cost) {
        return message.reply(`You do not have enough Cash to unlock this barrier. Cost: ${numberFormat(barrier.Cost)}`);
    }

    // Deduct the cash and set the barrier as in the process of being unlocked
    user.cash -= barrier.Cost;
    barrier.unlockTime = Date.now() + barrier.BuildTimeInSeconds * 1000;

    await updateUser(userId, user);

    return message.reply(`Successfully paid to unlock Barrier ${barrierOrder}. It will be removed in ${barrier.BuildTimeInSeconds} seconds.`);
}

// Function to handle the "overview" subcommand
async function handleOverview(message, currentMine) {
    const embed = new EmbedBuilder()
        .setTitle('Barrier Overview')
        .setDescription(`Here is the current status of your barriers in the ${currentMine.MineName}:`)
        .setColor('#00FF00');

    currentMine.barriers.forEach((barrier, index) => {
        const status = barrier.unlocked ? 'Unlocked' : `Locked (Unlocking in ${Math.max(0, Math.floor((barrier.unlockTime - Date.now()) / 1000))} seconds)`;
        embed.addFields({ name: `Barrier ${index + 1}`, value: status, inline: true });
    });

    message.reply({ embeds: [embed] });
}

// Function to handle the "remove" subcommand
async function handleRemove(message, user, currentMine, args, userId) {
    const barrierOrder = parseInt(args[1], 10);

    if (isNaN(barrierOrder) || barrierOrder < 1 || barrierOrder >= currentMine.barriers.length) {
        return message.reply('Please provide a valid barrier order number.');
    }

    const barrier = currentMine.barriers[barrierOrder];

    if (!barrier) {
        return message.reply('Barrier data not found.');
    }

    if (!barrier.unlockTime || Date.now() < barrier.unlockTime) {
        return message.reply(`Barrier ${barrierOrder} is still being removed. Please wait until the process is complete.`);
    }

    barrier.unlocked = true;
    barrier.unlockTime = null;

    await updateUser(userId, user);

    return message.reply(`Successfully removed Barrier ${barrierOrder}. You can now access new shafts.`);
}
