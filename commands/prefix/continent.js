const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const continentData = require('../../config/continentData.json').continents;
const mineFactors = require('../../config/mineFactors.json').mines;

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
                return message.reply(`<@${userId}>, to use the continent command for buying or managing continents, please use either \`buy\` or \`manage\` respectively.`);
        }
    }
};

async function handleContinentBuy(message, continentName, user) {
    if (!continentName) {
        return message.reply('Please specify the name of the continent you want to buy.');
    }

    const continent = continentData.find(c => c.ContinentName === continentName);
    if (!continent) {
        return message.reply('Invalid continent name. Please specify a valid continent to buy.');
    }

    if (user.continents && user.continents.includes(continentName)) {
        return message.reply('You have already unlocked this continent.');
    }

    // Check if user meets the requirements for each continent
    if (continentName === 'Ice Continent' && !areAllStarterMinesUnlocked(user)) {
        return message.reply('You need to unlock all starter mines before unlocking the Ice Continent.');
    }
    if (continentName === 'Fire Continent' && !user.continents.includes('Ice Continent')) {
        return message.reply('You need to unlock the Ice Continent before unlocking the Fire Continent.');
    }

    // Check if the user has enough cash depending on the cash type
    const userCash = getUserCashByType(user, continent.CashType);
    if (userCash < continent.Cost) {
        const cashName = getCashNameByType(continent.CashType);
        return message.reply(`You don't have enough ${cashName} to buy the ${continentName}. It costs ${numberFormat(continent.Cost)} ${cashName}.`);
    }

    // Deduct the cost and unlock the continent
    deductUserCashByType(user, continent.CashType, continent.Cost);
    user.continents = user.continents || [];
    user.continents.push(continentName);

    // Unlock the first mine on the continent
    const firstMine = continent.MineTypes[0];
    user.mines = user.mines || [];
    user.mines.push({ mineName: firstMine, unlocked: true });

    await updateUser(user.id, { 
        cash: user.cash, 
        iceCash: user.iceCash, 
        fireCash: user.fireCash,
        continents: user.continents, 
        mines: user.mines 
    });

    return message.reply(`Congratulations! You have purchased the ${continentName} and unlocked the ${firstMine}.`);
}

async function handleContinentManage(message, user) {
    const continentsStatus = continentData.map(continent => ({
        name: continent.ContinentName,
        status: user.continents && user.continents.includes(continent.ContinentName) ? 'Unlocked' : 'Locked'
    }));

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Continent Management')
        .setDescription(continentsStatus.map(c => `${c.name}: ${c.status}`).join('\n'))
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

function areAllStarterMinesUnlocked(user) {
    const starterMines = ['Coal Mine', 'Gold Mine', 'Ruby Mine', 'Diamond Mine', 'Emerald Mine'];
    return starterMines.every(mine => user.mines.some(m => m.mineName === mine && mine.unlocked));
}

function getUserCashByType(user, cashType) {
    switch (cashType) {
        case 1: return user.cash;
        case 2: return user.iceCash;
        case 3: return user.fireCash;
        default: return 0;
    }
}

function deductUserCashByType(user, cashType, amount) {
    switch (cashType) {
        case 1: user.cash -= amount; break;
        case 2: user.iceCash -= amount; break;
        case 3: user.fireCash -= amount; break;
    }
}

function getCashNameByType(cashType) {
    switch (cashType) {
        case 1: return 'Cash';
        case 2: return 'Ice Cash';
        case 3: return 'Fire Cash';
        default: return 'Unknown Cash Type';
    }
}