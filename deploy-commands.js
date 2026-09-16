import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import dotenv from 'dotenv';

dotenv.config();

function commandSignature(command) {
    return JSON.stringify({
        name: command.name,
        description: command.description || '',
        options: command.options || []
    });
}

const deployCommands = async (clientId, token, slashCommands) => {
    if (!clientId || !token) {
        console.warn('Skipping slash-command deployment: CLIENT_ID or TOKEN is missing.');
        return false;
    }

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        console.log('Started refreshing global application (/) commands.');
        const commands = [...slashCommands.values()].map(command => command.data.toJSON());
        const existingCommands = await rest.get(Routes.applicationCommands(clientId));
        const existingByName = new Map(existingCommands.map(command => [command.name, command]));

        for (const existingCommand of existingCommands) {
            if (commands.some(command => command.name === existingCommand.name)) continue;
            try {
                await rest.delete(Routes.applicationCommand(clientId, existingCommand.id));
                console.log(`Deleted command: ${existingCommand.name}`);
            } catch (error) {
                console.error(`Failed to delete command ${existingCommand.name}:`, error.message || error);
            }
        }

        for (const command of commands) {
            const existingCommand = existingByName.get(command.name);
            try {
                if (!existingCommand) {
                    await rest.post(Routes.applicationCommands(clientId), { body: command });
                    console.log(`Registered command: ${command.name}`);
                } else if (commandSignature(existingCommand) !== commandSignature(command)) {
                    await rest.patch(Routes.applicationCommand(clientId, existingCommand.id), { body: command });
                    console.log(`Updated command: ${command.name}`);
                } else {
                    console.log(`Command unchanged: ${command.name}`);
                }
            } catch (error) {
                console.error(`Failed to deploy command ${command.name}:`, error.message || error);
            }
        }

        console.log('Successfully reloaded global application (/) commands.');
        return true;
    } catch (error) {
        console.error('Error refreshing global application (/) commands:', error.message || error);
        return false;
    }
};

export { deployCommands };
export default { deployCommands };
