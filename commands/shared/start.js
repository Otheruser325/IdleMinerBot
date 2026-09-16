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

        const helpRef = commandContext.commandReference(context, 'help');
        const shaftRef = commandContext.commandReference(context, 'shaft');
        const shaftBuyRef = commandContext.commandReference(context, 'shaft', 'buy');
        const workShaftRef = commandContext.commandReference(context, 'work', 'shaft 1');
        const workElevatorRef = commandContext.commandReference(context, 'work', 'elevator');
        const workWarehouseRef = commandContext.commandReference(context, 'work', 'warehouse');
        const managerRef = commandContext.commandReference(context, 'manager');
        const mineRef = commandContext.commandReference(context, 'mine');
        const mineOverviewRef = commandContext.commandReference(context, 'mine', 'overview');

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('Welcome to Idle Miner!')
            .setDescription(`Welcome to the mining world, <@${userId}>! Please use \`${helpRef}\` to get you ready and started!`)
            .addFields({
                name: 'Getting Started',
                value: `1. **__Intro__**: Start with the ${shaftRef} command. Use ${shaftBuyRef} to purchase your first shaft.\n\n2. **__Operating the Mine__**: After purchasing, use ${workShaftRef}. Then use ${workElevatorRef} and ${workWarehouseRef} to move and sell minerals.\n\n3. **__Upgrading & Managing__**: Upgrade your shafts with ${commandContext.commandReference(context, 'shaft', 'upgrade')}. Hire managers with ${managerRef} after upgrading to Level 5.\n\n4. **__Managing Mines__**: Use ${mineRef} to operate new mines or check your status with ${mineOverviewRef}.`
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
