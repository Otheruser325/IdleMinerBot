'use strict';

import hello from '../shared/hello.js';

export default {
    name: 'hello',
    description: 'Says hello!',
    async execute(message) {
        return hello.handleHelloCommand(message);
    }
};