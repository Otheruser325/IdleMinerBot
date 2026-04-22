import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logError, safeEditMessage, safeUpdateInteraction } from '../../utils/errorHandling.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsPerPage = 10; // Number of commands per page

export default {
    name: 'help',
    description: 'Lists all available prefix commands or provides detailed help for a specific command.',
    async execute(message, args) {
        // Load prefix command files
        const commandFiles = fs.readdirSync(path.join(__dirname, '../../commands/prefix')).filter(file => file.endsWith('.js'));

        const defaultCommands = [];

        for (const file of commandFiles) {
            const commandPath = path.join(__dirname, '../../commands/prefix', file);
            const commandModule = await import('file://' + commandPath);
            const command = commandModule.default || commandModule;
            if (command.name === 'help') continue; // Skip the help command

            let commandName = command.name;
            let description = command.description || 'No description available'; // Provide default description

            if (command.aliases && command.aliases.length > 0) {
                commandName += ` (Aliases: ${command.aliases.join(', ')})`;
            }

            description += `\n${command.usage ? `Usage: ${command.usage}` : ''}`;

            defaultCommands.push({ name: commandName, description: description });
        }

        const generateEmbed = (commands, page) => {
            const start = (page - 1) * commandsPerPage;
            const currentCommands = commands.slice(start, start + commandsPerPage);

            const embed = new EmbedBuilder()
                .setColor('Blue')
                .setTimestamp();

            currentCommands.forEach(cmd => {
                embed.addFields({ name: cmd.name || 'No name', value: cmd.description || 'No description' });
            });

            embed.setFooter({ text: `Page ${page} of ${Math.ceil(commands.length / commandsPerPage)}` });
            return embed;
        };

        const generateButtons = (currentPage, totalPages) => {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('previous')
                    .setLabel('◀️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === 1),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('▶️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === totalPages)
            );
            return row;
        };

        let currentPage = 1;
        const totalPages = Math.ceil(defaultCommands.length / commandsPerPage);

        try {
            const messageReply = await message.reply({ embeds: [generateEmbed(defaultCommands, currentPage)], components: [generateButtons(currentPage, totalPages)], fetchReply: true });

            const filter = (i) => i.user.id === message.author.id;
            const collector = messageReply.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async (i) => {
                if (i.customId === 'previous' && currentPage > 1) {
                    currentPage--;
                } else if (i.customId === 'next' && currentPage < totalPages) {
                    currentPage++;
                }

                const newEmbed = generateEmbed(defaultCommands, currentPage);
                await safeUpdateInteraction(
                    i,
                    { embeds: [newEmbed], components: [generateButtons(currentPage, totalPages)] },
                    'help:collector:update',
                    { userId: i?.user?.id }
                );
            });

            collector.on('end', async () => {
                if (messageReply.editable) {
                    await safeEditMessage(
                        messageReply,
                        { components: [] },
                        'help:collector:end',
                        { messageId: messageReply?.id }
                    );
                }
            });

        } catch (error) {
            logError('help:initialReply', error, { userId: message?.author?.id });
        }
    }
};
