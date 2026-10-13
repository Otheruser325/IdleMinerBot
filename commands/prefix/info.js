'use strict';

import info from '../shared/info.js';

export default {
    name: 'info',
    description: 'Get information about Idle Miner Bot and its patch notes.',
    aliases: ['patch', 'patchnotes', 'version'],
    usage: '(optional) <page>',
    exampleUsage: 'im!info or im!info 2',
    async execute(message, args = []) {
        return info.handleInfoCommand(message, { page: args[0] });
    }
};
