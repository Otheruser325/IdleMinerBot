const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');

module.exports = {
    name: 'continent',
    description: 'Manage your continents by buying new ones or checking their status.',
    async execute(message, args) {
        const userId = message.author.id;
        const user = await getUser(userId);

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        const subcommand = args[0];

        switch (subcommand) {
            case 'buy':
                await handleContinentBuy(message, args[1], user);
                break;
            case 'manage':
                await handleContinentManage(message, user);
                break;
            default:
                return message.reply(`@${message.author.username}, if you want to use the continent command for either: buying new continents or managing them, you'll need to use either \`buy\` or \`manage\` respectively.`);
        }
    }
};

async function handleContinentBuy(message, continentName, user) {
    if (!continentName) {
        return message.reply('Please specify the name of the continent you want to buy.');
    }

    const continents = {
        'Ice Continent': { cost: 1000000000000000000000000000, requires: 'All Starter Mines Unlocked' },
        'Fire Continent': { cost: 1000000000000000000000000000000, requires: 'Ice Continent Unlocked' }
    };

    const continent = continents[continentName];

    if (!continent) {
        return message.reply('Invalid continent name. Please specify a valid continent to buy.');
    }

    if (user.continents && user.continents.includes(continentName)) {
        return message.reply('You have already unlocked this continent.');
    }

    if (continent.requires === 'All Starter Mines Unlocked' && !areAllStarterMinesUnlocked(user)) {
        return message.reply('You need to unlock all starter mines before unlocking the Ice Continent.');
    }

    if (continent.requires === 'Ice Continent Unlocked' && !user.continents.includes('Ice Continent')) {
        return message.reply('You need to unlock the Ice Continent before unlocking the Fire Continent.');
    }

    if (user.cash < continent.cost) {
        return message.reply(`You don't have enough Cash to buy the ${continentName}. It costs ${numberFormat(continent.cost)} Cash.`);
    }

    user.cash -= continent.cost;
    user.continents = user.continents || [];
    user.continents.push(continentName);

    await updateUser(user.id, { cash: user.cash, continents: user.continents });
    return message.reply(`Congratulations! You have purchased the ${continentName}.`);
}

async function handleContinentManage(message, user) {
    const continents = [
        { name: 'Starter Continent', status: 'Unlocked' },
        { name: 'Ice Continent', status: user.continents && user.continents.includes('Ice Continent') ? 'Unlocked' : 'Locked' },
        { name: 'Fire Continent', status: user.continents && user.continents.includes('Fire Continent') ? 'Unlocked' : 'Locked' }
    ];

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Continent Management')
        .setDescription(continents.map(c => `${c.name}: ${c.status}`).join('\n'))
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

function areAllStarterMinesUnlocked(user) {
    const starterMines = ['Coal Mine', 'Gold Mine', 'Ruby Mine', 'Diamond Mine', 'Emerald Mine'];
    return starterMines.every(mine => user.mines.some(m => m.mineName === mine));
}
