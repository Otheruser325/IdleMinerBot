import { getUser, commitUserSnapshot, withUserLock } from '../../dataManager.js';
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
import { getAverageMineIdleCashPerSecond, getCombinedMineIdleCashPerSecond, getMaxPrestigeCount, getMineIdleCashPerSecond } from '../../utils/mineOverview.js';
import commandContext from './context.js';

const continentData = continentDataJson.continents;

export default {
    name: 'continent',
    description: 'Manage your continents by buying new ones or checking their status.',
    async execute(message, args = []) {
        const userId = message.user?.id || message.author?.id;
        return withUserLock(userId, async () => {
            const user = await getUser(userId);

            if (!user) {
                return message.reply(`You need to start the game first by using \`${commandContext.commandReference(message, 'start')}\`.`);
            }

            normalizeUserContinentState(user);

            const subcommand = args[0]?.toLowerCase() || 'manage';

            switch (subcommand) {
                case 'buy':
                    return handleContinentBuy(message, args.slice(1).join(' '), user);
                case 'manage':
                    return handleContinentManage(message, user, args.slice(1).join(' '));
                default:
                    return message.reply(`<@${userId}>, to use the continent command for buying or managing continents, please use either \`buy\` or \`manage\` respectively.`);
            }
        });
    }
};

function normalizeUserContinentState(user) {
    user.continents = normalizeOwnedContinents(user.continents);
    if (!userOwnsContinent(user, 'Ice Continent') && (user.ice_cash || 0) === 10) user.ice_cash = 0;
    if (!userOwnsContinent(user, 'Fire Continent') && (user.fire_cash || 0) === 10) user.fire_cash = 0;
    if (!userOwnsContinent(user, 'Dawn Continent') && (user.dawn_cash || 0) === 10) user.dawn_cash = 0;
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
    if (!continentInput) return message.reply('Please specify the continent you want to buy.');

    const resolvedContinent = resolveContinent(continentInput);
    if (!resolvedContinent) return message.reply('Invalid continent name. Try `Start`, `Ice`, `Fire`, or even a mine reference like `Mine 10`.');

    const continent = getContinentConfig(resolvedContinent.name);
    if (!continent) return message.reply('That continent is not configured yet.');
    if (userOwnsContinent(user, resolvedContinent.name)) return message.reply(`You have already unlocked ${resolvedContinent.name}.`);

    const previousContinent = getPreviousContinent(resolvedContinent.name);
    if (!previousContinent) return message.reply(`${resolvedContinent.name} is your starting continent and does not need to be purchased.`);
    if (!userOwnsContinent(user, previousContinent.name)) return message.reply(`You need to unlock ${previousContinent.name} before unlocking ${resolvedContinent.name}.`);

    const missingMines = getMissingMineNamesForContinent(user, previousContinent.name);
    if (missingMines.length > 0) return message.reply(`You need to own every mine in ${previousContinent.name} before unlocking ${resolvedContinent.name}. Missing: ${missingMines.join(', ')}.`);

    const cashField = getUnlockCashFieldForContinent(resolvedContinent.name);
    const cashLabel = getUnlockCashLabelForContinent(resolvedContinent.name);
    const availableCash = user[cashField] || 0;
    if (availableCash < continent.Cost) return message.reply(`You don't have enough ${cashLabel} to unlock ${resolvedContinent.name}. It costs ${numberFormat(continent.Cost)} ${cashLabel}.`);

    user[cashField] = availableCash - continent.Cost;
    user.continents = normalizeOwnedContinents([...user.continents, resolvedContinent.name]);
    const unlockedCashField = getCashFieldForContinent(resolvedContinent.name);
    user[unlockedCashField] = (user[unlockedCashField] || 0) + 10;

    await commitUserSnapshot(user.user_id, {
        cash: user.cash,
        ice_cash: user.ice_cash,
        fire_cash: user.fire_cash,
        dawn_cash: user.dawn_cash,
        continents: user.continents
    });

    const firstMineName = getMineName(resolvedContinent.minMine);
    const targetCashLabel = getCashLabelForContinent(resolvedContinent.name);
    return message.reply(`Congratulations! You unlocked ${resolvedContinent.name} using ${cashLabel} and received 10 ${targetCashLabel}. Your next step is to buy ${firstMineName} with ${targetCashLabel}.`);
}

async function handleContinentManage(message, user, continentInput = '') {
    const requestedContinent = continentInput ? resolveContinent(continentInput) : null;
    if (continentInput && !requestedContinent) return message.reply('Invalid continent name.');
    const currentContinent = requestedContinent?.name || user.current_continent || 'Start Continent';
    const currentMineNumbers = getMinesForContinent(currentContinent);
    const ownedMines = (user.mines || []).filter(mine => currentMineNumbers.includes(mine.mine_number));
    const combinedIdleCash = getCombinedMineIdleCashPerSecond(ownedMines, user.has_premium);
    const averageIdleCash = getAverageMineIdleCashPerSecond(ownedMines, currentMineNumbers.length, user.has_premium);
    const cashField = getCashFieldForContinent(currentContinent);
    const cashLabel = getCashLabelForContinent(currentContinent);
    const mineLines = currentMineNumbers.map(mineNumber => {
        const mineName = getMineName(mineNumber);
        const mine = ownedMines.find(candidate => candidate.mine_number === mineNumber);
        if (!mine) return `${mineName}: Locked | Idle/sec 0`;
        const idleCash = getMineIdleCashPerSecond(mine, user.has_premium);
        return `${mineName}: Prestige ${mine.prestige_count || 0}/${getMaxPrestigeCount(mineNumber)} | Idle/sec ${numberFormat(idleCash)}`;
    });

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${currentContinent} Management`)
        .setDescription([
            `Current Continent: ${currentContinent}`,
            `Cash: ${numberFormat(user[cashField] || 0)} ${cashLabel}`,
            `Owned Mines: ${ownedMines.length}/${currentMineNumbers.length}`,
            `Average Idle Cash/sec (including locked mines): ${numberFormat(averageIdleCash)} ${cashLabel}`,
            `Combined Idle Cash/sec: ${numberFormat(combinedIdleCash)} ${cashLabel}`,
            '',
            ...mineLines
        ].join('\n'))
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}
