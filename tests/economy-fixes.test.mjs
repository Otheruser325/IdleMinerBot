import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePurchaseAmount, resolvePurchaseCount } from '../utils/purchaseAmount.js';
import { planUpgrade } from '../utils/upgradeEngine.js';
import {
    moneyAdd, moneySub, moneyLt, moneyGte, toMoney, MAX_SAFE_MONEY
} from '../utils/economyConstants.js';
import {
    normalizeBooster, getActiveBoostMultiplier, getActiveInstantCashSeconds
} from '../utils/boosts.js';
import { applyIncomeMultiplier } from '../utils/managerAbilities.js';
import { createDataManager } from '../dataManager.js';

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
        const state = { filters: [], selected: false, head: false, limit: null, single: false };
        const builder = {
            select(columns = '*', options = {}) { state.selected = true; state.head = Boolean(options.head); return builder; },
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

                    if (operation === 'insert') {
                        const values = Array.isArray(payload) ? payload : [payload];
                        for (const value of values) {
                            if (rows.has(value.id)) return resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
                            rows.set(value.id, structuredClone(value));
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
                        data = state.head ? null : selected.map(([, row]) => structuredClone(row));
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

test('purchase amounts are relative: counts, percentages, and MAX', () => {
    assert.deepEqual(parsePurchaseAmount('5').amount, 5);
    assert.equal(parsePurchaseAmount('5').isPercent, false);
    assert.equal(parsePurchaseAmount('25%').percent, 25);
    assert.equal(parsePurchaseAmount('MAX').isMax, true);
    assert.equal(parsePurchaseAmount('-1').isMax, true);
    assert.equal(parsePurchaseAmount('abc').ok, false);
    assert.equal(parsePurchaseAmount('0').ok, false);
    assert.equal(parsePurchaseAmount('101%').ok, false);

    // Percentages are computed against what the player can currently afford.
    assert.equal(resolvePurchaseCount(parsePurchaseAmount('50%'), 10), 5);
    assert.equal(resolvePurchaseCount(parsePurchaseAmount('MAX'), 10), 10);
    assert.equal(resolvePurchaseCount(parsePurchaseAmount('5'), 3), 3);
});

test('upgrade planner indexes the curve once and never overspends', () => {
    const records = Array.from({ length: 100 }, (_, index) => ({
        Level: index + 1,
        Cost: 10 * (index + 1),
        BigUpdate: index % 10 === 9 ? 1 : 0
    }));
    const plan = planUpgrade({
        records,
        currentLevel: 1,
        maxLevel: 2000,
        availableCash: 1000,
        purchaseAmount: parsePurchaseAmount('MAX'),
        scaleCost: record => record.Cost,
        superCashPerBigUpdate: 2
    });

    assert.ok(plan.appliedCount > 0);
    assert.ok(plan.totalCost <= 1000);
    assert.ok(moneyGte(1000, plan.totalCost));
    assert.equal(plan.finalLevel, 1 + plan.appliedCount);

    // Requesting more than affordable is reported as exceeded, not silently paid.
    const capped = planUpgrade({
        records,
        currentLevel: 1,
        maxLevel: 2000,
        availableCash: 100,
        purchaseAmount: parsePurchaseAmount('50'),
        scaleCost: record => record.Cost,
        superCashPerBigUpdate: 0
    });
    assert.equal(capped.exceededRequest, true);
    assert.ok(capped.appliedCount <= capped.affordableCount);
});

test('currency helpers are relative-tolerant and never produce Infinity', () => {
    assert.equal(moneyAdd(Infinity, 5), 5);
    assert.equal(Number.isFinite(moneyAdd(Infinity, Infinity)), true);
    assert.equal(moneyAdd(1e305, 1e305), MAX_SAFE_MONEY);
    assert.equal(toMoney(NaN), 0);
    assert.equal(moneySub(100, 150), 0);
    // 1e155 is below the relative epsilon at 1e170 scale, so these compare equal.
    assert.equal(moneyGte(1e170 + 1e155, 1e170), true);
    assert.equal(moneyLt(1e170 - 1e162, 1e170), true);
});

test('boosters normalize to one contract and fold into income', () => {
    assert.equal(normalizeBooster({ item_id: 1, active_time: 3600, income_factor: 2 }).incomeFactor, 2);
    assert.equal(normalizeBooster({ item_id: 7, InstantCashTime: 43200 }).instantCashSeconds, 43200);
    assert.equal(normalizeBooster({ item_id: 9 }), null);

    const now = Date.now();
    const user = {
        active_boosts: [
            { income_factor: 2, end_time: now + 60_000 },
            { income_factor: 10, end_time: now + 60_000 },
            { income_factor: 50, end_time: now - 1 },
            { instant_cash: 3600, end_time: now + 60_000 }
        ]
    };

    // Same-factor boosts do not stack; expired ones are ignored.
    assert.equal(getActiveBoostMultiplier(user, now), 10);
    assert.equal(getActiveInstantCashSeconds(user, now), 3600);

    const mine = { managers: { shaft: [], elevator: [], warehouse: [] } };
    const result = applyIncomeMultiplier(100, mine, getActiveBoostMultiplier(user, now));
    assert.equal(result.boostMultiplier, 10);
    assert.equal(result.finalCash, 1000);
});

test('transaction retries never double-apply a mutation after a version conflict', async () => {
    const db = createMockDatabase({
        users: { [userId]: { id: userId, version: 1, data: { user_id: userId, cash: 0 } } }
    });
    const manager = createDataManager(db.provider);

    // Simulate a lost compare-and-swap: bump the stored version between the
    // mutator's read and its guarded write on the first attempt.
    const originalProvider = db.provider;
    let bumped = false;
    const racingProvider = () => {
        const client = originalProvider();
        return {
            from: table => {
                const builder = client.from(table);
                const originalThen = builder.then.bind(builder);
                builder.then = (resolve, reject) => originalThen((result) => {
                    if (!bumped) {
                        bumped = true;
                        const row = db.tables.get('users').get(userId);
                        db.tables.get('users').set(userId, { ...row, version: row.version + 1 });
                    }
                    return resolve(result);
                }, reject);
                return builder;
            }
        };
    };

    const racingManager = createDataManager(racingProvider);
    const result = await racingManager.updateUserTransaction(userId, current => ({
        ...current,
        cash: (current.cash || 0) + 10
    }));

    assert.equal(result.committed, true);
    const row = await db.get('users', userId);
    // Applied exactly once despite the retry.
    assert.equal(row.data.cash, 10);
    assert.equal(manager !== null, true);
});
