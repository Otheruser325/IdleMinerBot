const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const shaftData = require('../../config/shaftData.json').shaftData;
const getMineFactor = require('../../utils/getMineFactor');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shaft')
        .setDescription('Manage your mineshafts with options to view, buy, or upgrade.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('overview')
                .setDescription('View details of a specific mineshaft.')
                .addIntegerOption(option => 
                    option.setName('tier')
                        .setDescription('The tier of the mineshaft.')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Buy a new mineshaft.')
                .addIntegerOption(option => 
                    option.setName('tier')
                        .setDescription('The tier of the mineshaft to buy.')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('upgrade')
                .setDescription('Upgrade an existing mineshaft.')
                .addIntegerOption(option => 
                    option.setName('tier')
                        .setDescription('The tier of the mineshaft to upgrade.')
                        .setRequired(true))
        ),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const user = await getUser(userId);

        if (!user) {
            return interaction.reply('You need to start the game first by using `im!start`.');
        }

        const currentMine = user.mines.find(mine => mine.MineName === user.currentMine);
        if (!currentMine) {
            return interaction.reply('Current mine data not found.');
        }

        const tier = interaction.options.getInteger('tier');

        switch (subcommand) {
            case 'overview':
                await handleOverview(interaction, user, currentMine, tier);
                break;
            case 'buy':
                await handleBuy(interaction, user, currentMine, tier);
                break;
            case 'upgrade':
                await handleUpgrade(interaction, user, currentMine, tier);
                break;
            default:
                return interaction.reply('Invalid subcommand. Use `overview`, `buy`, or `upgrade`.');
        }
    }
};

// Function to handle the "overview" subcommand
async function handleOverview(interaction, user, currentMine, tier) {
    const shaft = currentMine.mineshafts.find(s => s.tier === tier);

    if (!shaft) {
        return interaction.reply(`You do not own a shaft of Tier ${tier} in the ${currentMine.MineName}.`);
    }

    // Lazy initialization of totalDeposit
    if (shaft.totalDeposit === undefined) {
        shaft.totalDeposit = 0; // Initialize to 0 if not set
    }

    const shaftInfo = shaftData.find(s => s.Tier === tier && s.Level === shaft.level);
    if (!shaftInfo) {
        return interaction.reply(`Unable to find data for Shaft Tier ${tier} at Level ${shaft.level}.`);
    }

    // Adjust shaft stats based on the mine's factor
    const mineFactor = getMineFactor(currentMine.MineName);
    const adjustedGain = shaftInfo.GainPerSecondPerWorker * mineFactor;
    const adjustedCapacity = shaftInfo.CapacityPerWorker * mineFactor;

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Mineshaft Tier ${tier} Overview in ${currentMine.MineName}`)
        .addFields(
            { name: 'Level', value: `${shaft.level}`, inline: true },
            { name: 'Workers', value: `${shaft.numberOfWorkers}`, inline: true },
            { name: 'Gain per Second', value: `${numberFormat(adjustedGain)}`, inline: true },
            { name: 'Capacity per Worker', value: `${numberFormat(adjustedCapacity)}`, inline: true },
            { name: 'Worker Speed', value: `${shaft.workerWalkingSpeedPerSecond} units/sec`, inline: true },
            { name: 'Total Deposit', value: `${numberFormat(shaft.totalDeposit)}`, inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

// Function to handle the "buy" subcommand
async function handleBuy(interaction, user, currentMine, tier) {
    const existingShaft = currentMine.mineshafts.find(s => s.tier === tier);

    if (existingShaft) {
        return interaction.reply(`You already own a shaft of Tier ${tier} in the ${currentMine.MineName}.`);
    }

    const shaftInfo = shaftData.find(s => s.Tier === tier && s.Level === 1);
    if (!shaftInfo) {
        return interaction.reply(`Invalid shaft tier provided.`);
    }

    if (user.cash < shaftInfo.Cost) {
        return interaction.reply(`You do not have enough Cash to buy this shaft. Cost: ${numberFormat(shaftInfo.Cost)}`);
    }

    user.cash -= shaftInfo.Cost;

    // Adjust shaft stats based on the mine's factor
    const mineFactor = getMineFactor(currentMine.MineName);
    const adjustedGain = shaftInfo.GainPerSecondPerWorker * mineFactor;
    const adjustedCapacity = shaftInfo.CapacityPerWorker * mineFactor;

    currentMine.mineshafts.push({
        tier,
        level: 1,
        numberOfWorkers: shaftInfo.NumberOfWorkers,
        gainPerSecondPerWorker: adjustedGain,
        capacityPerWorker: adjustedCapacity,
        workerWalkingSpeedPerSecond: shaftInfo.WorkerWalkingSpeedPerSecond,
        totalDeposit: 0 // Initialize totalDeposit for new shaft
    });

    await updateUser(user.id, user);

    return interaction.reply(`Successfully purchased Shaft Tier ${tier} for ${numberFormat(shaftInfo.Cost)} Cash in the ${currentMine.MineName}.`);
}

// Function to handle the "upgrade" subcommand
async function handleUpgrade(interaction, user, currentMine, tier) {
    const shaft = currentMine.mineshafts.find(s => s.tier === tier);

    if (!shaft) {
        return interaction.reply(`You do not own a shaft of Tier ${tier} in the ${currentMine.MineName}.`);
    }

    const nextLevel = shaft.level + 1;
    const nextShaftInfo = shaftData.find(s => s.Tier === tier && s.Level === nextLevel);

    if (!nextShaftInfo) {
        return interaction.reply(`There is no upgrade available for Shaft Tier ${tier} at Level ${nextLevel}.`);
    }

    if (user.cash < nextShaftInfo.Cost) {
        return interaction.reply(`You do not have enough Cash to upgrade this shaft. Cost: ${numberFormat(nextShaftInfo.Cost)}`);
    }

    user.cash -= nextShaftInfo.Cost;

    // Adjust shaft stats based on the mine's factor
    const mineFactor = getMineFactor(currentMine.MineName);
    const adjustedGain = nextShaftInfo.GainPerSecondPerWorker * mineFactor;
    const adjustedCapacity = nextShaftInfo.CapacityPerWorker * mineFactor;

    shaft.level = nextLevel;
    shaft.numberOfWorkers = nextShaftInfo.NumberOfWorkers;
    shaft.gainPerSecondPerWorker = adjustedGain;
    shaft.capacityPerWorker = adjustedCapacity;
    shaft.workerWalkingSpeedPerSecond = nextShaftInfo.WorkerWalkingSpeedPerSecond;

    await updateUser(user.id, user);

    return interaction.reply(`Successfully upgraded Shaft Tier ${tier} to Level ${nextLevel} for ${numberFormat(nextShaftInfo.Cost)} Cash in the ${currentMine.MineName}.`);
}
