'use strict';

import daily from '../shared/daily.js';

export default {
    name: 'daily',
    description: 'Claim your daily Super Cash.',
    async execute(message) {
        return daily.handleDailyCommand(message);
    }
};
