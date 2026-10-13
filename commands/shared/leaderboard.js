'use strict';

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import numberFormat from '../../utils/numberFormat.js';
import { forEachUser } from '../../dataManager.js';
import { logError, safeEditMessage, safeUpdateInteraction } from '../../utils/errorHandling.js';
import { acknowledgeComponent, trackComponentCollector } from '../../utils/interactionSessions.js';
import commandContext from './context.js';

export default {
    name: 'leaderboard',
    description: 'Displays the top 15 users in the guild by cash.',
    aliases: ['lb'],
    async execute(context) {
        try {
            await commandContext.defer(context);
            if (!context.guild) return commandContext.reply(context, 'Leaderboards are only available in servers.');

            const guildMembers = await context.guild.members.fetch();

            const actor = commandContext.getActor(context);
            const ownerId = actor?.id;
            const minCashThreshold = 1000;
            const cashTypeLabels = {
                cash: 'Cash',
                ice_cash: 'Ice Cash',
                fire_cash: 'Fire Cash',
                dawn_cash: 'Dawn Cash',
                super_cash: 'Super Cash'
            };

            // Stream users and keep only the top 15 per cash type instead of
            // materializing the whole users table, which degraded memory as the
            // table grew.
            const topByType = {};
            for (const cashType of Object.keys(cashTypeLabels)) topByType[cashType] = [];
            let guildUserCount = 0;
            await forEachUser(user => {
                const uid = user.user_id || user.userId;
                if (!guildMembers.has(uid)) return;
                guildUserCount += 1;
                for (const cashType of Object.keys(cashTypeLabels)) {
                    const value = Number(user[cashType] || 0);
                    const qualifies = cashType === 'super_cash' ? value > 0 : value >= minCashThreshold;
                    if (!qualifies) continue;
                    const list = topByType[cashType];
                    list.push(user);
                    list.sort((a, b) => (b[cashType] || 0) - (a[cashType] || 0));
                    if (list.length > 15) list.pop();
                }
            });
            if (guildUserCount === 0) return commandContext.reply(context, 'No users found.');

            const getTopUsers = cashType => topByType[cashType];

            const buildPayload = cashType => {
                const topUsers = getTopUsers(cashType);
                const cashTypeLabel = cashTypeLabels[cashType];
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`${cashTypeLabel} Leaderboard - Top 15`)
                    .setDescription(topUsers.length
                        ? topUsers.map((user, index) => `${index + 1}. ${guildMembers.get(user.user_id || user.userId)?.user.username || 'Unknown'} - ${numberFormat(user[cashType])} ${cashTypeLabel}`).join('\n')
                        : 'No users found')
                    .setTimestamp();
                const row = new ActionRowBuilder().addComponents(
                    ...Object.entries(cashTypeLabels).map(([key, label]) =>
                        new ButtonBuilder().setCustomId(key).setLabel(label).setStyle(ButtonStyle.Primary))
                );
                return { embeds: [embed], components: [row] };
            };

            const replyPayload = buildPayload('cash');
            const messageReply = commandContext.isInteraction(context)
                ? await commandContext.reply(context, replyPayload)
                : await context.reply(replyPayload);
            if (!messageReply?.createMessageComponentCollector) return messageReply;

            const filter = interaction => Object.keys(cashTypeLabels).includes(interaction.customId)
                && interaction.user.id === ownerId;
            const collector = trackComponentCollector(
                messageReply,
                messageReply.createMessageComponentCollector({ filter, idle: 60000, time: 15 * 60 * 1000 }),
                { ownerId, kind: 'leaderboard', ttlMs: 15 * 60 * 1000, idleMs: 60000 }
            );

            collector.on('collect', async interaction => {
                try {
                    if (!await acknowledgeComponent(interaction, 'leaderboard.collector')) return;
                    await safeUpdateInteraction(interaction, buildPayload(interaction.customId), 'leaderboard:update', {
                        userId: interaction.user?.id,
                        cashType: interaction.customId
                    });
                } catch (error) {
                    logError('leaderboard:collector', error, { userId: interaction?.user?.id, customId: interaction?.customId });
                }
            });

            collector.on('end', async () => {
                await safeEditMessage(messageReply, { components: [] }, 'leaderboard:collector:end', { messageId: messageReply?.id });
            });
            return messageReply;
        } catch (error) {
            logError('leaderboard:execute', error, { userId: commandContext.getActor(context)?.id, guildId: context?.guild?.id });
            return commandContext.replyError(context, 'There was an error executing the leaderboard command.');
        }
    }
};
