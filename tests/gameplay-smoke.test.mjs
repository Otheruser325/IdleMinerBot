import test from 'node:test';
import assert from 'node:assert/strict';
import mineRegions from '../config/mineRegions.json' with { type: 'json' };
import { applyCapacityBoost, applyLoadingSpeedBoost } from '../utils/managerAbilities.js';
import {
    getElevatorSegmentTravelTimeMs,
    getWarehouseTravelTimeMs
} from '../utils/movementTimes.js';
import { isTierBlockedByBarrier } from '../commands/shared/shaft.js';

function activeManager(effectId, valueX, area) {
    return {
        effect_id: effectId,
        value_x: valueX,
        assigned: true,
        assigned_tier: area === 'shaft' ? 1 : null,
        ability_state: {
            active: true,
            expires_at: Date.now() + 60_000
        }
    };
}

function warehouseCashPerSecond(currentMine, baseCapacity = 1000, baseLoading = 250, workerSpeed = 2) {
    const capacity = applyCapacityBoost(baseCapacity, 'warehouse', currentMine);
    const loading = applyLoadingSpeedBoost(baseLoading, 'warehouse', currentMine);
    const travelSeconds = getWarehouseTravelTimeMs(workerSpeed, currentMine) / 1000;
    const cycleSeconds = capacity / loading + (travelSeconds * 2);
    return capacity / cycleSeconds;
}

function elevatorThroughputPerSecond(currentMine, baseCapacity = 600, baseLoading = 150, elevatorSpeed = 0.5) {
    const capacity = applyCapacityBoost(baseCapacity, 'elevator', currentMine);
    const loading = applyLoadingSpeedBoost(baseLoading, 'elevator', currentMine);
    const travelSeconds = getElevatorSegmentTravelTimeMs(elevatorSpeed, currentMine) / 1000;
    const cycleSeconds = (travelSeconds * 2) + ((capacity / loading) * 2);
    return capacity / cycleSeconds;
}

test('movement and rate boosts change cash throughput through the full x-to-y-to-x cycle', () => {
    const baseMine = { managers: { shaft: [], elevator: [], warehouse: [] } };
    const speedMine = { managers: { shaft: [], elevator: [], warehouse: [activeManager(1, 3, 'warehouse')] } };
    const capacityMine = { managers: { shaft: [], elevator: [], warehouse: [activeManager(5, 3, 'warehouse')] } };
    const loadingMine = { managers: { shaft: [], elevator: [], warehouse: [activeManager(4, 3, 'warehouse')] } };

    const base = warehouseCashPerSecond(baseMine);
    const speedBoosted = warehouseCashPerSecond(speedMine);
    const capacityBoosted = warehouseCashPerSecond(capacityMine);
    const loadingBoosted = warehouseCashPerSecond(loadingMine);

    assert.equal(base, 125);
    assert.ok(Math.abs(speedBoosted - (1000 / (1000 / 250 + (666 / 1000) * 2))) < 0.000001);
    assert.equal(capacityBoosted, 187.5);
    assert.equal(loadingBoosted, 187.5);
    assert.notEqual(speedBoosted, base * 3);
    assert.notEqual(capacityBoosted, base * 3);

    const elevatorBase = elevatorThroughputPerSecond(baseMine);
    const elevatorSpeed = elevatorThroughputPerSecond({
        managers: { shaft: [], elevator: [activeManager(11, 3, 'elevator')], warehouse: [] }
    });
    const elevatorCapacity = elevatorThroughputPerSecond({
        managers: { shaft: [], elevator: [activeManager(12, 3, 'elevator')], warehouse: [] }
    });

    assert.ok(elevatorSpeed > elevatorBase);
    assert.ok(elevatorCapacity > elevatorBase);
    assert.ok(elevatorSpeed < elevatorBase * 3);
    assert.ok(elevatorCapacity < elevatorBase * 3);
});

test('MineRegions boundaries are contiguous, canonical, finite, and ordered', () => {
    const regions = mineRegions.regions;
    assert.equal(regions.length, 6);
    assert.deepEqual(Object.keys(regions[0]).sort(), [
        'BuildTimeInSeconds',
        'Cost',
        'FromTier',
        'MaxNumberOfVideosPerHour',
        'Order',
        'SecondsReducedPerVideoWatched',
        'ToTier'
    ].sort());

    assert.equal(isTierBlockedByBarrier(5, { ...regions[1], unlocked: false }), false);
    assert.equal(isTierBlockedByBarrier(6, { ...regions[1], unlocked: false }), true);
    assert.equal(isTierBlockedByBarrier(10, { ...regions[1], unlocked: false }), true);
    assert.equal(isTierBlockedByBarrier(11, { ...regions[1], unlocked: false }), false);

    for (let index = 0; index < regions.length; index += 1) {
        const region = regions[index];
        assert.equal(region.Order, index);
        assert.ok(Number.isInteger(region.FromTier));
        assert.ok(Number.isInteger(region.ToTier));
        assert.ok(region.ToTier >= region.FromTier);
        assert.ok(Number.isFinite(region.Cost));
        assert.ok(region.Cost >= 0);
        assert.ok(region.Cost <= Number.MAX_VALUE);
        if (index > 0) {
            assert.equal(region.FromTier, regions[index - 1].ToTier + 1);
            assert.ok(region.Cost > regions[index - 1].Cost);
        }
    }
});
