import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import { EmbedBuilder } from 'discord.js';
import numberFormat from '../../utils/numberFormat.js';

export default {
    name: 'barrier',
    description: 'Manage barriers in your mine to unlock new tiers.',
    usage: '<subcommand> [arguments]',
    exampleUsage: 'v barrier unlock 1',
    async execute(message, args) {
        const userId = message.author.id;
        return withUserLock(userId, async () => {
            const user = await getUser(userId);

            if (!user) {
                return message.reply('You need to start the game first by using `im!start` (or `/start` if using slash).');
            }

            const currentMine = user.mines.find(mine => mine.mine_name === user.current_mine);
            if (!currentMine) {
                return message.reply('Current mine data not found.');
            }

            if (args.length < 1) {
                return message.reply(`<@${userId}>, to manage your barriers, you'll need to do: unlock a new barrier from the order in your __${currentMine.mine_name}__ using **im!barrier unlock (index)**, view all current barriers in your mine using **im!barrier overview** or demolish a barrier that is finished using **im!barrier remove (index)**.`);
            }

            const subcommand = args[0].toLowerCase();

            switch (subcommand) {
                case 'unlock':
                    return handleUnlock(message, user, currentMine, args, userId);
                case 'overview':
                    return handleOverview(message, currentMine);
                case 'remove':
                    return handleRemove(message, user, currentMine, args, userId);
                default:
                    return message.reply(`Invalid subcommand, <@${userId}>! To manage your barriers, you'll need to do: unlock a new barrier from the order in your __${currentMine.mine_name}__ using **im!barrier unlock (index)**, view all current barriers in your mine using **im!barrier overview** or demolish a barrier that is finished using **im!barrier remove (index)**.`);
            }
        });
    }
};

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

    const requiredTier = barrierOrder === 1 ? 5 : 10;
    const requiredShaftsUnlocked = currentMine.mineshafts.some(shaft => shaft.tier >= requiredTier);

    if (!requiredShaftsUnlocked) {
        return message.reply(`You must have unlocked shafts of tier ${requiredTier} to unlock Barrier ${barrierOrder}.`);
    }

    if (barrier.unlocked) {
        return message.reply(`Barrier ${barrierOrder} is already unlocked.`);
    }

    if (barrier.unlock_time && barrier.unlock_time > Date.now()) {
        return message.reply(`Barrier ${barrierOrder} is already being removed.`);
    }

    if (user.cash < barrier.cost) {
        return message.reply(`You do not have enough Cash to unlock this barrier. Cost: ${numberFormat(barrier.cost)}`);
    }

    user.cash -= barrier.cost;
    barrier.unlock_time = Date.now() + (barrier.build_time_in_seconds || 0) * 1000;

    await updateUser(userId, user);

    return message.reply(`Successfully paid to unlock Barrier ${barrierOrder}. It will be removed in ${barrier.build_time_in_seconds} seconds.`);
}

async function handleOverview(message, currentMine) {
    const embed = new EmbedBuilder()
        .setTitle('Barrier Overview')
        .setDescription(`Here is the current status of your barriers in ${currentMine.mine_name}:`)
        .setColor('#00FF00');

    currentMine.barriers.forEach((barrier, index) => {
        let status;
        if (barrier.unlocked) {
            status = 'Unlocked';
        } else if (barrier.unlock_time && barrier.unlock_time > Date.now()) {
            const secondsRemaining = Math.max(0, Math.floor((barrier.unlock_time - Date.now()) / 1000));
            status = `Unlocking in ${secondsRemaining}s`;
        } else {
            status = barrier.cost > 0 ? `Locked (${numberFormat(barrier.cost)} Cash)` : 'Locked';
        }

        embed.addFields({ name: `Barrier ${index + 1}`, value: status, inline: true });
    });

    return message.reply({ embeds: [embed] });
}

async function handleRemove(message, user, currentMine, args, userId) {
    const barrierOrder = parseInt(args[1], 10);

    if (isNaN(barrierOrder) || barrierOrder < 1 || barrierOrder >= currentMine.barriers.length) {
        return message.reply('Please provide a valid barrier order number.');
    }

    const barrier = currentMine.barriers[barrierOrder];

    if (!barrier) {
        return message.reply('Barrier data not found.');
    }

    if (!barrier.unlock_time && !barrier.unlocked) {
        return message.reply(`Barrier ${barrierOrder} has not been purchased for removal yet.`);
    }

    if (barrier.unlock_time && Date.now() < barrier.unlock_time) {
        return message.reply(`Barrier ${barrierOrder} is still being removed. Please wait until the process is complete.`);
    }

    barrier.unlocked = true;
    barrier.unlock_time = null;

    await updateUser(userId, user);

    return message.reply(`Successfully removed Barrier ${barrierOrder}. You can now access new shafts.`);
}
