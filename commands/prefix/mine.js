const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const mineRegions = require('../../config/mineRegions.json'); // JSON for region data
const mineFactors = require('../../config/mineFactors.json'); // JSON for mine factors and prestige data

module.exports = {
    name: 'mine',
    description: 'Manage your mines by buying new ones, visiting them, or managing their production.',
    async execute(message, args) {
        const userId = message.author.id;
        const user = await getUser(userId);

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        const subcommand = args[0];
        switch (subcommand) {
            case 'buy':
                await handleMineBuy(message, args[1], user);
                break;
            case 'visit':
                await handleMineVisit(message, args[1], user);
                break;
            case 'manage':
                await handleMineManage(message, args[1], user);
                break;
            default:
                return message.reply(`@${message.author.username}, to manage your mines, please use \`buy\`, \`visit\`, or \`manage\`.`);
        }
    }
};

async function handleMineBuy(message, mineName, user) {
    if (!mineName) {
        return message.reply('Please specify the name of the mine you want to buy.');
    }

    const mine = mineFactors.find(m => m.name.toLowerCase() === mineName.toLowerCase());
    if (!mine) {
        return message.reply('Invalid mine name. Please specify a valid mine to buy.');
    }

    if (user.currentMine === mineName) {
        return message.reply('You are already working in this mine.');
    }

    const userMines = user.mines.map(m => m.mineName);
    if (userMines.includes(mine.name)) {
        return message.reply('You have already unlocked this mine.');
    }

    if (user.cash < mine.cost) {
        return message.reply(`You don't have enough Cash to buy the ${mine.name}. It costs ${numberFormat(mine.cost)} Cash.`);
    }

    user.cash -= mine.cost;
    user.mines.push({ mineName: mine.name, mineshafts: [], elevator: [], warehouse: [] });
    user.currentMine = mine.name;

    await updateUser(user.id, {
        cash: user.cash,
        mines: user.mines,
        currentMine: user.currentMine
    });

    return message.reply(`Congratulations! You have purchased the ${mine.name} and are now working there.`);
}

async function handleMineVisit(message, mineName, user) {
    if (!mineName) {
        return message.reply('Please specify the name of the mine you want to visit.');
    }

    const userMine = user.mines.find(m => m.mineName.toLowerCase() === mineName.toLowerCase());
    if (!userMine) {
        return message.reply('You do not own this mine.');
    }

    if (user.currentMine === mineName) {
        return message.reply(`You are already in the ${mineName}.`);
    }

    await updateUser(user.id, { currentMine: mineName });
    return message.reply(`You have successfully moved to the ${mineName}.`);
}

async function handleMineManage(message, mineName, user) {
    if (!mineName) {
        return message.reply('Please specify the name of the mine you want to manage.');
    }

    const userMine = user.mines.find(m => m.mineName.toLowerCase() === mineName.toLowerCase());
    if (!userMine) {
        return message.reply('You do not own this mine.');
    }

    const mineFactor = mineFactors.find(m => m.name.toLowerCase() === mineName.toLowerCase()).factor;

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${mineName} Management`)
        .setDescription(`Factor: ${mineFactor}\nNumber of Shafts: ${userMine.mineshafts.length}\nProduction: ${numberFormat(userMine.production || 0)}`)
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}
