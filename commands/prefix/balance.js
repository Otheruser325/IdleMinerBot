'use strict';

import balance from '../shared/balance.js';

export default {
    name: 'balance',
    description: 'Check your balance and cash types.',
    aliases: ['bank', 'bal'],
    usage: '(optional) <user>',
    exampleUsage: 'im!balance @username or im!balance 1234567890',
    async execute(message, args = []) {
        return balance.handleBalanceCommand(message, { rawArg: args[0] });
    }
};
