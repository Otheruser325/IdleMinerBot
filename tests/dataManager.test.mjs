import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataManager } from '../dataManager.js';

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
            select(columns = '*', options = {}) {
                state.selected = true;
                state.head = Boolean(options.head);
                return builder;
            },
            eq(column, value) {
                state.filters.push([column, value]);
                return builder;
            },
            limit(value) {
                state.limit = value;
                return builder;
            },
            maybeSingle() {
                state.single = true;
                return builder;
            },
            insert(value) {
                return query(table, 'insert', value);
            },
            update(value) {
                return query(table, 'update', value);
            },
            upsert(value) {
                return query(table, 'upsert', value);
            },
            delete() {
                return query(table, 'delete');
            },
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
                    } else if (operation === 'upsert') {
                        rows.set(payload.id, structuredClone(payload));
                        data = structuredClone(payload);
                    } else if (operation === 'update') {
                        for (const [id, row] of matches) rows.set(id, { ...row, ...structuredClone(payload) });
                        data = state.selected
                            ? (matches.length === 1 ? structuredClone(rows.get(matches[0][0])) : matches.map(([id]) => structuredClone(rows.get(id))))
                            : null;
                    } else if (operation === 'delete') {
                        for (const [id] of matches) rows.delete(id);
                    } else {
                        const selected = state.limit === 1 || state.single ? matches.slice(0, 1) : matches;
                        data = state.head ? null : selected.map(([, row]) => structuredClone(row));
                        if (state.limit === 1 || state.single) {
                            data = data.length === 1 ? data[0] : null;
                        }
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
        async get(table, id) {
            return structuredClone(tableRows(table).get(id));
        }
    };
}

const userId = '12345678901234567';

test('initializes users in the VivacityAPI document envelope while retaining Idle Miner fields', async () => {
    const db = createMockDatabase();
    const manager = createDataManager(db.provider);
    const user = await manager.initializeUser(userId, 'Miner');
    const row = await db.get('users', userId);

    assert.equal(row.id, userId);
    assert.equal(row.version, 1);
    assert.equal(typeof row.data, 'object');
    assert.equal(row.data.username, 'Miner');
    assert.equal(row.data.cash, 10);
    assert.ok(Array.isArray(row.data.mines));
    assert.ok(!('npcs' in row.data));
});

test('merges concurrent transaction changes instead of losing the newer write', async () => {
    const db = createMockDatabase({
        users: {
            [userId]: { id: userId, version: 1, data: { user_id: userId, cash: 100, super_cash: 0, inventory: {} } }
        }
    });
    const manager = createDataManager(db.provider);
    const [first, second] = await Promise.all([
        manager.updateUserTransaction(userId, current => ({ ...current, cash: current.cash + 10 })),
        manager.updateUserTransaction(userId, current => ({ ...current, super_cash: current.super_cash + 5 }))
    ]);

    assert.equal(first.committed, true);
    assert.equal(second.committed, true);
    const row = await db.get('users', userId);
    assert.equal(row.data.cash, 110);
    assert.equal(row.data.super_cash, 5);
    assert.equal(row.version, 3);
});

test('snapshot commits only changed fields and preserves unrelated concurrent data', async () => {
    const db = createMockDatabase({
        users: {
            [userId]: { id: userId, version: 1, data: { user_id: userId, cash: 100, super_cash: 3, inventory: { boosters: [] } } }
        }
    });
    const manager = createDataManager(db.provider);
    const snapshot = await manager.getUser(userId);
    snapshot.cash = 125;

    // Simulate another command changing a separate field after the snapshot read.
    const row = await db.get('users', userId);
    row.data.super_cash = 9;
    row.version = 2;
    db.tables.get('users').set(userId, row);

    const result = await manager.commitUserSnapshot(userId, snapshot);
    assert.equal(result.committed, true);
    const finalRow = await db.get('users', userId);
    assert.equal(finalRow.data.cash, 125);
    assert.equal(finalRow.data.super_cash, 9);
    assert.deepEqual(finalRow.data.inventory, { boosters: [] });
});

test('rejects production-shaped fake IDs but allows them in test managers', async () => {
    const db = createMockDatabase();
    const productionManager = createDataManager(db.provider);
    assert.equal(await productionManager.getUser('test-user'), null);

    const testManager = createDataManager(db.provider, { allowSyntheticUserIds: true });
    const user = await testManager.initializeUser('test-user', 'Test Miner');
    assert.equal(user.user_id, 'test-user');
});
