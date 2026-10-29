import { getUser, commitUserSnapshot, withUserLock } from '../../dataManager.js';
import { EmbedBuilder } from 'discord.js';
import numberFormat from '../../utils/numberFormat.js';
import commandContext from './context.js';
import { moneyCovers, moneySub } from '../../utils/economyConstants.js';

export default {
    name: 'barrier',
    description: 'Manage barriers in your mine to unlock new tiers.',
    usage: '<subcommand> [arguments]',
    exampleUsage: 'v barrier unlock 1',
    async execute(message, args = []) {
        const userId = message.user?.id || message.author?.id;
        return withUserLock(userId, async () => {
            const user = await getUser(userId);

            if (!user) {
                return message.reply(`You need to start the game first by using \`${commandContext.commandReference(message, 'start')}\`.`);
            }

            const currentMine = user.mines.find(mine => mine.mine_name === user.current_mine);
            if (!currentMine) {
                return message.reply('Current mine data not found.');
            }

            if (args.length < 1) {
                return message.reply(`<@${userId}>, manage barriers with **${commandContext.commandReference(message, 'barrier', 'unlock <index>')}**, **${commandContext.commandReference(message, 'barrier', 'overview')}**, or **${commandContext.commandReference(message, 'barrier', 'remove <index>')}** in **__${currentMine.mine_name}__**.`);
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
                    return message.reply(`Invalid subcommand, <@${userId}>! Use **${commandContext.commandReference(message, 'barrier', 'unlock <index>')}**, **${commandContext.commandReference(message, 'barrier', 'overview')}**, or **${commandContext.commandReference(message, 'barrier', 'remove <index>')}**.`);
            }
        });
    }
};

function barrierCost(barrier) {
    return Number(barrier?.Cost ?? 0);
}

function barrierBuildTimeSeconds(barrier) {
    const seconds = Number(barrier?.BuildTimeInSeconds ?? 0);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function barrierTier(barrier, key) {
    return Number(barrier?.[key === 'from' ? 'FromTier' : 'ToTier'] ?? 0);
}

function formatBuildTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${safeSeconds}s`;
}

async function handleUnlock(message, user, currentMine, args, userId) {
    const barrierOrder = parseInt(args[1], 10);

    if (isNaN(barrierOrder) || barrierOrder < 1 || barrierOrder > currentMine.barriers.length) {
        return message.reply('Please provide a valid barrier order number.');
    }

    const barrierIndex = barrierOrder - 1;
    const barrier = currentMine.barriers[barrierIndex];
    const previousBarrier = currentMine.barriers[barrierIndex - 1];

    if (!barrier) {
        return message.reply('Barrier data not found.');
    }

    // Order matters: barrier 1 has no predecessor, so check the order first to
    // avoid dereferencing an undefined previous barrier.
    if (barrierOrder > 1 && !previousBarrier?.unlocked) {
        return message.reply(`You must unlock Barrier ${barrierOrder - 1} before unlocking Barrier ${barrierOrder}.`);
    }

    // The gate is the last tier of the previous region, derived from this
    // barrier's own range so it stays correct for every barrier (not just the
    // first two, which is all a hardcoded 5/10 covered).
    const requiredTier = Math.max(0, barrierTier(barrier, 'from') - 1);
    const requiredShaftsUnlocked = requiredTier === 0
        || currentMine.mineshafts.some(shaft => Number(shaft.tier) >= requiredTier);

    if (!requiredShaftsUnlocked) {
        return message.reply(`You must have unlocked shafts of tier ${requiredTier} to unlock Barrier ${barrierOrder}.`);
    }

    if (barrier.unlocked) {
        return message.reply(`Barrier ${barrierOrder} is already unlocked.`);
    }

    if (barrier.unlock_time && barrier.unlock_time > Date.now()) {
        return message.reply(`Barrier ${barrierOrder} is already being removed.`);
    }

    const cost = barrierCost(barrier);
    const buildTimeSeconds = barrierBuildTimeSeconds(barrier);

    if (!moneyCovers(user.cash, cost)) {
        return message.reply(`You do not have enough Cash to unlock this barrier. Cost: ${numberFormat(cost)}`);
    }

    user.cash = moneySub(user.cash, cost);
    barrier.unlock_time = Date.now() + buildTimeSeconds * 1000;

    await commitUserSnapshot(userId, user);

    return message.reply(`Successfully paid to unlock Barrier ${barrierOrder} (Tiers ${barrierTier(barrier, 'from')}-${barrierTier(barrier, 'to')}). It will be removed in ${formatBuildTime(buildTimeSeconds)}.`);
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
            const cost = barrierCost(barrier);
            const buildLabel = formatBuildTime(barrierBuildTimeSeconds(barrier));
            const range = `Tiers ${barrierTier(barrier, 'from')}-${barrierTier(barrier, 'to')}`;
            status = cost > 0 ? `Locked | ${range} | ${numberFormat(cost)} Cash | ${buildLabel}` : `Locked | ${range}`;
        }

        embed.addFields({ name: `Barrier ${index + 1}`, value: status, inline: true });
    });

    return message.reply({ embeds: [embed] });
}

async function handleRemove(message, user, currentMine, args, userId) {
    const barrierOrder = parseInt(args[1], 10);

    if (isNaN(barrierOrder) || barrierOrder < 1 || barrierOrder > currentMine.barriers.length) {
        return message.reply('Please provide a valid barrier order number.');
    }

    const barrier = currentMine.barriers[barrierOrder - 1];

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

    await commitUserSnapshot(userId, user);

    return message.reply(`Successfully removed Barrier ${barrierOrder}. You can now access new shafts.`);
}
