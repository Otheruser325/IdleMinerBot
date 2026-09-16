'use strict';

import { getUser, updateUserTransaction, commitUserSnapshot } from '../../dataManager.js';

function getCommandUserId(context) {
    return context?.user?.id || context?.author?.id || null;
}

async function getCommandUser(context) {
    const userId = getCommandUserId(context);
    return userId ? getUser(userId) : null;
}

async function commitUserTransaction(context, mutator) {
    const userId = getCommandUserId(context);
    if (!userId) throw new TypeError('A command user is required for a user transaction.');
    if (typeof mutator !== 'function') throw new TypeError('A user transaction mutator is required.');
    return updateUserTransaction(userId, mutator);
}

async function commitCommandSnapshot(context, user) {
    const userId = getCommandUserId(context);
    if (!userId) throw new TypeError('A command user is required for a snapshot commit.');
    return commitUserSnapshot(userId, user);
}

export { getCommandUserId, getCommandUser, commitUserTransaction, commitCommandSnapshot };
export default { getCommandUserId, getCommandUser, commitUserTransaction, commitCommandSnapshot };
