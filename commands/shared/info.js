'use strict';

import { EmbedBuilder } from 'discord.js';
import patchNotesJson from '../../config/patchnotes.json' with { type: 'json' };
import commandContext from './context.js';

// Patch notes for Idle Miner Bot
const patchNotes = patchNotesJson.patchnotes || [];

function resolvePage(input) {
    let page = Number.parseInt(input, 10);
    if (!Number.isInteger(page) || page < 1 || page > patchNotes.length) {
        page = 1; // Default to latest (first) page if missing or invalid
    }
    return page;
}

async function handleInfoCommand(context, { page = 1 } = {}) {
    await commandContext.defer(context);

    const actor = commandContext.getActor(context);
    const resolvedPage = resolvePage(page);
    const note = patchNotes[resolvedPage - 1]; // Pages are 1-indexed for users

    if (!note) {
        return commandContext.reply(context, 'Patch notes are not available right now.');
    }

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Idle Miner Bot Information')
        .setDescription('Here is some information about the bot:')
        .addFields(
            { name: 'Version', value: note.version },
            { name: 'Date', value: new Date(note.date).toLocaleDateString() },
            { name: 'Developer', value: '<@822964244697710612>' },
            { name: 'New Features', value: note.features },
            { name: 'Description', value: 'A Discord bot that brings Idle Miner Tycoon to your server with mines, shafts, elevators, warehouses, managers, and barriers.' },
            { name: 'Open Source', value: 'https://github.com/Otheruser325/IdleMinerBot' }
        )
        .setTimestamp()
        .setFooter({
            text: `Page ${resolvedPage} of ${patchNotes.length} | Thank you for using our bot!`,
            iconURL: actor?.displayAvatarURL?.()
        });

    return commandContext.reply(context, { embeds: [embed] });
}

export { patchNotes, resolvePage };
export default {
    name: 'info',
    description: 'Get information about Idle Miner Bot and its patch notes.',
    aliases: ['patch', 'patchnotes', 'version'],
    usage: '(optional) <page>',
    exampleUsage: 'im!info or im!info 2',
    handleInfoCommand,
    execute: (context, args = []) => handleInfoCommand(context, { page: Array.isArray(args) ? args[0] : args })
};
