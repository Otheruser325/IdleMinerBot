const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const commandsPerPage = 10; // Number of commands per page

module.exports = {
    name: 'help',
    description: 'Lists all available prefix commands or provides detailed help for a specific command.',
    async execute(message, args) {
        // Load prefix command files
        const commandFiles = fs.readdirSync(path.join(__dirname, '../../commands/prefix')).filter(file => file.endsWith('.js'));

        const defaultCommands = [];

        for (const file of commandFiles) {
            const command = require(path.join(__dirname, '../../commands/prefix', file));
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

                try {
                    const newEmbed = generateEmbed(defaultCommands, currentPage);
                    await i.update({ embeds: [newEmbed], components: [generateButtons(currentPage, totalPages)] });
                } catch (error) {
                    if (error.code === 10008) {
                        // Handle unknown message error (e.g., message was deleted)
                        console.error('The message was not found or has been deleted.');
                    } else {
                        // Handle other errors
                        console.error('Error updating message:', error);
                    }
                }
            });

            collector.on('end', async () => {
                if (messageReply.editable) {
                    try {
                        await messageReply.edit({ components: [] });
                    } catch (error) {
                        if (error.code === 10008) {
                            // Handle unknown message error
                            console.error('The message was not found or has been deleted.');
                        } else {
                            // Handle other errors
                            console.error('Error removing components:', error);
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Error sending initial help message:', error);
        }
    }
};
