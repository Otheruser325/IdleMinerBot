const { SlashCommandBuilder } = require('@discordjs/builders');
const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const mineFactors = require('../../config/mineFactors.json').mines;
const mineRegions = require('../../config/mineRegions.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('Manage your mines by buying new ones, visiting them, or managing their production.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Buy a new mine.')
                .addStringOption(option => 
                    option.setName('name')
                        .setDescription('The name of the mine to buy.')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('visit')
                .setDescription('Visit an existing mine.')
                .addStringOption(option => 
                    option.setName('name')
                        .setDescription('The name of the mine to visit.')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('manage')
                .setDescription('Manage an existing mine.')
                .addStringOption(option => 
                    option.setName('name')
                        .setDescription('The name of the mine to manage.')
                        .setRequired(true))),
    async execute(interaction) {
        const userId = interaction.user.id;
        let user = await getUser(userId);

        if (!user) {
            return interaction.reply('You need to start the game first by using `/start`.');
        }

        const subcommand = interaction.options.getSubcommand();
        const mineName = interaction.options.getString('name').toLowerCase(); // Safeguard against empty string

        switch (subcommand) {
            case 'buy':
                await handleMineBuy(interaction, mineName, user, userId);
                break;
            case 'visit':
                await handleMineVisit(interaction, mineName, user, userId);
                break;
            case 'manage':
                await handleMineManage(interaction, mineName, user, userId);
                break;
            default:
                return interaction.reply(`Invalid subcommand. Use \`buy\`, \`visit\`, or \`manage\`.`);
        }
    }
};

async function handleMineBuy(interaction, mineName, user, userId) {
    if (!mineName) {
        return interaction.reply('Please specify the name of the mine you want to buy.');
    }

    const mine = mineFactors.find(m => m.MineName.toLowerCase() === mineName);

    if (!mine) {
        return interaction.reply('Invalid mine name. Please specify a valid mine to buy.');
    }

    const mineExists = user.mines.find(m => m.MineName.toLowerCase() === mineName);

    if (mineExists) {
        return interaction.reply('You already own this mine.');
    }

    if (user.cash < mine.Cost) {
        return interaction.reply(`You don't have enough Cash to buy the ${mine.MineName}. It costs ${numberFormat(mine.Cost)} Cash.`);
    }

    user.cash -= mine.Cost;
    user.mines.push({
        MineName: mine.MineName,
        MineNumber: mine.MineNumber,
        Factor: mine.Factor,
        mineshafts: [],
        elevator: [],
        warehouse: [],
        managers: {
            shaft: [],
            elevator: [],
            warehouse: []
        },
        barriers: mineRegions.map((region, index) => ({
            ...region,
            unlocked: index === 0
        }))
    });
    user.currentMine = mine.MineName;

    await updateUser(userId, {
        cash: user.cash,
        mines: user.mines,
        currentMine: user.currentMine
    });

    return interaction.reply(`Congratulations! You have purchased the ${mine.MineName} and are now working there.`);
}

async function handleMineVisit(interaction, mineName, user, userId) {
    if (!mineName) {
        return interaction.reply('Please specify the name of the mine you want to visit.');
    }

    if (user.currentMine.toLowerCase() === mineName) {
        return interaction.reply(`You are already in the ${mineName}.`);
    }

    const mine = user.mines.find(m => m.MineName.toLowerCase() === mineName);

    if (!mine) {
        return interaction.reply('You do not own this mine.');
    }

    await updateUser(userId, { currentMine: mineName });
    return interaction.reply(`You have successfully moved to the ${mine.MineName}.`);
}

async function handleMineManage(interaction, mineName, user, userId) {
    if (!mineName) {
        return interaction.reply('Please specify the name of the mine you want to manage.');
    }

    const mine = user.mines.find(m => m.MineName.toLowerCase() === mineName);
    if (!mine) {
        return interaction.reply('You do not own this mine.');
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${mine.MineName} Management`)
        .setDescription(`Factor: ${mine.Factor}\nNumber of Shafts: ${mine.mineshafts.length}\nProduction: ${numberFormat(mine.production || 0)}`)
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}
