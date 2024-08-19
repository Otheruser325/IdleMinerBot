const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');

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
        const availableMines = [
            { name: 'Gold Mine', cost: 76800000000000000, incomeFactor: 3 },
            { name: 'Ruby Mine', cost: 3130000000000000000000000, incomeFactor: 7 },
            { name: 'Diamond Mine', cost: 261000000000000000000000000000, incomeFactor: 12 },
            { name: 'Emerald Mine', cost: 745000000000000000000000000000000000, incomeFactor: 20 }
        ];

        switch (subcommand) {
            case 'buy':
                await handleMineBuy(message, args[1], user, availableMines);
                break;
            case 'visit':
                await handleMineVisit(message, args[1], user);
                break;
            case 'manage':
                await handleMineManage(message, args[1], user);
                break;
            default:
                return message.reply(`@${message.author.username}, if you want to use the mine command for either: purchasing new mines, visiting them, or managing them, you'll need to use either \`buy\`, \`visit\`, or \`manage\` respectively.`);
        }
    }
};

async function handleMineBuy(message, mineName, user, availableMines) {
    if (!mineName) {
        return message.reply('Please specify the name of the mine you want to buy.');
    }

    const mine = availableMines.find(m => m.name.toLowerCase() === mineName.toLowerCase());
    if (!mine) {
        return message.reply('Invalid mine name. Please specify a valid mine to buy.');
    }

    if (user.currentMine === mine.name) {
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

    if (user.currentMine === mineName) {
        return message.reply(`You are already in the ${mineName}.`);
    }

    const userMine = user.mines.find(m => m.mineName.toLowerCase() === mineName.toLowerCase());
    if (!userMine) {
        return message.reply('You do not own this mine.');
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

    const incomeFactor = availableMines.find(m => m.name.toLowerCase() === mineName.toLowerCase()).incomeFactor;

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${mineName} Management`)
        .setDescription(`Income Factor: ${incomeFactor}\nNumber of Shafts: ${userMine.mineshafts.length}\nProduction: ${numberFormat(userMine.production || 0)}`)
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}
