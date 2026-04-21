export default async function guildDM(user, message) {
    try {
        await user.send(message);
    } catch (error) {
        console.error(`Failed to send DM to ${user.tag}:`, error);
    }
}