'use strict';

import { getSupabaseClient } from '../supabase.js';
import { ActivityType } from 'discord.js';

let lastKnownUserCount = null;

function buildStatusText(userCount) {
    return `${userCount} ${userCount === 1 ? 'user is' : 'users are'} mining!`;
}

export async function updateBotStatus(client) {
    if (!client?.user) return false;

    try {
        const { count, error } = await getSupabaseClient()
            .from('users')
            .select('id', { count: 'exact', head: true })
            .limit(1);
        if (error) throw error;

        const userCount = Number(count) || 0;
        lastKnownUserCount = userCount;
        const statusText = buildStatusText(userCount);

        if (typeof client.user.setActivity === 'function') {
            await client.user.setActivity(statusText, { type: ActivityType.Playing });
        } else if (typeof client.user.setPresence === 'function') {
            await client.user.setPresence({
                status: 'online',
                activities: [{ name: statusText, type: ActivityType.Playing }]
            });
        }
        return true;
    } catch (error) {
        try {
            const fallbackText = lastKnownUserCount === null
                ? 'Waiting for miners...'
                : buildStatusText(lastKnownUserCount);
            if (typeof client.user.setActivity === 'function') {
                await client.user.setActivity(fallbackText, { type: ActivityType.Playing });
            } else if (typeof client.user.setPresence === 'function') {
                await client.user.setPresence({
                    status: 'online',
                    activities: [{ name: fallbackText, type: ActivityType.Playing }]
                });
            }
        } catch {
            // A presence failure must not terminate the bot or scheduler.
        }
        return false;
    }
}

export function resetBotStatusForTests() {
    lastKnownUserCount = null;
}

export default { updateBotStatus, resetBotStatusForTests };
