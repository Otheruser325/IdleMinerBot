const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const shaftData = require('../../config/shaftData.json').shaftData;
const elevatorData = require('../../config/elevatorData.json').elevatorData;
const warehouseData = require('../../config/warehouseData.json').warehouseData;

module.exports = {
    name: 'work',
    description: 'Operate your mineshafts, elevator or warehouse.',
    usage: '<subcommand> [tier]',
    exampleUsage: 'v work shaft 1 | v work elevator | v work warehouse',
    async execute(message, args) {
        if (args.length < 1) {
            return message.reply('Please provide a subcommand: `shaft`, `elevator`, or `warehouse`.');
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
                await handleShaftWork(message, user, currentMine, userId, parseInt(args[1], 10));
                break;
            case 'elevator':
                if (!currentMine.elevator || currentMine.elevator.length === 0) {
                    return message.reply('You need to work in Mineshaft 1 before accessing the Elevator.');
                }
                await handleElevatorWork(message, user, currentMine, userId);
                break;
            case 'warehouse':
                if (!currentMine.warehouse || currentMine.warehouse.length === 0) {
                    return message.reply('You need to work in the Elevator before accessing the Warehouse.');
                }
                await handleWarehouseWork(message, user, currentMine, userId);
                break;
            default:
			    return message.reply(`<@${userId}>, to start working your mine, you'll need to do: use either **shaft**, **elevator** or **warehouse** as the subcommand to operate them in your mine. For shafts, you'll need to use im!work shaft (shaftNum) to operate a specific mineshaft in a specified order of their tier you own (i.e. im!work shaft 1).`);
        }
    }
};

// Function to handle working on a shaft
async function handleShaftWork(message, user, currentMine, userId, tier) {
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
                    await updateUser(userId, user);
                    await initialMessage.edit(`Successfully mined minerals with Shaft Tier ${tier}. Total deposit now: ${numberFormat(shaft.totalDeposit)}`);
                    resolve();
                }, walkingTime);
            }, FOUR_SECONDS);
        }, walkingTime);
    });

    // Initialize the elevator and warehouse if working in Mineshaft 1
    if (tier === 1 && (!currentMine.elevator || currentMine.elevator.length === 0)) {
        currentMine.elevator = [{
            level: 1,
            lastWorkedOn: 0,
            speed: elevatorData[0].Speed || 0.5,
            capacity: elevatorData[0].Capacity,
            loadingPerSecond: elevatorData[0].LoadingPerSecond,
            totalDeposit: 0
        }];

        // Initialize warehouse
        currentMine.warehouse = [{
            level: 1,
			lastWorkedOn: 0,
            numberOfWorkers: warehouseData[0].NumberOfWorkers || 1,
            capacityPerWorker: warehouseData[0].CapacityPerWorker,
            workerWalkingSpeedPerSecond: warehouseData[0].WorkerWalkingSpeedPerSecond,
            loadingPerSecond: warehouseData[0].LoadingPerSecond,
            totalDeposit: 0
        }];

        await updateUser(userId, user);
        await message.reply('Elevator and Warehouse have been initialized in your mine. You can now use them to collect and manage minerals.');
    }

    return mineProcess;
}

// Function to handle working with the elevator
async function handleElevatorWork(message, user, currentMine, userId) {
    const elevator = currentMine.elevator[0];

    if (!elevator) {
        return message.reply('You need to work in Mineshaft 1 before accessing the Elevator.');
    }

    const now = Date.now();
    const elevatorInfo = elevatorData.find(e => e.Level === elevator.level);

    if (!elevatorInfo) {
        return message.reply('Elevator data not found.');
    }

    const LOADING_TIME = elevator.capacity / elevatorInfo.LoadingPerSecond * 1000;
    const TRAVEL_TIME = elevator.speed * currentMine.mineshafts.length * 1000; // Travel time to all shafts and back

    if (elevator.lastWorkedOn && (now - elevator.lastWorkedOn < LOADING_TIME + TRAVEL_TIME)) {
        const remainingTime = LOADING_TIME + TRAVEL_TIME - (now - elevator.lastWorkedOn);
        const secondsRemaining = Math.ceil(remainingTime / 1000);
        return message.reply(`Please wait ${secondsRemaining} seconds for the elevator to finish its tasks.`);
    }

    elevator.lastWorkedOn = now;
    const initialMessage = await message.reply('Travelling to the shafts...');

    setTimeout(async () => {
        await initialMessage.edit('Extracting minerals from all shafts...');
        setTimeout(async () => {
            let totalDeposit = 0;

            for (const shaft of currentMine.mineshafts) {
                const shaftDeposit = shaft.totalDeposit || 0;
                if (elevator.totalDeposit + shaftDeposit > elevator.capacity) {
                    // If adding this shaft’s deposit exceeds capacity, take only the remaining space
                    const remainingCapacity = elevator.capacity - elevator.totalDeposit;
                    elevator.totalDeposit += remainingCapacity;
                    totalDeposit += remainingCapacity;
                    shaft.totalDeposit = shaftDeposit - remainingCapacity; // Reduce the remaining deposit
                    break;
                } else {
                    elevator.totalDeposit += shaftDeposit;
                    totalDeposit += shaftDeposit;
                    shaft.totalDeposit = 0; // Empty the shaft deposit
                }
            }

            await updateUser(userId, user);
            await initialMessage.edit('Travelling back to extraction base...');
            setTimeout(async () => {
                await initialMessage.edit('Importing minerals into the deposit tank...');
                setTimeout(async () => {
                    if (!currentMine.warehouse || currentMine.warehouse.length === 0) {
                        return message.reply('Warehouse is not initialized.');
                    }

                    currentMine.warehouse[0].totalDeposit += elevator.totalDeposit;
                    elevator.totalDeposit = 0; // Reset elevator deposit
                    await updateUser(userId, user);
                    await initialMessage.edit(`Successfully imported minerals worth ${numberFormat(totalDeposit)} into the deposit tank.`);
                }, LOADING_TIME);
            }, TRAVEL_TIME);
        }, TRAVEL_TIME);
    }, elevator.speed * currentMine.mineshafts.length * 1000);
}

// Function to handle working with the warehouse
async function handleWarehouseWork(message, user, currentMine, userId) {
    const warehouse = currentMine.warehouse[0];

    if (!warehouse) {
        return message.reply('Warehouse is not initialized.');
    }

    const now = Date.now();
    const warehouseInfo = warehouseData.find(w => w.Level === warehouse.level);

    if (!warehouseInfo) {
        return message.reply('Warehouse data not found.');
    }

    const LOADING_TIME = warehouse.totalDeposit / warehouseInfo.LoadingPerSecond * 1000;
    const WALKING_TIME = warehouseInfo.CapacityPerWorker / warehouseInfo.NumberOfWorkers / warehouseInfo.LoadingPerSecond * 1000;

    if (warehouse.lastWorkedOn && (now - warehouse.lastWorkedOn < LOADING_TIME + WALKING_TIME)) {
        const remainingTime = LOADING_TIME + WALKING_TIME - (now - warehouse.lastWorkedOn);
        const secondsRemaining = Math.ceil(remainingTime / 1000);
        return message.reply(`Please wait ${secondsRemaining} seconds for the warehouse to finish its tasks.`);
    }

    warehouse.lastWorkedOn = now;
    const initialMessage = await message.reply('Walking into the deposit base...');

    setTimeout(async () => {
        await initialMessage.edit('Extracting minerals from the deposit base...');
        setTimeout(async () => {
            const totalDeposit = warehouse.totalDeposit || 0;
            const cashReward = totalDeposit;
            warehouse.totalDeposit = 0;
            await updateUser(userId, user);
            await initialMessage.edit('Returning to the warehouse with extracted goods...');
            setTimeout(async () => {
                await initialMessage.edit('Selling minerals...');
                setTimeout(async () => {
                    user.cash += cashReward;
                    await updateUser(userId, user);
                    await initialMessage.edit(`Successfully sold minerals worth ${numberFormat(cashReward)}.`);
                }, WALKING_TIME);
            }, WALKING_TIME);
        }, WALKING_TIME);
    }, WALKING_TIME);
}
