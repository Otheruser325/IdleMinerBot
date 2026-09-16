'use strict';

import monthly from '../shared/monthly.js';

export default {
    name: 'monthly',
    description: 'Claim your monthly Super Cash (premium users only).',
    async execute(message) {
        return monthly.handleMonthlyCommand(message);
    }
};
