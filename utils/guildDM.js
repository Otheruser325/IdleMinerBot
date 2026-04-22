import { logError } from './errorHandling.js';

export default async function guildDM(user, message) {
    try {
        await user.send(message);
    } catch (error) {
        logError('guildDM', error, { userId: user?.id, tag: user?.tag });
    }
}
