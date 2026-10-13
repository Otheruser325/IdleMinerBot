'use strict';

import infoCommand from '../shared/info.js';
const { execute } = infoCommand;

export default {
    name: 'info',
    description: 'Displays information about the bot.',
    aliases: ['information', 'version', 'about'],
    usage: '[page]',
    async execute(message, args) {
        return execute(message, args[0]);
    }
};
