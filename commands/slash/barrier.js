const { SlashCommandBuilder } = require('@discordjs/builders');
const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const mineRegions = require('../../config/mineRegions.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('barrier')
        .setDescription('Manage barriers in your mine to unlock new tiers.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('unlock')
                .setDescription('Unlock a barrier.')
                .addIntegerOption(option => 
                    option.setName('order')
                        .setDescription('The order number of the barrier to unlock.')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('overview')
                .setDescription('Get an overview of barriers.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a barrier.')
                .addIntegerOption(option => 
                    option.setName('order')
                        .setDescription('The order number of the barrier to remove.')
                        .setRequired(true))),
    async execute(interaction) {
        const userId = interaction.user.id;
        const user = await getUser(userId);

        if (!user) {
            return interaction.reply('You need to start the game first by using `/start`.');
        }

        const currentMine = user.mines.find(mine => mine.MineName === user.currentMine);
        if (!currentMine) {
            return interaction.reply('Current mine data not found.');
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'unlock':
                await handleUnlock(interaction, user, currentMine, userId);
                break;
            case 'overview':
                await handleOverview(interaction, currentMine);
                break;
            case 'remove':
                await handleRemove(interaction, user, currentMine, userId);
                break;
            default:
                return interaction.reply('Invalid subcommand. Use `unlock`, `overview`, or `remove`.');
        }
    }
};

async function handleUnlock(interaction, user, currentMine, userId) {
    const barrierOrder = interaction.options.getInteger('order');

    if (barrierOrder < 1 || barrierOrder >= currentMine.barriers.length) {
        return interaction.reply('Please provide a valid barrier order number.');
    }

    const barrier = currentMine.barriers[barrierOrder];
    const previousBarrier = currentMine.barriers[barrierOrder - 1];

    if (!barrier) {
        return interaction.reply('Barrier data not found.');
    }

    if (!previousBarrier.unlocked && barrierOrder > 1) {
        return interaction.reply(`You must unlock Barrier ${barrierOrder - 1} before unlocking Barrier ${barrierOrder}.`);
    }

    const requiredTier = (barrierOrder === 1) ? 5 : 10;
    const requiredShaftsUnlocked = currentMine.mineshafts.some(shaft => shaft.tier >= requiredTier);

    if (!requiredShaftsUnlocked) {
        return interaction.reply(`You must have unlocked shafts of tier ${requiredTier} to unlock Barrier ${barrierOrder}.`);
    }

    if (barrier.unlocked) {
        return interaction.reply(`Barrier ${barrierOrder} is already unlocked.`);
    }

    if (user.cash < barrier.Cost) {
        return interaction.reply(`You do not have enough Cash to unlock this barrier. Cost: ${numberFormat(barrier.Cost)}`);
    }

    user.cash -= barrier.Cost;
    barrier.unlockTime = Date.now() + barrier.BuildTimeInSeconds * 1000;

    await updateUser(userId, user);

    return interaction.reply(`Successfully paid to unlock Barrier ${barrierOrder}. It will be removed in ${barrier.BuildTimeInSeconds} seconds.`);
}

async function handleOverview(interaction, currentMine) {
    const embed = new EmbedBuilder()
        .setTitle('Barrier Overview')
        .setDescription(`Here is the current status of your barriers in the ${currentMine}:`)
        .setColor('#00FF00');

    currentMine.barriers.forEach((barrier, index) => {
        const status = barrier.unlocked ? 'Unlocked' : `Locked (Unlocking in ${Math.max(0, Math.floor((barrier.unlockTime - Date.now()) / 1000))} seconds)`;
        embed.addFields({ name: `Barrier ${index + 1}`, value: status, inline: true });
    });

    return interaction.reply({ embeds: [embed] });
}

async function handleRemove(interaction, user, currentMine, userId) {
    const barrierOrder = interaction.options.getInteger('order');

    if (barrierOrder < 1 || barrierOrder >= currentMine.barriers.length) {
        return interaction.reply('Please provide a valid barrier order number.');
    }

    const barrier = currentMine.barriers[barrierOrder];

    if (!barrier) {
        return interaction.reply('Barrier data not found.');
    }

    if (!barrier.unlockTime || Date.now() < barrier.unlockTime) {
        return interaction.reply(`Barrier ${barrierOrder} is still being removed. Please wait until the process is complete.`);
    }

    barrier.unlocked = true;
    barrier.unlockTime = null;

    await updateUser(userId, user);

    return interaction.reply(`Successfully removed Barrier ${barrierOrder}. You can now access new shafts.`);
}
