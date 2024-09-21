const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const mineFactors = require('../../config/mineFactors.json').mines;
const mineRegions = require('../../config/mineRegions.json').regions;

module.exports = {
    name: 'mine',
    description: 'Manage your mines by buying new ones, visiting them, or managing their production.',
    async execute(message, args) {
        const userId = message.author.id;
        const user = await getUser(userId);

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        if (args.length < 1) {
            return message.reply(`<@${userId}>, to use the mine command for buying, visiting, or managing mines, please use \`buy\`, \`visit\`, or \`manage\` respectively.`);
        }

        const subcommand = args[0];
        const mineName = args.slice(1).join(' ').toLowerCase();

        if (!mineName && (subcommand === 'buy' || subcommand === 'visit' || subcommand === 'manage')) {
            return message.reply(`Please specify the name of the mine to \`${subcommand}\`.`);
        }

        switch (subcommand) {
            case 'buy':
                await handleMineBuy(message, mineName, user, userId);
                break;
            case 'visit':
                await handleMineVisit(message, mineName, user, userId);
                break;
            case 'manage':
                await handleMineManage(message, mineName, user, userId);
                break;
            default:
                return message.reply(`Invalid subcommand, <@${userId}>! To use the mine command for buying, visiting, or managing mines, please use \`buy\`, \`visit\`, or \`manage\` respectively.`);
        }
    }
};

async function handleMineBuy(message, mineName, user, userId) {
    if (!mineName) {
        return message.reply('Please specify the name of the mine you want to buy.');
    }

    const mine = mineFactors.find(m => m.MineName.toLowerCase() === mineName);

    if (!mine) {
        return message.reply('Invalid mine name. Please specify a valid mine to buy.');
    }

    const mineExists = user.mines.find(m => m.mine_name.toLowerCase() === mineName);

    if (mineExists) {
        return message.reply('You already own this mine.');
    }

    if (user.cash < mine.Cost) {
        return message.reply(`You don't have enough cash to buy the ${mine.MineName}. It costs ${numberFormat(mine.Cost)} cash.`);
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

    return message.reply(`Congratulations! You have purchased the ${mine.MineName} and are now working there.`);
}

async function handleMineVisit(message, mineName, user, userId) {
    if (!mineName) {
        return message.reply('Please specify the name of the mine you want to visit.');
    }

    if (user.current_mine.toLowerCase() === mineName) {
        return message.reply(`You are already in the ${mineName}.`);
    }

    const mine = user.mines.find(m => m.MineName.toLowerCase() === mineName);

    if (!mine) {
        return message.reply('You do not own this mine.');
    }

    await updateUser(userId, { current_mine: mineName });
    return message.reply(`You have successfully moved to the ${mine.MineName}.`);
}

async function handleMineManage(message, mineName, user, userId) {
    if (!mineName) {
        return message.reply('Please specify the name of the mine you want to manage.');
    }

    const mine = user.mines.find(m => m.MineName.toLowerCase() === mineName);
    if (!mine) {
        return message.reply('You do not own this mine.');
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${mine.MineName} Management`)
        .setDescription(`Factor: ${mine.Factor}\nNumber of Shafts: ${mine.mineshafts.length}\nProduction: ${numberFormat(mine.production || 0)}`)
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}