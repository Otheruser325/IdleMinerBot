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

        // Convert only the subcommand to lowercase
        const subcommand = args[0].toLowerCase();
        const mineName = args.slice(1).join(' ');

        if (!mineName && ['buy', 'visit', 'manage', 'prestige'].includes(subcommand)) {
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
			case 'prestige':
                await handleMinePrestige(message, mineName, user, userId);
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

    const mine = mineFactors.find(m => m.MineName.toLowerCase() === mineName.toLowerCase());

    if (!mine) {
        return message.reply('Invalid mine name. Please specify a valid mine to buy.');
    }

    const mineExists = user.mines.find(m => m.mine_name === mine.MineName);

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

    const selectedMine = user.mines.find(m => m.mine_name.toLowerCase() === mineName.toLowerCase());

    if (!selectedMine) {
        return message.reply('You do not own this mine.');
    }

    if (user.current_mine === selectedMine.mine_name) {
        return message.reply(`You are already in the ${selectedMine.mine_name}.`);
    }

    await updateUser(userId, { current_mine: selectedMine.mine_name });

    return message.reply(`You have successfully moved to the ${selectedMine.mine_name}.`);
}

async function handleMineManage(message, mineName, user, userId) {
    if (!mineName) {
        return message.reply('Please specify the name of the mine you want to manage.');
    }

    const mine = user.mines.find(m => m.mine_name.toLowerCase() === mineName.toLowerCase());

    if (!mine) {
        return message.reply('You do not own this mine.');
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${mine.mine_name} Management`)
        .setDescription(`Factor: ${mine.factor}\nNumber of Shafts: ${mine.mineshafts.length}\nProduction: ${numberFormat(mine.production || 0)}`)
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function handleMinePrestige(message, mineName, user, userId) {
    if (!mineName) {
        return message.reply('Please specify the name of the mine you want to prestige.');
    }

    const mine = user.mines.find(m => m.mine_name.toLowerCase() === mineName.toLowerCase());

    if (!mine) {
        return message.reply('You do not own this mine.');
    }

    const currentPrestigeLevel = mineFactors.find(factor => factor.MineName === mine.mine_name && factor.PrestigeCount === mine.prestige_count);

    if (!currentPrestigeLevel) {
        return message.reply('Invalid prestige level for this mine.');
    }

    const nextPrestigeLevel = mineFactors.find(factor => factor.MineName === mine.mine_name && factor.PrestigeCount === mine.prestige_count + 1);

    if (!nextPrestigeLevel) {
        return message.reply('You have already maxed out the prestige for this mine.');
    }

    if (user.cash < nextPrestigeLevel.Cost) {
        return message.reply(`You don't have enough Cash to prestige the ${mine.mine_name}. You need ${numberFormat(nextPrestigeLevel.Cost)} Cash.`);
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

    return message.reply(`Congratulations! Your ${mine.mine_name} has been prestiged to level ${nextPrestigeLevel.PrestigeCount}. It now has a production factor of ${nextPrestigeLevel.Factor}.`);
}