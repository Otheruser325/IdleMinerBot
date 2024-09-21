const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const shaftData = require('../../config/shaftData.json').shaftData;
const elevatorData = require('../../config/elevatorData.json').elevatorData;
const warehouseData = require('../../config/warehouseData.json').warehouseData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Operate your mineshafts, elevator, or warehouse.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('shaft')
                .setDescription('Work on a specific shaft tier.')
                .addIntegerOption(option =>
                    option.setName('tier')
                        .setDescription('The shaft tier to work on (1-40).')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('elevator')
                .setDescription('Operate the elevator.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('warehouse')
                .setDescription('Operate the warehouse.')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const user = await getUser(userId);

        if (!user) {
            return interaction.reply('You need to start the game first by using `/start`.');
        }

        const currentMine = user.mines.find(mine => mine.mine_name === user.current_mine);
        if (!currentMine) {
            return interaction.reply('Current mine data not found.');
        }

        switch (subcommand) {
            case 'shaft':
                const tier = interaction.options.getInteger('tier');
                if (tier < 1 || tier > 40) {
                    return interaction.reply('Please provide a valid shaft tier number between 1 and 40.');
                }
                await handleShaftWork(interaction, user, currentMine, userId, tier);
                break;
            case 'elevator':
                if (!currentMine.elevator || currentMine.elevator.length === 0) {
                    return interaction.reply('You need to work in Mineshaft 1 before accessing the Elevator.');
                }
                await handleElevatorWork(interaction, user, currentMine, userId);
                break;
            case 'warehouse':
                if (!currentMine.warehouse || currentMine.warehouse.length === 0) {
                    return interaction.reply('You need to work in the Elevator before accessing the Warehouse.');
                }
                await handleWarehouseWork(interaction, user, currentMine, userId);
                break;
            default:
                return interaction.reply(`Invalid subcommand, <@${userId}>! To start working your __${currentMine.mine_name}__, you'll need to do: use either **shaft**, **elevator** or **warehouse** as the subcommand to operate them in your mine. For shafts, you'll need to use **/work shaft (shaftNum)** to operate a specific mineshaft in a specified order of their tier you own (i.e. **/work shaft 1**).`);
        }
    }
};

// Function to handle working on a shaft
async function handleShaftWork(interaction, user, currentMine, userId, tier) {
    const shaft = currentMine.mineshafts.find(s => s.tier === tier);

    if (!shaft) {
        return interaction.reply(`You do not own a shaft of Tier ${tier} in the ${currentMine.mine_name}.`);
    }

    const now = Date.now();
    const FOUR_SECONDS = 4000; // 4 seconds for the mining process

    if (shaft.last_worked_on && (now - shaft.last_worked_on < FOUR_SECONDS)) {
        const remainingTime = FOUR_SECONDS - (now - shaft.last_worked_on);
        const secondsRemaining = Math.ceil(remainingTime / 1000);
        return interaction.reply(`Please wait ${secondsRemaining} seconds for the mineshaft to fully mine minerals.`);
    }

    // Update the shaft's last worked on timestamp
    shaft.last_worked_on = now;

    const shaftInfo = shaftData.find(s => s.Tier === tier && s.Level === shaft.level);
    if (!shaftInfo) {
        return interaction.reply(`Unable to find data for Shaft Tier ${tier} at Level ${shaft.level}.`);
    }

    const walkingTimes = {
        1: 2000,
        2: 1000,
        3: 750,
        4: 500,
        5: 400,
        6: 333
    };

    const walkingTime = walkingTimes[shaft.worker_walking_speed_per_second] || 500; // Default to 0.5 seconds if not found

    const initialMessage = await interaction.reply('Walking to deposit...');

    const mineProcess = new Promise((resolve) => {
        setTimeout(async () => {
            await interaction.editReply('Mining deposit in Shaft...');
            setTimeout(async () => {
                await interaction.editReply('Extracting minerals into the basket...');
                setTimeout(async () => {
                    const deposit = shaft.capacity_per_worker * shaft.number_of_workers;
                    shaft.total_deposit = (shaft.total_deposit || 0) + deposit;
                    await updateUser(userId, user);
                    await interaction.editReply(`Successfully mined minerals with Shaft Tier ${tier}. Total deposit now: ${numberFormat(shaft.total_deposit)}`);
                    resolve();
                }, walkingTime);
            }, FOUR_SECONDS);
        }, walkingTime);
    });

    // Initialize the elevator and warehouse if working in Mineshaft 1
    if (tier === 1 && (!currentMine.elevator || currentMine.elevator.length === 0)) {
        currentMine.elevator = [{
            level: 1,
            last_worked_on: 0,
            speed: elevatorData[0].Speed || 0.5,
            capacity: elevatorData[0].Capacity,
            loading_per_second: elevatorData[0].LoadingPerSecond,
            total_deposit: 0
        }];

        // Initialize warehouse
        currentMine.warehouse = [{
            level: 1,
			last_worked_on: 0,
            number_of_workers: warehouseData[0].NumberOfWorkers || 1,
            capacity_per_worker: warehouseData[0].CapacityPerWorker,
            worker_walking_speed_per_second: warehouseData[0].WorkerWalkingSpeedPerSecond,
            loading_per_second: warehouseData[0].LoadingPerSecond,
            total_deposit: 0
        }];

        await updateUser(userId, user);
        await interaction.followUp('Elevator and Warehouse have been initialized in your mine. You can now use them to collect and manage minerals.');
    }

    return mineProcess;
}

// Function to handle working with the elevator
async function handleElevatorWork(interaction, user, currentMine, userId) {
    const elevator = currentMine.elevator[0];

    if (!elevator) {
        return interaction.reply('You need to work in Mineshaft 1 before accessing the Elevator.');
    }

    const now = Date.now();
    const elevatorInfo = elevatorData.find(e => e.Level === elevator.level);

    if (!elevatorInfo) {
        return interaction.reply('Elevator data not found.');
    }

    const LOADING_PER_SECOND = elevatorInfo.LoadingPerSecond;
	const elevatorCapacity = elevator.capacity;
    const elevatorSpeed = elevator.speed;
    const SHAFT_TRAVEL_TIME = 2000 / elevatorSpeed; // Travel time between shafts
	
	if (elevator.last_worked_on && (now - elevator.last_worked_on < SHAFT_TRAVEL_TIME)) {
        const remainingTime = SHAFT_TRAVEL_TIME - (now - elevator.last_worked_on);
        const secondsRemaining = Math.ceil(remainingTime / 1000);
        return message.reply(`Please wait ${secondsRemaining} seconds for the elevator to finish its tasks.`);
    }

    elevator.last_worked_on = now;
    let totalDeposit = 0; // Track total minerals collected
    const initialMessage = await message.reply('Travelling to the shafts...');

    // Process each shaft
    for (const shaft of currentMine.mineshafts) {
        const shaftDeposit = shaft.total_deposit || 0;

        // Skip shafts that don't have any minerals
        if (shaftDeposit === 0) continue;

        await interaction.editReply(`Arriving at Shaft Tier ${shaft.tier}...`);

        // Travel time to reach this shaft
        await new Promise(resolve => setTimeout(resolve, SHAFT_TRAVEL_TIME));

        // Determine how much the elevator can load from this shaft
        const remainingCapacity = elevatorCapacity - elevator.total_deposit;
        const amountToExtract = Math.min(shaftDeposit, remainingCapacity);

        if (amountToExtract > 0) {
            const extractionTime = (amountToExtract / LOADING_PER_SECOND) * 1000;
            await interaction.editReply(`Extracting ${numberFormat(amountToExtract)} minerals from Shaft Tier ${shaft.tier}...`);

            // Simulate the time it takes to extract minerals
            await new Promise(resolve => setTimeout(resolve, extractionTime));

            // Update deposits
            shaft.total_deposit -= amountToExtract;
            elevator.total_deposit += amountToExtract;
            totalDeposit += amountToExtract;

            // Check if the elevator has reached its full capacity
            if (elevator.total_deposit >= elevatorCapacity) {
                await interaction.editReply('Elevator is full. Returning to base...');
                break;
            }
        }
    }

    if (totalDeposit === 0) {
        return interaction.reply('No minerals were extracted, as there were none available in the shafts.');
    }
	
	// Travel back to base
    await interaction.editReply('Travelling back to extraction base...');
    await new Promise(resolve => setTimeout(resolve, SHAFT_TRAVEL_TIME * currentMine.mineshafts.length));

    // Simulate depositing the minerals into the deposit tank
    await interaction.editReply('Importing minerals into the deposit tank...');
    await new Promise(resolve => setTimeout(resolve, (totalDeposit / LOADING_PER_SECOND) * 1000));

    // Update the user data with the new elevator deposit
    await updateUser(userId, user);
    await interaction.editReply(`Successfully imported ${numberFormat(totalDeposit)} minerals into the deposit tank.`);
}

// Function to handle working with the warehouse
async function handleWarehouseWork(interaction, user, currentMine, userId) {
    const warehouse = currentMine.warehouse[0];
	const elevator = currentMine.elevator[0];

    if (!warehouse) {
        return interaction.reply('Warehouse is not initialized.');
    }
	
	if (!elevator || elevator.total_deposit === 0) {
        return interaction.reply('The elevator\'s deposit tank is empty.');
    }

    const now = Date.now();
    const warehouseInfo = warehouseData.find(w => w.Level === warehouse.level);

    if (!warehouseInfo) {
        return interaction.reply('Warehouse data not found.');
    }
	
	const { LoadingPerSecond, CapacityPerWorker, NumberOfWorkers } = warehouseInfo;
    
    // Calculate total capacity of all workers
    const totalWorkerCapacity = CapacityPerWorker * NumberOfWorkers;
    
    // Ensure the warehouse doesn't extract more than what the workers can handle
    const extractableAmount = Math.min(elevator.total_deposit, totalWorkerCapacity);

    // Time required to extract minerals based on loading speed
    const LOADING_TIME = extractableAmount / LoadingPerSecond * 1000;
    
    // Walking time to extract (simulating workers walking to the elevator)
    const WALKING_TIME = extractableAmount / NumberOfWorkers / LoadingPerSecond * 1000;

    if (warehouse.last_worked_on && (now - warehouse.last_worked_on < LOADING_TIME + WALKING_TIME)) {
        const remainingTime = LOADING_TIME + WALKING_TIME - (now - warehouse.last_worked_on);
        const secondsRemaining = Math.ceil(remainingTime / 1000);
        return interaction.reply(`Please wait ${secondsRemaining} seconds for the warehouse to finish its tasks.`);
    }

    warehouse.last_worked_on = now;
    const initialMessage = await interaction.reply(`Walking into the deposit base with ${NumberOfWorkers} workers...`);
	
	setTimeout(async () => {
        await interaction.editReply('Extracting minerals from the deposit tank...');
        
        // Simulate each worker extracting in parallel with a slight delay
        for (let i = 0; i < NumberOfWorkers; i++) {
            setTimeout(async () => {
                // Worker extracts their portion based on capacity
                const workerExtracted = Math.min(CapacityPerWorker, extractableAmount - (CapacityPerWorker * i));
                
                if (workerExtracted > 0) {
                    warehouse.total_deposit += workerExtracted;
                    elevator.total_deposit -= workerExtracted;
                }
            }, i * 500); // 500ms delay between workers
        }
        
        setTimeout(async () => {
            await updateUser(userId, user); // Update the user data after extraction
            await interaction.editReply('Returning to the warehouse with extracted minerals...');
            
            setTimeout(async () => {
                await interaction.editReply('Selling minerals...');
                setTimeout(async () => {
                    const cashReward = warehouse.total_deposit;
                    warehouse.total_deposit = 0;
                    user.cash += cashReward; // Add the minerals value to user's cash
                    await updateUser(userId, user); // Update the user data
                    await interaction.editReply(`Successfully sold minerals worth ${numberFormat(cashReward)}.`);
                }, WALKING_TIME); // Selling minerals also takes time
            }, WALKING_TIME); // Simulate the time workers take to walk back
        }, LOADING_TIME); // Time for loading the minerals
    }, WALKING_TIME); // Simulate the time it takes to walk to the deposit
}
