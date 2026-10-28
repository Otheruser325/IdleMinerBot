import test from 'node:test';
import assert from 'node:assert/strict';

import { createDataManager } from '../dataManager.js';
import {
    moneyCovers, moneyLt, moneyGte, moneySub, toMoney, MAX_SAFE_MONEY
} from '../utils/economyConstants.js';
import {
    resolveAutomationCycles, clampIdleAccrualSeconds, MAX_AUTOMATION_CYCLES_PER_TICK, MAX_IDLE_ACCRUAL_SECONDS
} from '../utils/automationCycles.js';
import {
    createComponentToken, isComponentTokenOwner, resetComponentTokensForTests
} from '../utils/interactionSessions.js';
import {
    checkCommandCooldown, isCooldownActive, resetCooldownsForTests
} from '../cooldownManager.js';

const userId = '12345678901234567';

function createMockDatabase(initial = {}) {
    const tables = new Map(Object.entries(initial).map(([table, rows]) => [
        table,
        new Map(Object.entries(rows).map(([id, row]) => [id, structuredClone(row)]))
    ]));

    function tableRows(name) {
        if (!tables.has(name)) tables.set(name, new Map());
        return tables.get(name);
    }

    function query(table, operation = 'select', payload = null) {
        const state = { filters: [], selected: false, limit: null, single: false };
        const builder = {
            select() { state.selected = true; return builder; },
            eq(column, value) { state.filters.push([column, value]); return builder; },
            limit(value) { state.limit = value; return builder; },
            maybeSingle() { state.single = true; return builder; },
            insert(value) { return query(table, 'insert', value); },
            update(value) { return query(table, 'update', value); },
            upsert(value) { return query(table, 'upsert', value); },
            delete() { return query(table, 'delete'); },
            then(resolve, reject) {
                try {
                    const rows = tableRows(table);
                    const matches = [...rows.entries()].filter(([, row]) =>
                        state.filters.every(([column, value]) => row[column] === value)
                    );
                    let data = null;

                    if (operation === 'insert' || operation === 'upsert') {
                        const values = Array.isArray(payload) ? payload : [payload];
                        for (const value of values) {
                            if (operation === 'insert' && rows.has(value.id)) {
                                return resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
                            }
                            // Mirror the Postgres `version bigint not null default 0`.
                            if (value.version === undefined) value.version = 0;
                            rows.set(value.id, { ...(rows.get(value.id) || {}), ...structuredClone(value) });
                        }
                        data = values.length === 1 ? structuredClone(values[0]) : values.map(structuredClone);
                    } else if (operation === 'update') {
                        for (const [id, row] of matches) rows.set(id, { ...row, ...structuredClone(payload) });
                        data = state.selected
                            ? (matches.length === 1
                                ? structuredClone(rows.get(matches[0][0]))
                                : (matches.length === 0 ? null : matches.map(([id]) => structuredClone(rows.get(id)))))
                            : null;
                    } else {
                        const selected = state.limit === 1 || state.single ? matches.slice(0, 1) : matches;
                        data = selected.map(([, row]) => structuredClone(row));
                        if (state.limit === 1 || state.single) data = data.length === 1 ? data[0] : null;
                    }

                    return resolve({ data, error: null });
                } catch (error) {
                    return reject(error);
                }
            }
        };
        return builder;
    }

    return {
        provider: () => ({ from: table => query(table) }),
        tables,
        async get(table, id) { return structuredClone(tableRows(table).get(id)); }
    };
}

test('C1: spend gates reject a balance that is short of the cost at late-game scale', () => {
    // 1e170 is exactly representable. A cost 5e-10 relative above the balance is
    // still a distinct double, and sits *inside* the 1e-9 relative tolerance.
    const balance = 1e170;
    const slightlyMore = 1.0000000005e170;

    assert.equal(moneyCovers(balance, balance), true, 'equal balance is affordable');
    assert.equal(moneyCovers(balance, slightlyMore), false, 'short balance is not affordable');

    // The tolerant helper used for display treats that tiny difference as equal,
    // which is exactly why it must never gate a debit.
    assert.equal(moneyGte(balance, slightlyMore), true, 'display comparison is tolerant');
    assert.equal(moneyLt(balance, slightlyMore), false, 'display comparison is tolerant');

    // A debit that somehow slipped through would drive the balance negative and
    // make every later purchase free; toMoney clamps that at zero.
    assert.equal(moneySub(balance, slightlyMore), 0);
    assert.equal(toMoney(-5), 0);
});

test('C1: a short balance never leaves a negative wallet after a guarded purchase', () => {
    const cash = 1e170;
    const cost = 1.0000001e170;
    assert.equal(moneyCovers(cash, cost), false);
    // Only subtract when covered; the guard is what keeps cash >= 0.
    const nextCash = moneyCovers(cash, cost) ? moneySub(cash, cost) : cash;
    assert.equal(nextCash >= 0, true);
    assert.equal(nextCash, cash);
});

test('C1: non-finite values fail closed instead of minting money', () => {
    // A corrupt/infinite balance is treated as zero by the gate, so it can never
    // satisfy an affordability check.
    assert.equal(toMoney(Infinity), 0);
    assert.equal(toMoney(NaN), 0);
    assert.equal(moneyCovers(Infinity, MAX_SAFE_MONEY), false);
});

test('C2: per-tick automation work is bounded and the backlog drains later', () => {
    const cycleTime = 1000;
    const now = 10_000_000;

    // A fresh manager that just worked does nothing this tick.
    assert.deepEqual(resolveAutomationCycles(now, cycleTime, now), {
        cyclesToProcess: 0, nextLastWorked: now, backlog: 0
    });

    // A normal gap processes exactly the elapsed cycles.
    const small = resolveAutomationCycles(now - 5 * cycleTime, cycleTime, now);
    assert.equal(small.cyclesToProcess, 5);
    assert.equal(small.backlog, 0);
    assert.equal(small.nextLastWorked, now);

    // A 30-day-stale timestamp is capped, not multiplied out in one tick.
    const staleLastWorked = now - 30 * 24 * 60 * 60 * 1000;
    const huge = resolveAutomationCycles(staleLastWorked, cycleTime, now);
    assert.equal(huge.cyclesToProcess, MAX_AUTOMATION_CYCLES_PER_TICK);
    assert.equal(huge.nextLastWorked, staleLastWorked + MAX_AUTOMATION_CYCLES_PER_TICK * cycleTime);
    assert.ok(huge.backlog > 0, 'unprocessed cycles remain queued');

    // The remainder is what the next tick will pick up, still bounded.
    const next = resolveAutomationCycles(huge.nextLastWorked, cycleTime, now);
    assert.equal(next.cyclesToProcess, MAX_AUTOMATION_CYCLES_PER_TICK);
    assert.ok(next.nextLastWorked > huge.nextLastWorked);
});

test('C2: invalid cycle times and timestamps never spin the loop', () => {
    const now = 1_000_000;
    for (const bad of [0, -1, NaN, Infinity]) {
        assert.equal(resolveAutomationCycles(now - 10_000, bad, now).cyclesToProcess, 0);
    }
    assert.equal(resolveAutomationCycles(NaN, 1000, now).cyclesToProcess, 0);
    assert.equal(resolveAutomationCycles(now - 10_000, 1000, NaN).cyclesToProcess, 0);
});

test('C2: idle accrual windows are clamped and backwards clocks credit nothing', () => {
    assert.equal(clampIdleAccrualSeconds(30), 30);
    assert.equal(clampIdleAccrualSeconds(MAX_IDLE_ACCRUAL_SECONDS * 100), MAX_IDLE_ACCRUAL_SECONDS);
    assert.equal(clampIdleAccrualSeconds(-50), 0);
    assert.equal(clampIdleAccrualSeconds(NaN), 0);
    assert.equal(clampIdleAccrualSeconds(Infinity), 0);
});

test('H1: checkout fulfilment is idempotent and bound to the recorded payer', async () => {
    const db = createMockDatabase();
    const manager = createDataManager(db.provider);

    await manager.createCheckoutSessionRecord('cs_test_1', {
        kind: 'premium_checkout', userId, product: 'premium_pass', fulfilled: false
    });

    const record = await manager.getCheckoutSessionRecord('cs_test_1');
    assert.equal(record.userId, userId);

    // First webhook delivery claims and grants.
    assert.equal(await manager.claimCheckoutFulfilment('cs_test_1', 'cs_test_1'), true);
    // A replayed delivery is refused, so the entitlement cannot be granted twice.
    assert.equal(await manager.claimCheckoutFulfilment('cs_test_1', 'cs_test_1'), false);
    // An unknown session (forged event) has no record to claim.
    assert.equal(await manager.getCheckoutSessionRecord('cs_forged'), null);
    assert.equal(await manager.claimCheckoutFulfilment('cs_forged'), false);
});

test('H2: hello/info cooldowns throttle per user without leaking across commands or users', () => {
    resetCooldownsForTests();

    const first = checkCommandCooldown(userId, 'hello');
    assert.equal(first.limited, false, 'first use is allowed');
    assert.equal(isCooldownActive(userId, 'hello') > 0, true, 'timer is armed');

    const second = checkCommandCooldown(userId, 'hello');
    assert.equal(second.limited, true, 'immediate repeat is limited');
    assert.ok(second.remainingSeconds >= 1 && second.remainingSeconds <= 5);

    // A different user is unaffected.
    assert.equal(checkCommandCooldown('99999999999999999', 'hello').limited, false);
    // An unthrottled command (e.g. balance) is never limited.
    assert.equal(checkCommandCooldown(userId, 'balance').limited, false);
    assert.equal(checkCommandCooldown(userId, 'balance').limited, false);
});

test('M3: component tokens fail closed for unknown or wrong owners', () => {
    resetComponentTokensForTests();

    const token = createComponentToken(userId, 60_000);
    assert.equal(isComponentTokenOwner({ user: { id: userId } }, token), true);
    assert.equal(isComponentTokenOwner({ user: { id: 'someone-else' } }, token), false);
    assert.equal(isComponentTokenOwner({ user: { id: userId } }, 'not-a-real-token'), false);
    assert.equal(isComponentTokenOwner({ user: { id: userId } }, ''), false);
    assert.equal(isComponentTokenOwner(null, token), false);
});

test('M3: expired component tokens are rejected', async () => {
    resetComponentTokensForTests();
    const token = createComponentToken(userId, 1);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(isComponentTokenOwner({ user: { id: userId } }, token), false);
});
