'use strict';

import { EmbedBuilder } from 'discord.js';
import numberFormat, { getIllionInfo, formatAlphabeticalNumber } from '../../utils/numberFormat.js';
import { getUser } from '../../dataManager.js';
import commandContext from './context.js';

function formatCashLine(amount, label) {
    const safeAmount = Number(amount || 0);
    const illionInfo = getIllionInfo(safeAmount);
    return `${numberFormat(safeAmount)} ${label}\n🧮 Alt: **${formatAlphabeticalNumber(safeAmount)}** | 🏁 Tier: **${illionInfo.long || 'Base'}**`;
}

async function resolveTarget(context, rawArg, targetUser = null) {
    const actor = commandContext.getActor(context);
    if (targetUser) return targetUser;
    if (!rawArg) return actor;

    const normalizedArg = String(rawArg).trim();
    const candidate = normalizedArg.startsWith('<@') && normalizedArg.endsWith('>')
        ? normalizedArg.replace(/[<@!>]/g, '')
        : normalizedArg;
    if (!/^\d{16,20}$/.test(candidate)) {
        const member = context.guild?.members?.cache?.find(entry =>
            entry.user.username.toLowerCase() === normalizedArg.toLowerCase()
            || entry.displayName.toLowerCase() === normalizedArg.toLowerCase()
        );
        return member?.user || null;
    }

    const member = context.guild?.members
        ? await context.guild.members.fetch(candidate).catch(() => null)
        : null;
    if (member?.user) return member.user;
    if (context.client?.users?.fetch) {
        return context.client.users.fetch(candidate).catch(() => null);
    }
    return null;
}

async function handleBalanceCommand(context, { rawArg = null, targetUser = null } = {}) {
    await commandContext.defer(context);
    const target = await resolveTarget(context, rawArg, targetUser);
    if (!target) return commandContext.reply(context, `No user found for "${rawArg}".`);
    if (target.bot) return commandContext.reply(context, 'This is not a real user.');

    const user = await getUser(target.id);
    if (!user) return commandContext.reply(context, `${target.username} needs to start the game first by using \`${commandContext.commandReference(context, 'start')}\` (or \`/start\` if using slash).`);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${target.username}'s Balance`)
        .addFields(
            { name: 'Cash', value: formatCashLine(user.cash, 'Cash'), inline: true },
            { name: 'Ice Cash', value: formatCashLine(user.ice_cash, 'Ice Cash'), inline: true },
            { name: 'Fire Cash', value: formatCashLine(user.fire_cash, 'Fire Cash'), inline: true },
            { name: 'Dawn Cash', value: formatCashLine(user.dawn_cash, 'Dawn Cash'), inline: true },
            { name: 'Super Cash', value: formatCashLine(user.super_cash, 'Super Cash'), inline: true }
        )
        .setTimestamp()
        .setThumbnail(target.displayAvatarURL?.() || commandContext.getActor(context)?.displayAvatarURL?.());

    return commandContext.reply(context, { embeds: [embed] });
}

export default { handleBalanceCommand, formatCashLine, resolveTarget };
