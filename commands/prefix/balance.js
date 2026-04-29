import { EmbedBuilder } from 'discord.js';
import numberFormat, { getIllionInfo, formatAlphabeticalNumber } from '../../utils/numberFormat.js';
import { getUser } from '../../dataManager.js';
import { logError } from '../../utils/errorHandling.js';

function formatCashLine(amount, label) {
    const safeAmount = Number(amount || 0);
    const illionInfo = getIllionInfo(safeAmount);
    const unifiedFormat = numberFormat(safeAmount);
    const alphaFormat = formatAlphabeticalNumber(safeAmount);
    const longTier = illionInfo.long || 'Base';

    return `${unifiedFormat} ${label}\n🧮 Alt: **${alphaFormat}** | 🏁 Tier: **${longTier}**`;
}

async function resolveTargetUser(message, rawArg) {
    if (!rawArg) {
        return {
            userId: message.author.id,
            username: message.author.username,
            avatarUrl: message.author.displayAvatarURL()
        };
    }

    const mentionOrId = rawArg.startsWith('<@') && rawArg.endsWith('>')
        ? rawArg.replace(/[<@!>]/g, '')
        : rawArg;

    const userIdCandidate = /^\d{16,20}$/.test(mentionOrId) ? mentionOrId : null;
    let discordUser = null;
    let member = null;

    try {
        if (userIdCandidate) {
            member = message.guild ? await message.guild.members.fetch(userIdCandidate).catch(() => null) : null;
            discordUser = member?.user || await message.client.users.fetch(userIdCandidate).catch(() => null);
        } else if (message.guild) {
            const username = rawArg.toLowerCase();
            member = message.guild.members.cache.find(m => m.user.username.toLowerCase() === username)
                || message.guild.members.cache.find(m => m.displayName.toLowerCase() === username)
                || null;
            discordUser = member?.user || null;
        }
    } catch (error) {
        logError('balance:resolveTargetUser', error, { requesterId: message?.author?.id, rawArg });
    }

    if (!discordUser) {
        return { error: `No user found for "${rawArg}".` };
    }

    if (discordUser.bot) {
        return { error: 'This is not a real user.' };
    }

    return {
        userId: discordUser.id,
        username: discordUser.username,
        avatarUrl: discordUser.displayAvatarURL()
    };
}

export default {
    name: 'balance',
    description: 'Check your balance and cash types.',
    aliases: ['bank', 'bal'],
    usage: '(optional) <user>',
    exampleUsage: 'v balance @username or v balance 1234567890',
    async execute(message, args) {
        try {
            const target = await resolveTargetUser(message, args?.[0]);
            if (target.error) {
                return message.reply(target.error);
            }

            const user = await getUser(target.userId);
            if (!user) {
                return message.reply(`${target.username} needs to start the game first by using \`im!start\` (or \`/start\` if using slash).`);
            }

            const cash = Number(user.cash || 0);
            const iceCash = Number(user.ice_cash || 0);
            const fireCash = Number(user.fire_cash || 0);
            const dawnCash = Number(user.dawn_cash || 0);
            const superCash = Number(user.super_cash || 0);

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`${target.username}'s Balance`)
                .addFields(
                    { name: 'Cash', value: formatCashLine(cash, 'Cash'), inline: true },
                    { name: 'Ice Cash', value: formatCashLine(iceCash, 'Ice Cash'), inline: true },
                    { name: 'Fire Cash', value: formatCashLine(fireCash, 'Fire Cash'), inline: true },
                    { name: 'Dawn Cash', value: formatCashLine(dawnCash, 'Dawn Cash'), inline: true },
                    { name: 'Super Cash', value: formatCashLine(superCash, 'Super Cash'), inline: true }
                )
                .setTimestamp()
                .setThumbnail(target.avatarUrl || message.author.displayAvatarURL());

            return message.reply({ embeds: [embed] });
        } catch (error) {
            logError('balance:execute', error, { userId: message?.author?.id, target: args?.[0] });
            return message.reply('There was an error executing the balance command.');
        }
    }
};
