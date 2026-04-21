import supabase from './supabaseClient.js';
import { ActivityType } from 'discord.js';

let lastKnownUserCount = null;

function buildStatusText(userCount) {
    if (userCount === 1) {
        return '1 user is mining!';
    }

    return `${userCount} users are mining!`;
}

export async function updateBotStatus(client) {
    try {
        if (!client?.user) {
            return;
        }

        const { error: checkError } = await supabase
            .from('users')
            .select('user_id', { count: 'exact', head: true })
            .limit(1);

        if (checkError?.code === '42P01' || checkError?.message?.includes('relation') || checkError?.message?.includes('does not exist')) {
            console.log('Users table not ready, skipping status update');
            await client.user.setPresence({
                status: 'online',
                activities: [{ name: 'Idle Miner Bot', type: ActivityType.Playing }]
            });
            return;
        }

        const { count, error } = await supabase
            .from('users')
            .select('user_id', { count: 'exact', head: true });

        if (error) {
            throw new Error(`Error fetching users: ${error.message}`);
        }

        const userCount = count || 0;
        lastKnownUserCount = userCount;
        const statusText = buildStatusText(userCount);

        await client.user.setPresence({
            status: 'online',
            activities: [{ name: statusText, type: ActivityType.Playing }]
        });
        console.log(`Bot status updated: ${statusText}`);
    } catch (error) {
        console.error('Error updating bot status:', error.message);

        try {
            const fallbackText = lastKnownUserCount !== null
                ? buildStatusText(lastKnownUserCount)
                : 'Waiting for conquest...';

            await client.user.setPresence({
                status: 'online',
                activities: [{ name: fallbackText, type: ActivityType.Playing }]
            });
        } catch {
            // Ignore if this also fails
        }
    }
}
