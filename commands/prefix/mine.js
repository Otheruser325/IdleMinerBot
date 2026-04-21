import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import { EmbedBuilder } from 'discord.js';
import numberFormat from '../../utils/numberFormat.js';
import mineFactorsJson from '../../config/mineFactors.json' with { type: 'json' };
import mineRegionsJson from '../../config/mineRegions.json' with { type: 'json' };
import { getMineName, resolveMine } from '../../utils/mineLooker.js';
import {
    getCashField,
    getCashLabelByField,
    getContinentByMineNumber,
    normalizeMineData,
    normalizeOwnedContinents,
    userOwnsContinent
} from '../../utils/continentLooker.js';

const mineFactors = mineFactorsJson.mines;
const mineRegions = mineRegionsJson.regions;

export default {
    name: 'mine',
    description: 'Manage your mines by buying new ones, visiting them, or managing their production.',
    async execute(message, args) {
        const userId = message.author.id;
        return withUserLock(userId, async () => {
            const user = await getUser(userId);

            if (!user) {
                return message.reply('You need to start the game first by using `im!start` (or `/start` if using slash).');
            }

            normalizeUserMineState(user);

            if (args.length < 1) {
                return message.reply(`<@${userId}>, to use the mine command for buying, visiting, or managing mines, please use \`buy\`, \`visit\`, \`manage\`, or \`prestige\` respectively.`);
            }

            const subcommand = args[0].toLowerCase();
            const mineName = args.slice(1).join(' ');

            if (!mineName && ['buy', 'visit', 'manage', 'prestige'].includes(subcommand)) {
                return message.reply(`Please specify the name or number of the mine to \`${subcommand}\`.`);
            }

            switch (subcommand) {
                case 'buy':
                    return handleMineBuy(message, mineName, user, userId);
                case 'visit':
                    return handleMineVisit(message, mineName, user, userId);
                case 'manage':
                    return handleMineManage(message, mineName, user);
                case 'prestige':
                    return handleMinePrestige(message, mineName, user, userId);
                default:
                    return message.reply(`Invalid subcommand, <@${userId}>! To use the mine command for buying, visiting, or managing mines, please use \`buy\`, \`visit\`, \`manage\`, or \`prestige\` respectively.`);
            }
        });
    }
};

function normalizeUserMineState(user) {
    user.continents = normalizeOwnedContinents(user.continents);
    user.mines = (user.mines || [])
        .map(normalizeMineData)
        .sort((left, right) => (left.mine_number || 0) - (right.mine_number || 0));
}

function createMineRecord(mine) {
    return {
        prestige_count: 0,
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
    };
}

function resetMineAfterPrestige(mine, nextPrestigeLevel) {
    mine.factor = nextPrestigeLevel.Factor;
    mine.prestige_count = nextPrestigeLevel.PrestigeCount;
    mine.mineshafts = [];
    mine.elevator = [];
    mine.warehouse = [];
    mine.managers = {
        shaft: [],
        elevator: [],
        warehouse: []
    };
    mine.barriers = mineRegions.map((region, index) => ({
        ...region,
        unlocked: index === 0
    }));
    mine.production = 0;
}

function findMineFactor(mineInput, prestigeCount = 0) {
    const resolvedMine = resolveMine(mineInput);
    if (!resolvedMine) {
        return null;
    }

    return mineFactors.find(mine =>
        mine.MineNumber === resolvedMine.mineNumber &&
        mine.PrestigeCount === prestigeCount
    ) || null;
}

function getMaxPrestigeCount(mineNumber) {
    return mineFactors
        .filter(mine => mine.MineNumber === mineNumber)
        .reduce((maxPrestige, mine) => Math.max(maxPrestige, mine.PrestigeCount || 0), 0);
}

function findOwnedMine(user, mineInput) {
    const resolvedMine = resolveMine(mineInput);
    if (!resolvedMine) {
        return null;
    }

    return user.mines.find(mine => mine.mine_number === resolvedMine.mineNumber) || null;
}

function getPreviousMineNameInContinent(mineNumber) {
    const continent = getContinentByMineNumber(mineNumber);
    if (!continent || mineNumber === continent.minMine) {
        return null;
    }

    return getMineName(mineNumber - 1);
}

function resolveOwnedMine(user, mineInput) {
    const resolvedMine = resolveMine(mineInput);
    return {
        resolvedMine,
        ownedMine: resolvedMine
            ? user.mines.find(mine => mine.mine_number === resolvedMine.mineNumber) || null
            : null
    };
}

async function handleMineBuy(message, mineInput, user, userId) {
    const mine = findMineFactor(mineInput);

    if (!mine) {
        return message.reply('Please put a valid mine name or ID');
    }

    const mineExists = user.mines.find(existingMine => existingMine.mine_number === mine.MineNumber);

    if (mineExists) {
        return message.reply(`You already own ${mine.MineName}.`);
    }

    const continent = getContinentByMineNumber(mine.MineNumber);
    if (!continent) {
        return message.reply('This mine is not mapped to a supported continent yet.');
    }

    if (!userOwnsContinent(user, continent.name)) {
        return message.reply(`You need to unlock ${continent.name} before buying ${mine.MineName}.`);
    }

    const previousMineName = getPreviousMineNameInContinent(mine.MineNumber);
    if (previousMineName && !user.mines.some(existingMine => existingMine.mine_name === previousMineName)) {
        return message.reply(`You need to own ${previousMineName} before buying ${mine.MineName}.`);
    }

    const cashField = getCashField(mine.MineNumber);
    const cashLabel = getCashLabelByField(cashField);
    const availableCash = user[cashField] || 0;

    if (availableCash < mine.Cost) {
        return message.reply(`You don't have enough ${cashLabel} to buy ${mine.MineName}. It costs ${numberFormat(mine.Cost)} ${cashLabel}.`);
    }

    user[cashField] = availableCash - mine.Cost;
    user.mines.push(createMineRecord(mine));
    user.mines.sort((left, right) => left.mine_number - right.mine_number);
    user.current_mine = mine.MineName;
    user.current_continent = continent.name;

    await updateUser(userId, {
        cash: user.cash,
        ice_cash: user.ice_cash,
        fire_cash: user.fire_cash,
        continents: user.continents,
        mines: user.mines,
        current_mine: user.current_mine,
        current_continent: user.current_continent
    });

    return message.reply(`Congratulations! You purchased ${mine.MineName} (Mine ${mine.MineNumber}) in ${continent.name} using ${cashLabel}, and you're now working there.`);
}

async function handleMineVisit(message, mineInput, user, userId) {
    const { resolvedMine, ownedMine: selectedMine } = resolveOwnedMine(user, mineInput);

    if (!resolvedMine) {
        return message.reply('Please put a valid mine name or ID');
    }

    if (!selectedMine) {
        return message.reply('You do not own that mine.');
    }

    if (user.current_mine === selectedMine.mine_name) {
        return message.reply(`You are already in ${selectedMine.mine_name}.`);
    }

    const continent = getContinentByMineNumber(selectedMine.mine_number);

    user.current_mine = selectedMine.mine_name;
    user.current_continent = continent?.name || user.current_continent;

    await updateUser(userId, {
        current_mine: user.current_mine,
        current_continent: user.current_continent
    });

    return message.reply(`You moved to ${selectedMine.mine_name} in ${user.current_continent}.`);
}

async function handleMineManage(message, mineInput, user) {
    const { resolvedMine, ownedMine: mine } = resolveOwnedMine(user, mineInput);

    if (!resolvedMine) {
        return message.reply('Please put a valid mine name or ID');
    }

    if (!mine) {
        return message.reply('You do not own that mine.');
    }

    const continent = getContinentByMineNumber(mine.mine_number);
    const cashLabel = getCashLabelByField(getCashField(mine.mine_number));
    const maxPrestigeCount = getMaxPrestigeCount(mine.mine_number);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${mine.mine_name} Management`)
        .setDescription([
            `Mine Number: ${mine.mine_number}`,
            `Continent: ${continent?.name || 'Unknown Continent'}`,
            `Cash Type: ${cashLabel}`,
            `Factor: ${mine.factor}`,
            `Prestige: ${(mine.prestige_count || 0)} / ${maxPrestigeCount}`,
            `Number of Shafts: ${mine.mineshafts.length}`,
            `Production: ${numberFormat(mine.production || 0)}`
        ].join('\n'))
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function handleMinePrestige(message, mineInput, user, userId) {
    const { resolvedMine, ownedMine: mine } = resolveOwnedMine(user, mineInput);

    if (!resolvedMine) {
        return message.reply('Please put a valid mine name or ID');
    }

    if (!mine) {
        return message.reply('You do not own that mine.');
    }

    const currentPrestigeLevel = findMineFactor(mine.mine_name, mine.prestige_count || 0);
    if (!currentPrestigeLevel) {
        return message.reply('Invalid prestige level for this mine.');
    }

    const nextPrestigeLevel = findMineFactor(mine.mine_name, (mine.prestige_count || 0) + 1);
    if (!nextPrestigeLevel) {
        return message.reply(`You have already reached the maximum prestige count for ${mine.mine_name}.`);
    }

    const cashField = getCashField(mine.mine_number);
    const cashLabel = getCashLabelByField(cashField);
    const availableCash = user[cashField] || 0;

    if (availableCash < nextPrestigeLevel.Cost) {
        return message.reply(`You don't have enough ${cashLabel} to prestige ${mine.mine_name}. You need ${numberFormat(nextPrestigeLevel.Cost)} ${cashLabel}.`);
    }

    user[cashField] = availableCash - nextPrestigeLevel.Cost;
    user.super_cash += nextPrestigeLevel.SuperCashGained;
    resetMineAfterPrestige(mine, nextPrestigeLevel);
    user.mines.sort((left, right) => left.mine_number - right.mine_number);

    await updateUser(userId, {
        cash: user.cash,
        ice_cash: user.ice_cash,
        fire_cash: user.fire_cash,
        super_cash: user.super_cash,
        mines: user.mines
    });

    return message.reply(`Congratulations! ${mine.mine_name} has been prestiged to level ${nextPrestigeLevel.PrestigeCount}. The mine has been reset, so you will need to rebuild it from scratch with its new production factor of ${nextPrestigeLevel.Factor}.`);
}
