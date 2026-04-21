import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import { EmbedBuilder } from 'discord.js';
import numberFormat from '../../utils/numberFormat.js';
import shaftDataJson from '../../config/shaftData.json' with { type: 'json' };
import getMineFactor from '../../utils/getMineFactor.js';
import {
    applyCapacityBoost,
    applyMiningSpeedBoost,
    formatActiveAreaAbilities,
    getActiveEffects,
    getMineWideIncomeMultiplier
} from '../../utils/managerAbilities.js';
import { getShaftTravelTimeMs } from '../../utils/movementTimes.js';
import { getBoosterRewardFlags } from '../../utils/progression.js';

const shaftData = shaftDataJson.shaftData;

export default {
    name: 'shaft',
    description: 'Manage your mineshafts with options to view, buy, or upgrade.',
    usage: '<subcommand> [arguments]',
    exampleUsage: 'v shaft buy 1 | v shaft upgrade 1 | v shaft overview 1',
    async execute(message, args) {
        const userId = message.author.id;
        return withUserLock(userId, async () => {
            const user = await getUser(userId);

            if (!user) {
                return message.reply('You need to start the game first by using `im!start` (or `/start` if using slash).');
            }

            const currentMine = user.mines.find(mine => mine.mine_name === user.current_mine);
            if (!currentMine) {
                return message.reply('Current mine data not found.');
            }
		
		    if (args.length < 1) {
                return message.reply(`<@${userId}>, to operate your shafts, you'll need to use **im!shaft overview** to view your shaft's performance in your **__${currentMine.mine_name}__**, based on the tier you provide (i.e. **im!shaft overview 1**), **im!shaft buy** for purchasing a new shaft in your **__${currentMine.mine_name}__** or **im!shaft upgrade** to upgrade your shaft of your choice (i.e. **im!shaft upgrade 1**, or you can also quick-upgrade using **im!shaft upgrade 1 5** for example for 5 purchased shaft levels on the 1st shaft, if you have the cash for it!).`);
            }
		
		    const subcommand = args[0].toLowerCase();

            if (!currentMine.mineshafts) {
                currentMine.mineshafts = [];
            }

            switch (subcommand) {
                case 'overview':
                    return handleOverview(message, user, currentMine, args, userId);
                case 'buy':
                    return handleBuy(message, user, currentMine, args, userId);
                case 'upgrade':
                    return handleUpgrade(message, user, currentMine, args, userId);
                default:
                    return message.reply(`Invalid subcommand, <@${userId}>! To operate your shafts, you'll need to use **im!shaft overview** to view your shaft's performance in your **__${currentMine.mine_name}__**, based on the tier you provide (i.e. **im!shaft overview 1**), **im!shaft buy** for purchasing a new shaft in your **__${currentMine.mine_name}__** or **im!shaft upgrade** to upgrade your shaft of your choice (i.e. **im!shaft upgrade 1**, or you can also quick-upgrade using **im!shaft upgrade 1 5** for example for 5 purchased shaft levels on the 1st shaft, if you have the cash for it!).`);
            }
        });
    }
};

// Function to handle the "overview" subcommand
async function handleOverview(message, user, currentMine, args, userId) {
    if (!args[1]) {
        return handleAllShaftOverview(message, currentMine);
    }

    const tier = parseInt(args[1], 10);

    if (isNaN(tier) || tier < 1 || tier > 30) {
        return message.reply('Please provide a valid shaft tier number between 1 and 30.');
    }

    const shaft = currentMine.mineshafts.find(s => s.tier === tier);

    if (!shaft) {
        return message.reply(`You do not own a shaft of Tier ${tier} in the ${currentMine.mine_name}.`);
    }

    // Lazy initialization of totalDeposit
    if (shaft.total_deposit === undefined) {
        shaft.total_deposit = 0; // Initialize to 0 if not set
    }

    const shaftInfo = shaftData.find(s => s.Tier === tier && s.Level === shaft.level);
    if (!shaftInfo) {
        return message.reply(`Unable to find data for Shaft Tier ${tier} at Level ${shaft.level}.`);
    }

    // Adjust shaft stats based on the mine's factor
    const mineFactor = getMineFactor(currentMine.mine_name);
    const adjustedGain = shaftInfo.GainPerSecondPerWorker * mineFactor;
    const adjustedCapacity = shaftInfo.CapacityPerWorker * mineFactor;
    const effects = getActiveEffects(currentMine);
    const baseWalkingTime = 3000 / Math.max(shaft.worker_walking_speed_per_second || 1, 1);
    const boostedWalkingTime = getShaftTravelTimeMs(shaft.worker_walking_speed_per_second, currentMine);
    const baseMiningTime = 4000;
    const boostedMiningTime = applyMiningSpeedBoost(baseMiningTime, currentMine);
    const boostedCapacity = applyCapacityBoost(adjustedCapacity, 'shaft', currentMine);
    const mineWideIncomeMultiplier = getMineWideIncomeMultiplier(currentMine);
    const boostedGain = adjustedGain * mineWideIncomeMultiplier;
    const displayedCapacity = boostedCapacity * mineWideIncomeMultiplier;
    const walkingSummary = boostedWalkingTime !== baseWalkingTime
        ? `${(baseWalkingTime / 1000).toFixed(2)}s -> ${(boostedWalkingTime / 1000).toFixed(2)}s per leg`
        : `${(baseWalkingTime / 1000).toFixed(2)}s per leg`;
    const miningSummary = boostedMiningTime !== baseMiningTime
        ? `${(baseMiningTime / 1000).toFixed(2)}s -> ${(boostedMiningTime / 1000).toFixed(2)}s per mining cycle`
        : `${(baseMiningTime / 1000).toFixed(2)}s per mining cycle`;

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Mineshaft Tier ${tier} Overview in ${currentMine.mine_name}`)
        .addFields(
            { name: 'Level', value: `${shaft.level}`, inline: true },
            { name: 'Workers', value: `${shaft.number_of_workers}`, inline: true },
            { name: 'Gain per Second', value: boostedGain !== adjustedGain ? `${numberFormat(adjustedGain)} -> ${numberFormat(boostedGain)}` : `${numberFormat(adjustedGain)}`, inline: true },
            { name: 'Capacity per Worker', value: displayedCapacity !== adjustedCapacity ? `${numberFormat(adjustedCapacity)} -> ${numberFormat(displayedCapacity)}` : `${numberFormat(adjustedCapacity)}`, inline: true },
            { name: 'Walking Speed', value: `${shaft.worker_walking_speed_per_second} units/sec`, inline: true },
            { name: 'Walking Time', value: walkingSummary, inline: true },
            { name: 'Mining Time', value: miningSummary, inline: true },
            { name: 'Income Boost', value: mineWideIncomeMultiplier > 1 ? `${mineWideIncomeMultiplier.toFixed(2)}x mine-wide multiplier` : 'No active income boost', inline: true },
            { name: 'Total Deposit', value: `${numberFormat(shaft.total_deposit)}`, inline: true },
            { name: 'Active Ability Boosts', value: formatActiveAreaAbilities(currentMine, 'shaft', { tier }), inline: false }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

async function handleAllShaftOverview(message, currentMine) {
    if (!currentMine.mineshafts || currentMine.mineshafts.length === 0) {
        return message.reply(`You do not own any shafts in ${currentMine.mine_name}.`);
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`All Shafts in ${currentMine.mine_name}`)
        .setDescription(currentMine.mineshafts
            .sort((left, right) => left.tier - right.tier)
            .map(shaft => `Tier ${shaft.tier}: Level ${shaft.level} | Workers ${shaft.number_of_workers} | Deposit ${numberFormat(shaft.total_deposit || 0)}`)
            .join('\n'))
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

// Function to handle the "buy" subcommand
async function handleBuy(message, user, currentMine, args, userId) {
    const tier = parseInt(args[1], 10);

    if (isNaN(tier) || tier < 1 || tier > 40) {
        return message.reply('Please provide a valid shaft tier number between 1 and 40.');
    }

    // Check if the shaft can be purchased based on tier order
    const previousTierShaft = currentMine.mineshafts.find(s => s.tier === tier - 1);
    if (tier > 1 && !previousTierShaft) {
        return message.reply(`You need to own Shaft Tier ${tier - 1} before purchasing Shaft Tier ${tier}.`);
    }

    // Check if there is a locked barrier preventing further shaft unlocks
    const barrierBlocking = currentMine.barriers.find(barrier => !barrier.unlocked && tier > barrier.from_tier && tier <= barrier.to_tier);
    if (barrierBlocking) {
        return message.reply(`Shaft Tier ${tier} is blocked by a barrier. Unlock the barrier from Tier ${barrierBlocking.from_tier} to Tier ${barrierBlocking.to_tier} first.`);
    }

    // Check if user has tier 1 shaft at level 10 before buying additional shafts
    if (tier > 1) {
        const tier1Shaft = currentMine.mineshafts.find(s => s.tier === 1);
        if (!tier1Shaft || tier1Shaft.level < 10) {
            return message.reply(`You need to upgrade your Tier 1 shaft to Level 10 before purchasing new shafts. Current Tier 1 level: ${tier1Shaft?.level || 0}/10`);
        }
    }

    const existingShaft = currentMine.mineshafts.find(s => s.tier === tier);

    if (existingShaft) {
        return message.reply(`You already own a shaft of Tier ${tier} in the ${currentMine.mine_name}.`);
    }

    const shaftInfo = shaftData.find(s => s.Tier === tier && s.Level === 1);
    if (!shaftInfo) {
        return message.reply(`Invalid shaft tier provided.`);
    }

    if (user.cash < shaftInfo.Cost) {
        return message.reply(`You do not have enough Cash to buy this shaft. Cost: ${numberFormat(shaftInfo.Cost)}`);
    }

    user.cash -= shaftInfo.Cost;

    // Adjust shaft stats based on the mine's factor
    const mineFactor = getMineFactor(currentMine.mine_name);
    const adjustedGain = shaftInfo.GainPerSecondPerWorker * mineFactor;
    const adjustedCapacity = shaftInfo.CapacityPerWorker * mineFactor;

    currentMine.mineshafts.push({
        tier,
        level: 1,
        number_of_workers: shaftInfo.NumberOfWorkers,
        gain_per_second_per_worker: adjustedGain,
        capacity_per_worker: adjustedCapacity,
        worker_walking_speed_per_second: shaftInfo.WorkerWalkingSpeedPerSecond,
        total_deposit: 0
    });
    let rewardMessage = '';

    if (currentMine.mine_name === 'Coal Mine' && tier === 2) {
        user.inventory = user.inventory || {};
        user.inventory.boosters = user.inventory.boosters || [];
        const rewardFlags = getBoosterRewardFlags(user);

        if (!rewardFlags.coal_tier_2_reward_granted) {
            const existingBooster = user.inventory.boosters.find(booster => booster.item_id === 1);
            if (existingBooster) {
                existingBooster.stock = (existingBooster.stock || 0) + 1;
            } else {
                user.inventory.boosters.push({
                    item_id: 1,
                    item_name: 'x2 Boost',
                    active_time: 3600,
                    income_factor: 2,
                    stock: 1
                });
            }

            rewardFlags.coal_tier_2_reward_granted = true;
            rewardMessage = '\nYou also unlocked a free x2 Boost (1 hour) for reaching Shaft Tier 2 on Coal Mine first.';

            try {
                await message.author.send('You just earned a free **x2 Boost (1 hour)** for unlocking Shaft Tier 2 on Coal Mine.\nUse it with `im!use 1` when you want a temporary income boost.');
            } catch (error) {
                console.error('Could not send booster unlock DM:', error);
            }
        }
    }

    await updateUser(userId, user);

    return message.reply(`Successfully purchased Shaft Tier ${tier} for ${numberFormat(shaftInfo.Cost)} Cash in the ${currentMine.mine_name}.${rewardMessage}`);
}

// Function to handle the "upgrade" subcommand
async function handleUpgrade(message, user, currentMine, args, userId) {
    const tier = parseInt(args[1], 10);
    const upgradeCount = args[2] ? parseInt(args[2], 10) : 1; // Optional argument for upgrade count

    if (isNaN(tier) || tier < 1 || tier > 40) {
        return message.reply('Please provide a valid shaft tier number between 1 and 40.');
    }

    if (isNaN(upgradeCount) || upgradeCount < 1) {
        return message.reply('Please provide a valid number of upgrades (positive integer).');
    }

    const shaft = currentMine.mineshafts.find(s => s.tier === tier);

    if (!shaft) {
        return message.reply(`You do not own a shaft of Tier ${tier} in the ${currentMine.mine_name}.`);
    }

    let totalCost = 0;
	let superCashEarned = 0;
    let lastLevel = shaft.level;
    const maxLevel = 1000;

    // Calculate total cost and check for max level
    for (let i = 0; i < upgradeCount; i++) {
        const nextLevel = lastLevel + 1;

        if (nextLevel > maxLevel) {
            return message.reply(`Your Mineshaft Tier ${tier} is currently maxed out and cannot be upgraded any further.`);
        }

        const nextShaftInfo = shaftData.find(s => s.Tier === tier && s.Level === nextLevel);

        if (!nextShaftInfo) {
            return message.reply(`There is no upgrade available for Shaft Tier ${tier} at Level ${nextLevel}.`);
        }

        totalCost += nextShaftInfo.Cost;
        lastLevel = nextLevel;
    }

    if (user.cash < totalCost) {
        return message.reply(`You do not have enough Cash to upgrade this shaft ${upgradeCount} times. Total Cost: ${numberFormat(totalCost)}`);
    }

    // Apply upgrades
    let currentLevel = shaft.level;
    for (let i = 0; i < upgradeCount; i++) {
        const nextLevel = currentLevel + 1;
        const nextShaftInfo = shaftData.find(s => s.Tier === tier && s.Level === nextLevel);

        if (nextShaftInfo) {
            user.cash -= nextShaftInfo.Cost;
            shaft.level = nextLevel;
            shaft.number_of_workers = nextShaftInfo.NumberOfWorkers;
            shaft.gain_per_second_per_worker = nextShaftInfo.GainPerSecondPerWorker * getMineFactor(currentMine.mine_name);
            shaft.capacity_per_worker = nextShaftInfo.CapacityPerWorker * getMineFactor(currentMine.mine_name);
            shaft.worker_walking_speed_per_second = nextShaftInfo.WorkerWalkingSpeedPerSecond;

            if (nextShaftInfo.BigUpdate === 1) {
                superCashEarned += 2;
            }

            currentLevel = nextLevel;
        } else {
            break; // Stop upgrading if no further upgrades are available
        }
    }
	
	// Add Super Cash if earned
    if (superCashEarned > 0) {
        user.super_cash = (user.super_cash || 0) + superCashEarned;
    }

    await updateUser(userId, user);

    return message.reply(`Shaft Tier ${tier} to Level ${shaft.level} for ${numberFormat(totalCost)} Cash in the ${currentMine.mine_name}. ${superCashEarned > 0 ? `You earned ${superCashEarned} Super Cash for hitting major upgrades!` : ''}`);
}
