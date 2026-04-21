import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import { EmbedBuilder } from 'discord.js';
import numberFormat from '../../utils/numberFormat.js';
import continentDataJson from '../../config/continentData.json' with { type: 'json' };
import { getMineName } from '../../utils/mineLooker.js';
import {
    getCashFieldForContinent,
    getCashLabelForContinent,
    getMinesForContinent,
    getPreviousContinent,
    getUnlockCashFieldForContinent,
    getUnlockCashLabelForContinent,
    normalizeMineData,
    normalizeOwnedContinents,
    resolveContinent,
    userOwnsContinent
} from '../../utils/continentLooker.js';

const continentData = continentDataJson.continents;

export default {
    name: 'continent',
    description: 'Manage your continents by buying new ones or checking their status.',
    async execute(message, args) {
        const userId = message.author.id;
        return withUserLock(userId, async () => {
            const user = await getUser(userId);

            if (!user) {
                return message.reply('You need to start the game first by using `im!start` (or `/start` if using slash).');
            }

            normalizeUserContinentState(user);

            const subcommand = args[0]?.toLowerCase();

            switch (subcommand) {
                case 'buy':
                    return handleContinentBuy(message, args.slice(1).join(' '), user);
                case 'manage':
                    return handleContinentManage(message, user);
                default:
                    return message.reply(`<@${userId}>, to use the continent command for buying or managing continents, please use either \`buy\` or \`manage\` respectively.`);
            }
        });
    }
};

function normalizeUserContinentState(user) {
    user.continents = normalizeOwnedContinents(user.continents);
    user.mines = (user.mines || [])
        .map(normalizeMineData)
        .sort((left, right) => (left.mine_number || 0) - (right.mine_number || 0));
}

function getContinentConfig(continentName) {
    return continentData.find(continent => continent.ContinentName === continentName) || null;
}

function getOwnedMineNumbers(user) {
    return new Set((user.mines || []).map(mine => mine.mine_number));
}

function getMissingMineNamesForContinent(user, continentName) {
    const ownedMineNumbers = getOwnedMineNumbers(user);
    return getMinesForContinent(continentName)
        .filter(mineNumber => !ownedMineNumbers.has(mineNumber))
        .map(getMineName);
}

async function handleContinentBuy(message, continentInput, user) {
    if (!continentInput) {
        return message.reply('Please specify the continent you want to buy.');
    }

    const resolvedContinent = resolveContinent(continentInput);
    if (!resolvedContinent) {
        return message.reply('Invalid continent name. Try `Start`, `Ice`, `Fire`, or even a mine reference like `Mine 10`.');
    }

    const continent = getContinentConfig(resolvedContinent.name);
    if (!continent) {
        return message.reply('That continent is not configured yet.');
    }

    if (userOwnsContinent(user, resolvedContinent.name)) {
        return message.reply(`You have already unlocked ${resolvedContinent.name}.`);
    }

    const previousContinent = getPreviousContinent(resolvedContinent.name);
    if (!previousContinent) {
        return message.reply(`${resolvedContinent.name} is your starting continent and does not need to be purchased.`);
    }

    if (!userOwnsContinent(user, previousContinent.name)) {
        return message.reply(`You need to unlock ${previousContinent.name} before unlocking ${resolvedContinent.name}.`);
    }

    const missingMines = getMissingMineNamesForContinent(user, previousContinent.name);
    if (missingMines.length > 0) {
        return message.reply(`You need to own every mine in ${previousContinent.name} before unlocking ${resolvedContinent.name}. Missing: ${missingMines.join(', ')}.`);
    }

    const cashField = getUnlockCashFieldForContinent(resolvedContinent.name);
    const cashLabel = getUnlockCashLabelForContinent(resolvedContinent.name);
    const availableCash = user[cashField] || 0;

    if (availableCash < continent.Cost) {
        return message.reply(`You don't have enough ${cashLabel} to unlock ${resolvedContinent.name}. It costs ${numberFormat(continent.Cost)} ${cashLabel}.`);
    }

    user[cashField] = availableCash - continent.Cost;
    user.continents = normalizeOwnedContinents([...user.continents, resolvedContinent.name]);

    await updateUser(user.user_id, {
        cash: user.cash,
        ice_cash: user.ice_cash,
        fire_cash: user.fire_cash,
        continents: user.continents
    });

    const firstMineName = getMineName(resolvedContinent.minMine);
    const targetCashLabel = getCashLabelForContinent(resolvedContinent.name);
    return message.reply(`Congratulations! You unlocked ${resolvedContinent.name} using ${cashLabel}. Your next step is to buy ${firstMineName} with ${targetCashLabel}.`);
}

async function handleContinentManage(message, user) {
    const currentContinent = user.current_continent || 'Start Continent';
    const continentLines = continentData.map(continent => {
        const isUnlocked = userOwnsContinent(user, continent.ContinentName);
        const previousContinent = getPreviousContinent(continent.ContinentName);

        if (isUnlocked) {
            const mineCount = getMinesForContinent(continent.ContinentName).length;
            const ownedMineCount = mineCount - getMissingMineNamesForContinent(user, continent.ContinentName).length;
            return `${continent.ContinentName}: Unlocked (${ownedMineCount}/${mineCount} mines owned)`;
        }

        if (!previousContinent) {
            return `${continent.ContinentName}: Starting continent`;
        }

        const unlockCashLabel = getUnlockCashLabelForContinent(continent.ContinentName);
        const missingMines = getMissingMineNamesForContinent(user, previousContinent.name);
        const mineRequirement = missingMines.length === 0
            ? 'Mine requirement met'
            : `${missingMines.length} previous-continent mines still needed`;

        return `${continent.ContinentName}: Locked | Cost ${numberFormat(continent.Cost)} ${unlockCashLabel} | ${mineRequirement}`;
    });

    const walletLines = [
        `Starter Cash: ${numberFormat(user[getCashFieldForContinent('Start Continent')] || 0)}`,
        `Ice Cash: ${numberFormat(user[getCashFieldForContinent('Ice Continent')] || 0)}`,
        `Fire Cash: ${numberFormat(user[getCashFieldForContinent('Fire Continent')] || 0)}`
    ];

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Continent Management')
        .setDescription([
            `Current Continent: ${currentContinent}`,
            '',
            'Continents:',
            continentLines.join('\n'),
            '',
            'Wallets:',
            walletLines.join('\n')
        ].join('\n'))
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}
