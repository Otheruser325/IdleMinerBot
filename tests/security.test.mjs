import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMetadata, classifyDiscordError, safeEditMessage, wrapAsync } from '../utils/errorHandling.js';
import { persistenceUnavailable } from '../utils/interactionSessions.js';
import { normalizeMineData } from '../utils/continentLooker.js';
import { scheduleAutomatedTasks, resetAutomatedTasksForTests } from '../utils/automatedTasks.js';

test('sanitizes secrets and non-serializable objects from error metadata', () => {
    const details = sanitizeMetadata({
        userId: '123',
        authorization: 'Bearer secret',
        stripeSignature: 'sig_secret',
        promise: Promise.resolve(),
        safe: 'value'
    });

    assert.deepEqual(details, {
        userId: '123',
        promise: '[Promise]',
        safe: 'value'
    });
});

test('classifies Discord edge errors without treating them as fatal application failures', () => {
    assert.equal(classifyDiscordError({ code: 10062, message: 'Unknown interaction' }), 'Unknown Interaction');
    assert.equal(classifyDiscordError({ code: 50013 }), 'Missing Permissions');
});

test('wrapAsync catches synchronous and asynchronous callback failures', async () => {
    const failures = [];
    const wrapped = wrapAsync(() => Promise.reject({ code: 10062, message: 'Unknown interaction' }), 'test.wrap', error => {
        failures.push(error.message);
    });

    await wrapped();
    assert.deepEqual(failures, ['Unknown interaction']);
});

test('safe message edits swallow Discord edge failures so work commits are not interrupted', async () => {
    const result = await safeEditMessage({
        id: 'message-1',
        edit: async () => { throw { code: 10008, message: 'Unknown Message' }; }
    }, { content: 'progress' });
    assert.equal(result, null);
});

test('interaction cleanup treats database timeouts as temporary persistence outages', () => {
    assert.equal(persistenceUnavailable(new Error('Database read timed out for interaction sessions.')), true);
    assert.equal(persistenceUnavailable({ code: 'PGRST205' }), true);
});

test('malformed mine documents repair to a safe Coal Mine baseline', () => {
    assert.deepEqual(normalizeMineData(null), {
        mine_number: 1,
        mine_name: 'Coal Mine',
        continent_name: 'Start Continent'
    });
    assert.equal(normalizeMineData({ mine_number: 'bad' }).mine_number, 1);
});

test('scheduler rejects invalid cron definitions without leaving partial jobs running', () => {
    resetAutomatedTasksForTests();
    assert.throws(() => scheduleAutomatedTasks([
        ['* * * * *', () => undefined, 'valid-task'],
        ['not-a-cron-expression', () => undefined, 'invalid-task']
    ]), /Invalid cron expression/);
    resetAutomatedTasksForTests();
});
