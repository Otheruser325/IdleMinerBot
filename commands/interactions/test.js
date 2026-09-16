'use strict';

import { acknowledgeComponent, updateComponent } from '../../utils/interactionSessions.js';

export default {
    customId: 'test',
    async execute(interaction) {
        if (!await acknowledgeComponent(interaction, 'interaction.test')) return;
        return updateComponent(interaction, {
            content: 'This interaction is specifically designed for testing purposes.',
            components: []
        });
    }
};
