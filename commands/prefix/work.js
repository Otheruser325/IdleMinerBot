const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const shaftData = require('../../config/shaftData.json').shaftData;
const elevatorData = require('../../config/elevatorData.json').elevatorData;

module.exports = {
    name: 'work',
    description: 'Operate your mineshafts or elevator.',
    usage: '<subcommand> [tier]',
    exampleUsage: 'v work shaft 1 | v work elevator',
    async execute(message, args) {
        if (args.length < 1) {
            return message.reply('Please provide a subcommand: `shaft` or `elevator`.');
        }

        const subcommand = args[0].toLowerCase();
        const userId = message.author.id;
        const user = await getUser(userId);

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        const currentMine = user.mines.find(mine => mine.MineName === user.currentMine);
        if (!currentMine) {
            return message.reply('Current mine data not found.');
        }

        switch (subcommand) {
            case 'shaft':
                if (args.length < 2) {
                    return message.reply('Please provide the shaft tier to work on.');
                }
                await handleShaftWork(message, user, currentMine, parseInt(args[1], 10));
                break;
            case 'elevator':
                await handleElevatorWork(message, user, currentMine);
                break;
            default:
                return message.reply('Invalid subcommand. Use `shaft` or `elevator`.');
        }
    }
};

// Function to handle working on a shaft
async function handleShaftWork(message, user, currentMine, tier) {
    if (isNaN(tier) || tier < 1 || tier > 40) {
        return message.reply('Please provide a valid shaft tier number between 1 and 40.');
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

    const shaftInfo = shaftData.find(s => s.Tier === tier && s.Level === shaft.level);
    if (!shaftInfo) {
        return message.reply(`Unable to find data for Shaft Tier ${tier} at Level ${shaft.level}.`);
    }

    const walkingTimes = {
        1: 2000,
        2: 1000,
        3: 750,
        4: 500,
        5: 400,
        6: 333
    };

    const walkingTime = walkingTimes[shaft.workerWalkingSpeedPerSecond] || 500; // Default to 0.5 seconds if not found

    const initialMessage = await message.reply('Walking to deposit...');

    const mineProcess = new Promise((resolve) => {
        setTimeout(async () => {
            await initialMessage.edit(`Mining deposit in Shaft ${tier}...`);
            setTimeout(async () => {
                await initialMessage.edit('Extracting minerals into the basket...');
                setTimeout(async () => {
                    const deposit = shaft.capacityPerWorker * shaft.numberOfWorkers;
                    shaft.totalDeposit = (shaft.totalDeposit || 0) + deposit;
                    await updateUser(user.id, user);
                    await initialMessage.edit(`Successfully mined minerals with Shaft Tier ${tier}. Total deposit now: ${numberFormat(shaft.totalDeposit)}`);
                    resolve();
                }, walkingTime);
            }, FOUR_SECONDS);
        }, walkingTime);
    });

    return mineProcess;
}

// Function to handle working with the elevator
async function handleElevatorWork(message, user, currentMine) {
    const elevator = currentMine.elevator;

    if (!elevator) {
        return message.reply('You do not have an elevator in this mine. Please buy one first.');
    }

    const now = Date.now();
    const elevatorInfo = elevatorData.find(e => e.Level === elevator.level);

    if (!elevatorInfo) {
        return message.reply('Elevator data not found.');
    }

    const LOADING_TIME = elevatorInfo.Capacity / elevatorInfo.LoadingPerSecond * 1000;

    if (elevator.lastWorkedOn && (now - elevator.lastWorkedOn < LOADING_TIME)) {
        const remainingTime = LOADING_TIME - (now - elevator.lastWorkedOn);
        const secondsRemaining = Math.ceil(remainingTime / 1000);
        return message.reply(`Please wait ${secondsRemaining} seconds for the elevator to finish loading.`);
    }

    elevator.lastWorkedOn = now;
    const initialMessage = await message.reply('Loading minerals from all shafts...');

    setTimeout(async () => {
        const totalDeposit = currentMine.mineshafts.reduce((sum, shaft) => sum + (shaft.totalDeposit || 0), 0);
        currentMine.mineshafts.forEach(shaft => shaft.totalDeposit = 0); // Reset shaft deposits
        user.cash += totalDeposit * 0.1; // Example: 10% of total deposit as cash reward
        await updateUser(user.id, user);
        await initialMessage.edit(`Elevator has finished loading. Total minerals collected: ${numberFormat(totalDeposit)}. Cash reward: ${numberFormat(totalDeposit * 0.1)}`);
    }, LOADING_TIME);
}
