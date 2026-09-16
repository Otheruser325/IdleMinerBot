'use strict';

import { getUser } from '../../dataManager.js';
import commandContext from './context.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import shopDataJson from '../../config/shopData.json' with { type: 'json' };
import numberFormat from '../../utils/numberFormat.js';
import { isShopUnlocked } from '../../utils/progression.js';
import { logError, safeUpdateInteraction, safeEditMessage } from '../../utils/errorHandling.js';
import { acknowledgeComponent, trackComponentCollector } from '../../utils/interactionSessions.js';
import { isPremiumPassItem } from '../../utils/premiumPayments.js';

const shopData = shopDataJson.items;

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
}

export default {
    name: 'shop',
    description: 'Browse and purchase special deals and boosters.',
    async execute(context) {
        const actor = commandContext.getActor(context);
        const userId = actor?.id;
        if (!userId) return commandContext.replyError(context, 'Unable to identify the player.');
        await commandContext.defer(context);

        const user = await getUser(userId);
        if (!user) return commandContext.reply(context, `You need to start the game first by using \`${commandContext.commandReference(context, 'start')}\`.`);
        if (!isShopUnlocked(user)) return commandContext.reply(context, 'Shop unlocks after you buy Shaft Tier 3 on Coal Mine for the first time.');

        let page = 0;
        const itemsPerPage = 4;
        const maxPage = Math.max(0, Math.ceil(shopData.length / itemsPerPage) - 1);
        const generateEmbed = currentPage => {
            const embed = new EmbedBuilder()
                .setTitle('Shop - Special Deals & Boosters')
                .setColor('#0099ff')
                .setDescription('Here are the items available for purchase. Use the buttons below to navigate.');
            shopData.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage).forEach(item => {
                const premium = isPremiumPassItem(item);
                const lines = [premium ? `Price: ${item.PriceDisplay || 'Paid Offer'}` : `Cost: ${numberFormat(item.SuperCashCost)} Super Cash`];
                if (!premium && item.InstantCashTime > 0) {
                    lines.push(`Instant Cash: ${formatTime(item.InstantCashTime)}`, 'Type: Instant payout item');
                } else if (!premium) {
                    if (item.CompleteIncomeIncreaseFactor > 0) lines.push(`Income Boost: ${item.CompleteIncomeIncreaseFactor}x`);
                    lines.push(`Active Time: ${formatTime(item.ActiveTimeSeconds)}`);
                } else {
                    lines.push('Purchase Type: Secure external checkout', 'Rewards: Premium pass, 1,000 Super Cash, Long x2 Boost, x10 Boost');
                }
                embed.addFields({ name: `${item.ItemName} (ID: ${item.id})`, value: lines.join('\n') });
            });
            return embed;
        };
        const buildRow = currentPage => new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`shop_prev_${userId}`).setLabel('Previous').setStyle(ButtonStyle.Primary).setDisabled(currentPage === 0),
            new ButtonBuilder().setCustomId(`shop_next_${userId}`).setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(currentPage === maxPage)
        );

        try {
            const payload = { embeds: [generateEmbed(page)], components: [buildRow(page)] };
            const embedMessage = commandContext.isInteraction(context)
                ? await commandContext.reply(context, payload)
                : await context.channel.send(payload);
            if (!embedMessage?.createMessageComponentCollector) return embedMessage;

            const collector = trackComponentCollector(
                embedMessage,
                embedMessage.createMessageComponentCollector({ filter: interaction => interaction.user.id === userId, idle: 60000, time: 15 * 60 * 1000 }),
                { ownerId: userId, kind: 'shop', ttlMs: 15 * 60 * 1000, idleMs: 60000 }
            );
            collector.on('collect', async interaction => {
                try {
                    if (interaction.customId === `shop_prev_${userId}` && page > 0) page--;
                    if (interaction.customId === `shop_next_${userId}` && page < maxPage) page++;
                    if (!await acknowledgeComponent(interaction, 'shop.collector')) return;
                    await safeUpdateInteraction(interaction, { embeds: [generateEmbed(page)], components: [buildRow(page)] }, 'shop:collector:update', {
                        userId: interaction.user?.id,
                        customId: interaction.customId
                    });
                } catch (error) {
                    logError('shop:collector:update', error, { userId: interaction?.user?.id, customId: interaction?.customId });
                }
            });
            collector.on('end', async () => safeEditMessage(embedMessage, { components: [] }, 'shop:collector:end', { messageId: embedMessage?.id }));
            return embedMessage;
        } catch (error) {
            logError('shop:execute', error, { userId });
            return commandContext.replyError(context, 'There was an error loading the shop.');
        }
    }
};
