const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const shaftData = require('../../config/shaftData.json').shaftData;
const mineFactors = require('../../config/mineFactors.json').mines;

module.exports = {
    name: 'work',
    description: 'Manually operate your mineshaft to mine minerals.',
    usage: '<tier>',
    exampleUsage: 'v work 1',
    async execute(message, args) {
        if (args.length < 1) {
            return message.reply('Please provide the shaft tier you want to work on.');
        }

        const tier = parseInt(args[0], 10);
        if (isNaN(tier) || tier < 1 || tier > 40) {
            return message.reply('Please provide a valid shaft tier number between 1 and 40.');
        }

        const userId = message.author.id;
        const user = await getUser(userId);

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        const currentMine = user.mines.find(mine => mine.MineName === user.currentMine);
        if (!currentMine) {
            return message.reply('Current mine data not found.');
        }

        const shaft = currentMine.mineshafts.find(s => s.tier === tier);

        if (!shaft) {
            return message.reply(`You do not own a shaft of Tier ${tier} in the ${currentMine.MineName}.`);
        }

        const now = Date.now();
        const FOUR_SECONDS = 4000; // 4 seconds for mining process

        if (shaft.lastWorkedOn && (now - shaft.lastWorkedOn < FOUR_SECONDS)) {
            const remainingTime = FOUR_SECONDS - (now - shaft.lastWorkedOn);
            const secondsRemaining = Math.ceil(remainingTime / 1000);
            return message.reply(`Please wait ${secondsRemaining} seconds for the mineshaft to fully mine minerals.`);
        }

        // Update the shaft's last worked on timestamp
        shaft.lastWorkedOn = now;

        // Get shaft info and mine factor
        const shaftInfo = shaftData.find(s => s.Tier === tier && s.Level === shaft.level);
        const mineFactor = mineFactors.find(m => m.MineName === currentMine.MineName)?.Factor || 1;

        if (!shaftInfo) {
            return message.reply(`Unable to find data for Shaft Tier ${tier} at Level ${shaft.level}.`);
        }

        // Calculate the walking time
        const walkingTimes = {
            1: 2000, // 2 seconds
            2: 1000, // 1 second
            3: 750,  // 0.75 seconds
            4: 500,  // 0.5 seconds
            5: 400,  // ~0.4 seconds
            6: 333   // ~0.33 seconds
        };

        const walkingTime = walkingTimes[shaft.workerWalkingSpeedPerSecond] || 500; // Default to 0.5 seconds if not found

        // Initial message
        const initialMessage = await message.reply('Walking to deposit...');

        // Simulate the mining process
        const mineProcess = new Promise((resolve) => {
            setTimeout(async () => {
                await initialMessage.edit('Mining deposit in Shaft ${tier}...');
                setTimeout(async () => {
                    await initialMessage.edit('Extracting minerals into the basket...');
                    setTimeout(async () => {
                        // Calculate the total deposit
                        const deposit = shaft.capacityPerWorker * shaft.numberOfWorkers * mineFactor;
                        shaft.totalDeposit = (shaft.totalDeposit || 0) + deposit;

                        await updateUser(user.id, user);
                        await initialMessage.edit(`Successfully mined minerals with Shaft Tier ${tier}. Total deposit now: ${numberFormat(shaft.totalDeposit)}`);
                        resolve();
                    }, walkingTime); // Time to extract minerals
                }, FOUR_SECONDS); // Time to mine
            }, walkingTime); // Time to walk to deposit
        });

        return mineProcess;
    }
};
