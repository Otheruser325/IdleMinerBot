'use strict';

import { initializeUser, getUser } from '../../dataManager.js';
import { updateBotStatus } from '../../utils/botStatus.js';
import { EmbedBuilder } from 'discord.js';
import { logError } from '../../utils/errorHandling.js';
import commandContext from './context.js';

async function handleStartCommand(context) {
    await commandContext.defer(context);
    const actor = commandContext.getActor(context);
    const userId = actor?.id;
    if (!userId) return commandContext.replyError(context, 'Unable to identify the player.');

    try {
        if (await getUser(userId)) return commandContext.reply(context, 'You are already in the game!');
        await initializeUser(userId, actor.username);

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('Welcome to Idle Miner!')
            .setDescription(`Welcome to the mining world, <@${userId}>! Please use \`im!help\` to get you ready and started!`)
            .addFields({
                name: 'Getting Started',
                value: '1. **__Intro__**: Start by using the `im!shaft` command on your channel. You\'ll need to use `im!shaft buy` to purchase your first shaft.\n\n2. **__Operating the Mine__**: After purchasing, operate it using `im!work shaft 1`. Use `im!work elevator` and `im!work warehouse` to manage minerals.\n\n3. **__Upgrading & Managing__**: Upgrade your shafts using `im!shaft upgrade`. Hire managers using `im!manager` after upgrading to Level 5.\n\n4. **__Managing Mines__**: Use `im!mine` to operate new mines or check your status with `im!mine overview`.'
            })
            .setFooter({ text: 'Happy mining!' });

        if (commandContext.isInteraction(context)) return commandContext.reply(context, { embeds: [embed] });

        try {
            await actor.send({ embeds: [embed] });
            await context.channel.send(`You have now officially signed up to the mining world, <@${userId}>! Check your DMs for more instructions.`);
        } catch (error) {
            if (error?.code === 50007 || error?.code === '50007') {
                return commandContext.reply(context, `I couldn't send the DM to you <@${userId}>, as your DMs are closed.`);
            }
            logError('start:sendDm', error, { userId, tag: actor?.tag });
        }

        await updateBotStatus(commandContext.getClient(context));
    } catch (error) {
        if (error?.code === 160002) {
            return commandContext.reply(context, 'Your channel must have the `Read Message History` permission before using this command.');
        }
        logError('start:execute', error, { userId });
        return commandContext.replyError(context, 'There was an error executing this command!');
    }
}

export default {
    name: 'start',
    description: 'Start your mining empire.',
    execute: handleStartCommand,
    handleStartCommand
};
