import mineFactorsJson from '../config/mineFactors.json' with { type: 'json' };
import {
    applyIncomeMultiplier,
    applyLoadingSpeedBoost,
    applyMiningSpeedBoost,
    getManagerAutomationStatus,
    getManagedShaftTiers,
    getMineWideIncomeMultiplier
} from './managerAbilities.js';
import {
    getElevatorSegmentTravelTimeMs,
    getShaftTravelTimeMs,
    getWarehouseTravelTimeMs
} from './movementTimes.js';

const mineFactors = mineFactorsJson.mines || [];

export function getMaxPrestigeCount(mineNumber) {
    return mineFactors
        .filter(mine => mine.MineNumber === Number(mineNumber))
        .reduce((maxPrestige, mine) => Math.max(maxPrestige, mine.PrestigeCount || 0), 0);
}

export function getShaftProductionPerSecond(shaft, currentMine) {
    const depositPerCycle = (shaft?.capacity_per_worker || 0) * (shaft?.number_of_workers || 0);
    if (depositPerCycle <= 0) {
        return 0;
    }

    const miningTime = applyMiningSpeedBoost(4000, currentMine);
    const walkingTime = getShaftTravelTimeMs(shaft?.worker_walking_speed_per_second, currentMine);
    const totalCycleTimeSeconds = (walkingTime + miningTime + walkingTime) / 1000;

    if (!Number.isFinite(totalCycleTimeSeconds) || totalCycleTimeSeconds <= 0) {
        return 0;
    }

    const mineWideMultiplier = getMineWideIncomeMultiplier(currentMine);
    return (depositPerCycle / totalCycleTimeSeconds) * mineWideMultiplier;
}

export function getMineProductionPerSecond(currentMine) {
    return (currentMine?.mineshafts || []).reduce(
        (total, shaft) => total + getShaftProductionPerSecond(shaft, currentMine),
        0
    );
}

function getElevatorThroughputPerSecond(currentMine, managedTiers) {
    const elevator = currentMine?.elevator?.[0];
    if (!elevator || managedTiers.length === 0) {
        return 0;
    }

    const loadingPerSecond = applyLoadingSpeedBoost(elevator.loading_per_second || 150, 'elevator', currentMine);
    const elevatorCapacity = elevator.capacity || 0;
    const travelTime = getElevatorSegmentTravelTimeMs(elevator.speed || 0.5, currentMine);
    const cycleTimeSeconds = ((travelTime * managedTiers.length * 2) + ((elevatorCapacity / Math.max(loadingPerSecond, 1)) * 1000 * 2)) / 1000;

    if (!Number.isFinite(cycleTimeSeconds) || cycleTimeSeconds <= 0 || elevatorCapacity <= 0) {
        return 0;
    }

    return elevatorCapacity / cycleTimeSeconds;
}

function getWarehouseCashPerSecond(currentMine) {
    const warehouse = currentMine?.warehouse?.[0];
    if (!warehouse) {
        return 0;
    }

    const totalWorkerCapacity = (warehouse.capacity_per_worker || 0) * (warehouse.number_of_workers || 0);
    if (totalWorkerCapacity <= 0) {
        return 0;
    }

    const loadingPerSecond = applyLoadingSpeedBoost(warehouse.loading_per_second || 250, 'warehouse', currentMine);
    const walkingTime = getWarehouseTravelTimeMs(warehouse.worker_walking_speed_per_second, currentMine);
    const cycleTimeSeconds = ((((totalWorkerCapacity / Math.max(loadingPerSecond, 1)) * 1000) + (walkingTime * 2))) / 1000;

    if (!Number.isFinite(cycleTimeSeconds) || cycleTimeSeconds <= 0) {
        return 0;
    }

    const baseCashPerSecond = totalWorkerCapacity / cycleTimeSeconds;
    return applyIncomeMultiplier(baseCashPerSecond, currentMine).finalCash;
}

export function getMineIdleCashPerSecond(currentMine, hasPremium = false) {
    const automationStatus = getManagerAutomationStatus(currentMine);
    const managedTiers = getManagedShaftTiers(currentMine);

    if (!automationStatus.elevator || !automationStatus.warehouse || managedTiers.length === 0) {
        return 0;
    }

    const managedShaftThroughput = (currentMine?.mineshafts || [])
        .filter(shaft => managedTiers.includes(shaft.tier))
        .reduce((total, shaft) => total + getShaftProductionPerSecond(shaft, currentMine), 0);

    const elevatorThroughput = getElevatorThroughputPerSecond(currentMine, managedTiers);
    const warehouseCashPerSecond = getWarehouseCashPerSecond(currentMine);

    if (managedShaftThroughput <= 0 || elevatorThroughput <= 0 || warehouseCashPerSecond <= 0) {
        return 0;
    }

    const idleEfficiency = hasPremium ? 0.2 : 0.1;
    return Math.min(managedShaftThroughput, elevatorThroughput, warehouseCashPerSecond) * idleEfficiency;
}

export default {
    getMaxPrestigeCount,
    getMineProductionPerSecond,
    getMineIdleCashPerSecond,
    getShaftProductionPerSecond
};
