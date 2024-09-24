const { SlashCommandBuilder } = require('@discordjs/builders');
const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const mineFactors = require('../../config/mineFactors.json').mines;
const mineRegions = require('../../config/mineRegions.json').regions;

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
                        .setRequired(true)))
		.addSubcommand(subcommand =>
            subcommand
                .setName('prestige')
                .setDescription('Prestige an existing mine.')
                .addStringOption(option => 
                    option.setName('name')
                        .setDescription('The name of the mine to prestige.')
                        .setRequired(true))),
    async execute(interaction) {
        const userId = interaction.user.id;
        let user = await getUser(userId);

        if (!user) {
            return interaction.reply('You need to start the game first by using `/start`.');
        }

        const subcommand = interaction.options.getSubcommand();
        const mineName = interaction.options.getString('name');

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
			case 'prestige':
                await handleMinePrestige(interaction, mineName, user, userId);
                break;
            default:
                return interaction.reply(`Invalid subcommand. Use \`buy\`, \`visit\`, \`manage\`, or \`prestige\`.`);
        }
    }
};

async function handleMineBuy(interaction, mineName, user, userId) {
    if (!mineName) {
        return interaction.reply('Please specify the name of the mine you want to buy.');
    }

    const mine = mineFactors.find(m => m.MineName.toLowerCase() === mineName.toLowerCase());

    if (!mine) {
        return interaction.reply('Invalid mine name. Please specify a valid mine to buy.');
    }

    const mineExists = user.mines.find(m => m.mine_name === mineName);

    if (mineExists) {
        return interaction.reply('You already own this mine.');
    }

    if (user.cash < mine.Cost) {
        return interaction.reply(`You don't have enough cash to buy the ${mine.MineName}. It costs ${numberFormat(mine.Cost)} cash.`);
    }

    user.cash -= mine.Cost;
    user.mines.push({
        mine_name: mine.MineName,
        mine_number: mine.MineNumber,
        factor: mine.Factor,
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
    user.current_mine = mine.MineName;

    await updateUser(userId, {
        cash: user.cash,
        mines: user.mines,
        current_mine: user.current_mine
    });

    return interaction.reply(`Congratulations! You have purchased the ${mine.MineName} and are now working there.`);
}

async function handleMineVisit(interaction, mineName, user, userId) {
    if (!mineName) {
        return interaction.reply('Please specify the name of the mine you want to visit.');
    }
	
	const selectedMine = user.mines.find(m => m.mine_name.toLowerCase() === mineName.toLowerCase());

    if (!selectedMine) {
        return interaction.reply('You do not own this mine.');
    }

    if (user.current_mine === selectedMine.mine_name) {
        return interaction.reply(`You are already in the ${selectedMine.mine_name}.`);
    }

    await updateUser(userId, { current_mine: selectedMine.mine_name });

    return interaction.reply(`You have successfully moved to the ${selectedMine.mine_name}.`);
}

async function handleMineManage(interaction, mineName, user, userId) {
    if (!mineName) {
        return interaction.reply('Please specify the name of the mine you want to manage.');
    }

    const mine = user.mines.find(m => m.mine_name.toLowerCase() === mineName.toLowerCase());
    if (!mine) {
        return interaction.reply('You do not own this mine.');
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${mine.mine_name} Management`)
        .setDescription(`Factor: ${mine.Factor}\nNumber of Shafts: ${mine.mineshafts.length}\nProduction: ${numberFormat(mine.production || 0)}`)
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

async function handleMinePrestige(interaction, mineName, user, userId) {
    if (!mineName) {
        return interaction.reply('Please specify the name of the mine you want to prestige.');
    }

    const mine = user.mines.find(m => m.mine_name.toLowerCase() === mineName.toLowerCase());

    if (!mine) {
        return interaction.reply('You do not own this mine.');
    }

    const currentPrestigeLevel = mineFactors.find(factor => factor.MineName === mine.mine_name && factor.PrestigeCount === mine.prestige_count);

    if (!currentPrestigeLevel) {
        return interaction.reply('Invalid prestige level for this mine.');
    }

    const nextPrestigeLevel = mineFactors.find(factor => factor.MineName === mine.mine_name && factor.PrestigeCount === mine.prestige_count + 1);

    if (!nextPrestigeLevel) {
        return interaction.reply('You have already maxed out the prestige for this mine.');
    }

    if (user.cash < nextPrestigeLevel.Cost) {
        return interaction.reply(`You don't have enough Cash to prestige the ${mine.mine_name}. You need ${numberFormat(nextPrestigeLevel.Cost)} Cash.`);
    }

    // Deduct the cash and update the mine prestige
	user.cash -= nextPrestigeLevel.Cost;
    user.super_cash += nextPrestigeLevel.SuperCashGained;
    mine.factor = nextPrestigeLevel.Factor;
    mine.prestige_count = nextPrestigeLevel.PrestigeCount;

    // Resort the mines based on mine_number after successful prestige
    user.mines.sort((a, b) => a.mine_number - b.mine_number);

    await updateUser(userId, {
		cash: user.cash,
        super_cash: user.super_cash,
        mines: user.mines
    });

    return interaction.reply(`Congratulations! Your ${mine.mine_name} has been prestiged to level ${nextPrestigeLevel.PrestigeCount}. It now has a production factor of ${nextPrestigeLevel.Factor}.`);
}