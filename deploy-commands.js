const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10'); // Updated to v10
const dotenv = require('dotenv');

dotenv.config();

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

const deployCommands = async (clientId, token, slashCommands) => {
    const rest = new REST({ version: '10' }).setToken(token); // Updated to v10

    try {
        console.log('Started refreshing global application (/) commands.');

        const commands = [...slashCommands.values()].map(command => command.data.toJSON());

        // Fetch existing global commands
        const existingCommands = await rest.get(Routes.applicationCommands(clientId));

        // Delete commands that are not in the current commands directory
        for (const existingCommand of existingCommands) {
            if (!commands.some(cmd => cmd.name === existingCommand.name)) {
                await rest.delete(Routes.applicationCommand(clientId, existingCommand.id));
                console.log(`Deleted command: ${existingCommand.name}`);
            }
        }

        // Register or update current slash commands globally
        for (const command of commands) {
            const existingCommand = existingCommands.find(cmd => cmd.name === command.name);
            if (existingCommand) {
                // Update existing command
                await rest.patch(Routes.applicationCommand(clientId, existingCommand.id), { body: command });
                console.log(`Updated command: ${command.name}`);
            } else {
                // Register new command globally
                await rest.post(Routes.applicationCommands(clientId), { body: command });
                console.log(`Registered command: ${command.name}`);
            }
        }

        console.log('Successfully reloaded global application (/) commands.');
    } catch (error) {
        console.error('Error refreshing global application (/) commands:', error);
    }
};

module.exports = {
    deployCommands
};
