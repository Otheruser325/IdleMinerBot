import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataManager } from '../dataManager.js';
import { createComponentToken, isComponentOwner } from '../utils/interactionSessions.js';
import getMineFactor from '../utils/getMineFactor.js';

const userId = '12345678901234567';

function createMockDatabase(initial = {}) {
    const tables = new Map(Object.entries(initial).map(([table, rows]) => [
        table,
        new Map(Object.entries(rows).map(([id, row]) => [id, structuredClone(row)]))
    ]));
    const stats = { selects: 0, ranges: [], inserts: 0 };

    function tableRows(name) {
        if (!tables.has(name)) tables.set(name, new Map());
        return tables.get(name);
    }

    function query(table, operation = 'select', payload = null) {
        const state = { filters: [], selected: false, head: false, limit: null, single: false, range: null };
        const builder = {
            select(columns = '*', options = {}) { state.selected = true; state.head = Boolean(options.head); return builder; },
            eq(column, value) { state.filters.push([column, value]); return builder; },
            limit(value) { state.limit = value; return builder; },
            range(from, to) { state.range = [from, to]; stats.ranges.push([from, to]); return builder; },
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
                        stats.inserts += 1;
                        const values = Array.isArray(payload) ? payload : [payload];
                        if (globalThis.__insertErrorOnce) {
                            const code = globalThis.__insertErrorOnce;
                            globalThis.__insertErrorOnce = null;
                            return resolve({ data: null, error: { code, message: 'forced' } });
                        }
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
                            ? (matches.length === 1
                                ? structuredClone(rows.get(matches[0][0]))
                                : (matches.length === 0 ? null : matches.map(([id]) => structuredClone(rows.get(id)))))
                            : null;
                    } else if (operation === 'delete') {
                        for (const [id] of matches) rows.delete(id);
                    } else {
                        stats.selects += 1;
                        const all = matches.map(([, row]) => structuredClone(row));
                        const ranged = state.range ? all.slice(state.range[0], state.range[1] + 1) : all;
                        const selected = state.limit === 1 || state.single ? ranged.slice(0, 1) : ranged;
                        data = state.head ? null : selected;
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
        stats,
        async get(table, id) { return structuredClone(tableRows(table).get(id)); }
    };
}

test('H3: a partial update never wipes unrelated fields', async () => {
    const db = createMockDatabase({
        users: { [userId]: { id: userId, version: 1, data: { user_id: userId, cash: 5, super_cash: 7, current_mine: 'Coal Mine' } } }
    });
    const manager = createDataManager(db.provider);
    await manager.updateUser(userId, { cash: 100 });

    const row = await db.get('users', userId);
    assert.equal(row.data.cash, 100);
    assert.equal(row.data.super_cash, 7);
    assert.equal(row.data.current_mine, 'Coal Mine');
});

test('H3: snapshot updates still merge only changed fields', async () => {
    const db = createMockDatabase({
        users: { [userId]: { id: userId, version: 1, data: { user_id: userId, cash: 5, super_cash: 7 } } }
    });
    const manager = createDataManager(db.provider);
    const user = await manager.getUser(userId);
    user.cash = 42;
    await manager.updateUser(userId, user);

    const row = await db.get('users', userId);
    assert.equal(row.data.cash, 42);
    assert.equal(row.data.super_cash, 7);
});

test('M2: insert retries on the exclusion-violation code and fails on others', async () => {
    const db = createMockDatabase({ users: {} });
    const manager = createDataManager(db.provider, { allowSyntheticUserIds: true });

    globalThis.__insertErrorOnce = '23P01';
    const recovered = await manager.updateUserTransaction('synthetic-user-1', current => current || { user_id: 'synthetic-user-1', cash: 1 });
    assert.equal(recovered.committed, true);
    assert.equal(db.stats.inserts, 2);

    globalThis.__insertErrorOnce = '23514';
    await assert.rejects(
        () => manager.updateUserTransaction('synthetic-user-2', current => current || { user_id: 'synthetic-user-2', cash: 1 })
    );
});

test('M3: getAllUsers pages the table instead of one full read', async () => {
    const rows = {};
    for (let index = 0; index < 7; index += 1) {
        const id = `1234567890123456${index}`;
        rows[id] = { id, version: 1, data: { user_id: id, cash: index } };
    }
    const db = createMockDatabase({ users: rows });
    const manager = createDataManager(db.provider);

    const users = await manager.getAllUsers();
    assert.equal(Object.keys(users).length, 7);
    assert.ok(db.stats.ranges.length >= 1);
});

test('M4: mine factor follows the mine prestige count', async () => {
    const base = getMineFactor({ mine_number: 1, prestige_count: 0 });
    const prestiged = getMineFactor({ mine_number: 1, prestige_count: 1 });
    assert.equal(Number.isFinite(base), true);
    assert.notEqual(prestiged, base);
});

test('L2: component tokens are opaque and ownership is explicit', () => {
    const token = createComponentToken();
    assert.equal(token.includes(userId), false);
    assert.match(token, /^[0-9a-f]{16}$/);
    assert.notEqual(createComponentToken(), createComponentToken());
    assert.equal(isComponentOwner({ user: { id: userId } }, userId), true);
    assert.equal(isComponentOwner({ user: { id: '999' } }, userId), false);
});

test('L3: markUserActive throttles repeat touches to a single write', async () => {
    const db = createMockDatabase({
        users: { [userId]: { id: userId, version: 1, data: { user_id: userId, last_idle: 1 } } }
    });
    const manager = createDataManager(db.provider);
    const readsBefore = db.stats.selects;

    const first = await manager.markUserActive(userId, { intervalMs: 60_000 });
    const second = await manager.markUserActive(userId, { intervalMs: 60_000 });
    assert.equal(first, true);
    assert.equal(second, false);

    const row = await db.get('users', userId);
    assert.ok(Number(row.data.last_idle) > 1);
    assert.equal(db.stats.selects - readsBefore, 1);
});
