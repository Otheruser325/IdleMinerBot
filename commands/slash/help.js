const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const commandsPerPage = 10; // Number of commands per page

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Lists all available slash commands or provides detailed help for a specific command.'),
    async execute(interaction) {
        // Load slash command files
        const commandFiles = fs.readdirSync(path.join(__dirname, '../../commands/slash')).filter(file => file.endsWith('.js'));

        const defaultCommands = [];

        for (const file of commandFiles) {
            const command = require(path.join(__dirname, '../../commands/slash', file));
            if (command.data.name === 'help') continue; // Skip the help command

            let commandName = command.data.name;
            let description = command.data.description;

            if (command.data.aliases && command.data.aliases.length > 0) {
                commandName += ` (Aliases: ${command.data.aliases.join(', ')})`;
            }

            description += `\n${command.data.usage ? `Usage: ${command.data.usage}` : ''}`;

            defaultCommands.push({ name: commandName, description: description });
        }

        const generateEmbed = (commands, page) => {
            const start = (page - 1) * commandsPerPage;
            const currentCommands = commands.slice(start, start + commandsPerPage);

            const embed = new EmbedBuilder()
                .setColor('Blue')
                .setTimestamp();

            currentCommands.forEach(cmd => {
                embed.addFields({ name: cmd.name, value: cmd.description });
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
            const messageReply = await interaction.reply({ embeds: [generateEmbed(defaultCommands, currentPage)], components: [generateButtons(currentPage, totalPages)], fetchReply: true });

            const filter = (i) => i.user.id === interaction.user.id;
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
                        return interaction.followUp(`The help embed was deleted and couldn't be recovered, please try again later.`);
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
                            return interaction.followUp(`The help embed was deleted and couldn't be recovered, please try again later.`);
                        } else if (error.code === 10062) {
                            return interaction.followUp(`My systematic networking is currently out of sync and timed out. Please try again later.`);
                        } else if (error.code === 40060) {
                            return interaction.followUp("I couldn't reuse this interaction as I've already acknowledged it. Please try again later.");
                        } else if (error.status === 403 || error.status === 404 || error.status === 503 || error.status === 520) {
                            return interaction.followUp(`An unexpected error occurred. Please try again later.`);
                        } else if (error.message.includes("Interaction was not replied")) {
                            return interaction.followUp(`An interaction error occurred. Please try again later.`);
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
