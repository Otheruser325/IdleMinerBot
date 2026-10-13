import { getUser, updateUserTransaction, withUserLock } from '../../dataManager.js';
import numberFormat from '../../utils/numberFormat.js';
import { logError } from '../../utils/errorHandling.js';
import { normalizeBooster } from '../../utils/boosts.js';
import { getCashField } from '../../utils/continentLooker.js';
import { getMineIdleCashPerSecond, getMineProductionPerSecond } from '../../utils/mineOverview.js';
import { toMoney } from '../../utils/economyConstants.js';
import commandContext from './context.js';

function resolveInstantCashRate(currentMine, hasPremium) {
    const productionRate = getMineProductionPerSecond(currentMine);
    const idleRate = getMineIdleCashPerSecond(currentMine, hasPremium);
    return Math.max(productionRate || 0, idleRate || 0);
}

export default {
    name: 'use',
    description: 'Use a booster from your inventory.',
    async execute(message, args = []) {
        const userId = message.user?.id || message.author?.id;
        return withUserLock(userId, async () => {
            const user = await getUser(userId);
            const itemId = parseInt(args[0], 10);

            if (!user) {
                return message.reply(`You need to start the game first by using \`${commandContext.commandReference(message, 'start')}\`.`);
            }

            if (!Number.isInteger(itemId)) {
                return message.reply(`Please provide a valid booster ID. Usage: ${commandContext.commandReference(message, 'use', '<item id>')}`);
            }

            const currentMine = (user.mines || []).find(mine => mine.mine_name === user.current_mine)
                || (user.mines || [])[0];
            if (!currentMine) {
                return message.reply('Current mine data not found.');
            }

            const inventory = user.inventory || {};
            const boosters = Array.isArray(inventory.boosters) ? inventory.boosters : [];
            const inventoryItem = boosters.find(booster => Number(booster.item_id) === itemId);

            if (!inventoryItem) {
                return message.reply(`You do not have that booster in your inventory. Use \`${commandContext.commandReference(message, 'shop')}\` to purchase boosters.`);
            }

            const normalized = normalizeBooster(inventoryItem);
            if (!normalized) {
                return message.reply('That item is missing a valid duration or instant-cash value and cannot be used.');
            }

            if (Number(inventoryItem.stock || 0) <= 0) {
                return message.reply('You do not have enough stock of that booster.');
            }

            const walletField = getCashField(currentMine.mine_number);
            const now = Date.now();
            const instantRate = normalized.isInstantItem
                ? resolveInstantCashRate(currentMine, user.has_premium)
                : 0;
            const instantCash = normalized.isInstantItem
                ? toMoney(instantRate * normalized.instantCashSeconds)
                : 0;

            const result = await updateUserTransaction(userId, current => {
                if (!current) return undefined;

                const currentInventory = current.inventory || {};
                const currentBoosters = Array.isArray(currentInventory.boosters) ? currentInventory.boosters : [];
                const liveItem = currentBoosters.find(booster => Number(booster.item_id) === itemId);
                if (!liveItem || Number(liveItem.stock || 0) <= 0) return undefined;

                const liveNormalized = normalizeBooster(liveItem);
                if (!liveNormalized) return undefined;

                liveItem.stock = Number(liveItem.stock || 0) - 1;

                const activeBoosts = Array.isArray(current.active_boosts) ? current.active_boosts : [];
                const nextBoosts = activeBoosts.filter(boost => Number(boost?.end_time) > now);

                if (liveNormalized.isInstantItem) {
                    current[walletField] = toMoney((current[walletField] || 0) + instantCash);
                } else {
                    const activeBoost = {
                        item_id: liveNormalized.itemId,
                        item_name: liveNormalized.itemName,
                        active_time: liveNormalized.activeTimeSeconds,
                        income_factor: liveNormalized.incomeFactor,
                        end_time: now + (liveNormalized.activeTimeSeconds * 1000)
                    };
                    const existingIndex = nextBoosts.findIndex(boost => Number(boost.income_factor) === activeBoost.income_factor);
                    if (existingIndex > -1) {
                        const existingBoost = nextBoosts[existingIndex];
                        if (Number(existingBoost.end_time) < activeBoost.end_time) {
                            existingBoost.end_time = activeBoost.end_time;
                        }
                    } else {
                        nextBoosts.push(activeBoost);
                    }
                }

                return {
                    ...current,
                    inventory: { ...currentInventory, boosters: currentBoosters },
                    active_boosts: nextBoosts
                };
            });

            if (!result.committed) {
                return message.reply('That booster could not be used right now. Please try again.');
            }

            try {
                if (normalized.isInstantItem) {
                    return message.reply(`You used ${normalized.itemName} and received ${numberFormat(instantCash)} Cash instantly!`);
                }
                return message.reply(`You have successfully used the ${normalized.itemName}!`);
            } catch (error) {
                logError('use:execute', error, { userId, itemId });
                return message.reply('An error occurred while using the booster.');
            }
        });
    }
};
