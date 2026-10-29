'use strict';

/**
 * Manager automation replays one iteration per elapsed production cycle. A
 * heavily boosted mine that has been idle for a long time — or a document
 * carrying a stale `manager_last_worked` — could otherwise drive a single
 * mutator call into millions of iterations and block the event loop for every
 * other user. Work is therefore bounded per tick, and the unprocessed remainder
 * stays queued on the timestamp so the backlog drains over later ticks.
 */
export const MAX_AUTOMATION_CYCLES_PER_TICK = 2000;

/**
 * Idle accrual is credited as `rate * elapsed`. A stale `last_idle_accrued_at`
 * (a process that was down, or a hostile timestamp) would otherwise convert an
 * unbounded gap into a single windfall, so the elapsed window is capped and a
 * backwards clock (negative gap) credits nothing.
 */
export const MAX_IDLE_ACCRUAL_SECONDS = 7 * 24 * 60 * 60;

export function clampIdleAccrualSeconds(elapsedSeconds, maxSeconds = MAX_IDLE_ACCRUAL_SECONDS) {
    const value = Number(elapsedSeconds);
    if (!Number.isFinite(value) || value <= 0) return 0;
    const cap = Number.isFinite(maxSeconds) && maxSeconds > 0 ? maxSeconds : MAX_IDLE_ACCRUAL_SECONDS;
    return Math.min(value, cap);
}

/**
 * Resolve how many production cycles to simulate for one manager this tick.
 *
 * @param {number} lastWorkedMs  Timestamp of the last simulated cycle.
 * @param {number} cycleTimeMs   Duration of one cycle; must be finite and > 0.
 * @param {number} nowMs         Current time.
 * @param {number} maxCycles     Per-tick cap.
 * @returns {{ cyclesToProcess: number, nextLastWorked: number, backlog: number }}
 */
export function resolveAutomationCycles(
    lastWorkedMs,
    cycleTimeMs,
    nowMs,
    maxCycles = MAX_AUTOMATION_CYCLES_PER_TICK
) {
    const empty = { cyclesToProcess: 0, nextLastWorked: lastWorkedMs, backlog: 0 };
    if (!Number.isFinite(cycleTimeMs) || cycleTimeMs <= 0) return empty;
    if (!Number.isFinite(lastWorkedMs) || !Number.isFinite(nowMs)) return empty;

    const cap = Number.isFinite(maxCycles) && maxCycles > 0 ? Math.floor(maxCycles) : MAX_AUTOMATION_CYCLES_PER_TICK;
    const elapsed = nowMs - lastWorkedMs;
    if (elapsed < cycleTimeMs) return empty;

    const cyclesCompleted = Math.floor(elapsed / cycleTimeMs);
    const cyclesToProcess = Math.min(cyclesCompleted, cap);
    return {
        cyclesToProcess,
        nextLastWorked: lastWorkedMs + (cyclesToProcess * cycleTimeMs),
        backlog: cyclesCompleted - cyclesToProcess
    };
}

export default { MAX_AUTOMATION_CYCLES_PER_TICK, MAX_IDLE_ACCRUAL_SECONDS, resolveAutomationCycles, clampIdleAccrualSeconds };
