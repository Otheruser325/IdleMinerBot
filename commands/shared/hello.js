'use strict';

import commandContext from './context.js';

async function handleHelloCommand(context) {
    await commandContext.defer(context);
    return commandContext.reply(context, 'Hello!');
}

export default { handleHelloCommand };
