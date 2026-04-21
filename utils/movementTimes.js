import { applySpeedBoost } from './managerAbilities.js';

function normalizeSpeed(speed) {
    const numericSpeed = Number(speed) || 0;
    return numericSpeed > 0 ? numericSpeed : 1;
}

export function getShaftTravelTimeMs(workerSpeed, currentMine) {
    const baseTimeMs = 3000 / normalizeSpeed(workerSpeed);
    return applySpeedBoost(baseTimeMs, 'shaft', currentMine);
}

export function getWarehouseTravelTimeMs(workerSpeed, currentMine) {
    const baseTimeMs = 4000 / normalizeSpeed(workerSpeed);
    return applySpeedBoost(baseTimeMs, 'warehouse', currentMine);
}

export function getElevatorSegmentTravelTimeMs(elevatorSpeed, currentMine) {
    const baseTimeMs = 1000 / normalizeSpeed(elevatorSpeed);
    return applySpeedBoost(baseTimeMs, 'elevator', currentMine);
}

export default {
    getShaftTravelTimeMs,
    getWarehouseTravelTimeMs,
    getElevatorSegmentTravelTimeMs
};
