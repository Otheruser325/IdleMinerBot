import { EmbedBuilder } from 'discord.js';
import { getUser } from '../../dataManager.js';
import numberFormat from '../../utils/numberFormat.js';
import { getCashField, getCashLabelByField, getContinentByMineNumber, getMinesForContinent } from '../../utils/continentLooker.js';
import { getAverageMineIdleCashPerSecond, getCombinedMineIdleCashPerSecond, getMineIdleCashPerSecond } from '../../utils/mineOverview.js';
import { getMaxPrestigeCount } from '../../utils/mineOverview.js';
import { getMineName } from '../../utils/mineLooker.js';
import commandContext from './context.js';

function parseTargetId(input) {
    const value = String(input || '').trim();
    const match = value.match(/^<@!?([0-9]{16,20})>$/) || value.match(/^([0-9]{16,20})$/);
    return match?.[1] || null;
}

function isSection(input) {
    return ['mines', 'barriers', 'continents'].includes(String(input || '').toLowerCase());
}

function getSection(args) {
    const value = String(args.find(arg => ['mines', 'barriers', 'continents'].includes(String(arg).toLowerCase())) || '').toLowerCase();
    return value || null;
}

function mineLines(user, section) {
    return (user.mines || []).map(mine => {
        const continent = getContinentByMineNumber(mine.mine_number);
        const idle = getMineIdleCashPerSecond(mine, user.has_premium);
        const cashLabel = getCashLabelByField(getCashField(mine.mine_number));
        const mineName = mine.mine_name || getMineName(mine.mine_number) || 'Unknown Mine';
        return `${mineName}: ${continent?.name || 'Unknown Continent'} | Prestige ${mine.prestige_count || 0}/${getMaxPrestigeCount(mine.mine_number)} | Idle/sec ${numberFormat(idle)} ${cashLabel}`;
    });
}

function barrierLines(mine) {
    return (mine?.barriers || []).map((barrier, index) => {
        const fromTier = Number(barrier.FromTier ?? barrier.from_tier ?? barrier.fromTier);
        const toTier = Number(barrier.ToTier ?? barrier.to_tier ?? barrier.toTier);
        const range = Number.isFinite(fromTier) && Number.isFinite(toTier)
            ? `${fromTier}-${toTier}`
            : 'range unavailable';
        const status = barrier.unlocked ? 'Unlocked' : barrier.unlock_time ? 'Unlocking' : 'Locked';
        return `Barrier ${index + 1} (${range}): ${status}`;
    });
}

function continentLines(user) {
    const owned = user.mines || [];
    return ['Start Continent', 'Ice Continent', 'Fire Continent', 'Dawn Continent'].map(name => {
        const mineNumbers = getMinesForContinent(name);
        const mines = owned.filter(mine => mineNumbers.includes(mine.mine_number));
        const combined = getCombinedMineIdleCashPerSecond(mines, user.has_premium);
        const average = getAverageMineIdleCashPerSecond(mines, mineNumbers.length, user.has_premium);
        return `${name}: ${mines.length}/${mineNumbers.length} owned | Average idle/sec ${numberFormat(average)} | Combined idle/sec ${numberFormat(combined)}`;
    });
}

export default {
    name: 'profile',
    description: 'View your Idle Miner profile and progression statistics.',
    usage: '[user] [mines|barriers|continents]',
    async execute(message, args = []) {
        const actor = message.user || message.author;
        const firstArg = args[0];
        const mentionedUser = message.mentions?.users?.first?.();
        const hasExplicitTarget = Boolean(firstArg && !isSection(firstArg)) || Boolean(mentionedUser);
        const parsedTargetId = parseTargetId(firstArg) || mentionedUser?.id || null;

        if (hasExplicitTarget && !parsedTargetId) {
            return commandContext.reply(message, `Please mention a valid user or provide a Discord user ID (16-20 digits). Usage: ${commandContext.commandReference(message, 'profile', '[user] [section]')}`);
        }

        const targetId = parsedTargetId || actor?.id;
        if (!targetId) return commandContext.reply(message, 'Unable to identify the player.');
        const targetUser = await getUser(targetId);
        const displayName = targetId === actor?.id
            ? actor?.username || actor?.globalName || 'Your'
            : mentionedUser?.username || `Miner ${targetId}`;

        if (!targetUser) {
            const startReference = commandContext.commandReference(message, 'start');
            return commandContext.reply(message, targetId === actor?.id
                ? `You need to start the game first by using \`${startReference}\`.`
                : `${displayName} needs to start the game first with \`${startReference}\`.`);
        }

        const section = getSection(args);
        const currentMine = (targetUser.mines || []).find(mine =>
            (mine.mine_name || getMineName(mine.mine_number)) === targetUser.current_mine
        ) || targetUser.mines?.[0];
        const currentContinent = getContinentByMineNumber(currentMine?.mine_number)?.name || targetUser.current_continent || 'Start Continent';
        const cashLabel = currentMine ? getCashLabelByField(getCashField(currentMine.mine_number)) : 'Cash';
        const fields = [
            { name: 'Super Cash', value: numberFormat(targetUser.super_cash || 0), inline: true },
            { name: 'Current Mine', value: currentMine?.mine_name || 'None', inline: true },
            { name: 'Current Continent', value: currentContinent, inline: true },
            { name: 'Prestige', value: `${currentMine?.prestige_count || 0}`, inline: true },
            { name: `${cashLabel}`, value: numberFormat(currentMine ? targetUser[getCashField(currentMine.mine_number)] || 0 : 0), inline: true },
            { name: 'Mines Owned', value: `${targetUser.mines?.length || 0}`, inline: true }
        ];

        if (!section || section === 'mines') fields.push({ name: 'Mines', value: mineLines(targetUser).join('\n').slice(0, 1024) || 'None', inline: false });
        if (section === 'barriers') fields.push({ name: `Barriers in ${currentMine?.mine_name || 'current mine'}`, value: barrierLines(currentMine).join('\n').slice(0, 1024) || 'None', inline: false });
        if (section === 'continents') fields.push({ name: 'Continents', value: continentLines(targetUser).join('\n').slice(0, 1024), inline: false });

        return message.reply({
            embeds: [new EmbedBuilder().setColor('#0099ff').setTitle(`${displayName}'s Idle Miner Profile`).addFields(fields).setTimestamp()]
        });
    }
};
