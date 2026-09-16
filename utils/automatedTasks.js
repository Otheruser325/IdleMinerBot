'use strict';

import cron from 'node-cron';
import { wrapAsync, logError } from './errorHandling.js';
import { cleanupComponentMessages } from './interactionSessions.js';

let schedulesInitialized = false;
let scheduledJobs = [];
const runningTasks = new Set();
const TASK_TIMEOUT_MS = 5 * 60 * 1000;

function validateTask(task) {
    return Array.isArray(task)
        && typeof task[0] === 'string'
        && typeof task[1] === 'function';
}

function createScheduledTask(task, label) {
    return wrapAsync(async (...args) => {
        if (runningTasks.has(label)) return;
        runningTasks.add(label);
        let timeout;
        try {
            const taskPromise = Promise.resolve().then(() => task(...args));
            timeout = setTimeout(() => {
                logError(`${label}.timeout`, new Error(`Scheduled task exceeded ${TASK_TIMEOUT_MS}ms; it remains serialized until completion.`));
            }, TASK_TIMEOUT_MS);
            timeout.unref?.();
            // Do not release the guard when the warning timer fires: the task
            // cannot be cancelled, and releasing it would permit overlapping
            // database mutations.
            await taskPromise;
        } finally {
            clearTimeout(timeout);
            runningTasks.delete(label);
        }
    }, label);
}

function normalizeSchedulerOptions(options) {
    if (Array.isArray(options)) return options;

    const {
        client,
        updateStatus,
        missingData,
        barrierUnlocks,
        boostTimers,
        managerWork,
        duplicateManagerPurge,
        dailyProperties
    } = options || {};

    if (typeof missingData !== 'function' || typeof dailyProperties !== 'function') {
        throw new TypeError('Automated task callbacks are required.');
    }

    return [
        ['*/5 * * * *', () => updateStatus?.(client), 'cron.updateBotStatus'],
        ['0 * * * *', missingData, 'cron.handleMissingData'],
        ['*/10 * * * * *', barrierUnlocks, 'cron.handleBarrierUnlockTime'],
        ['*/30 * * * * *', boostTimers, 'cron.handleBoostTimers'],
        ['* * * * *', managerWork, 'cron.handleManagerWork'],
        ['*/5 * * * *', duplicateManagerPurge, 'cron.handleDuplicateManagerPurge'],
        // Session cleanup is a full-table operation; keep it out of the hot
        // cron path so a slow Supabase request cannot repeatedly pile up.
        ['*/15 * * * *', () => cleanupComponentMessages(client), 'cron.cleanupInteractionSessions'],
        ['0 0 * * *', dailyProperties, 'cron.dailyProperties']
    ].filter(([, task]) => typeof task === 'function');
}

function normalizeStartupTask(task) {
    if (Array.isArray(task)) return task;
    if (typeof task === 'function') return [task.name || 'startup-task', task];
    return null;
}

export function scheduleAutomatedTasks(options = []) {
    if (schedulesInitialized) return scheduledJobs;

    const tasks = normalizeSchedulerOptions(options);
    if (!tasks.every(validateTask)) {
        throw new TypeError('Each automated task requires a cron expression and callback.');
    }

    const jobs = [];
    try {
        for (const [index, [expression, task, label]] of tasks.entries()) {
            if (typeof cron.validate === 'function' && !cron.validate(expression)) {
                throw new TypeError(`Invalid cron expression for task ${label || index}: ${expression}`);
            }
            jobs.push(cron.schedule(
                expression,
                createScheduledTask(task, label || `cron.${expression}.${index}`),
                { scheduled: true }
            ));
        }
    } catch (error) {
        for (const job of jobs) {
            try {
                job.stop?.();
                job.destroy?.();
            } catch (cleanupError) {
                logError('automatedTasks.scheduleCleanup', cleanupError);
            }
        }
        throw error;
    }

    scheduledJobs = jobs;
    schedulesInitialized = true;
    return scheduledJobs;
}

/**
 * Run startup work in the background. The object form is used by Idle Miner;
 * passing a client directly remains compatible with VivacityAPI-style callers.
 */
export function runStartupTasks(options = {}) {
    const isOptionsObject = Boolean(options && typeof options === 'object' && (
        Object.prototype.hasOwnProperty.call(options, 'client')
        || Object.prototype.hasOwnProperty.call(options, 'startupTasks')
    ));
    const client = isOptionsObject ? options.client : options;
    const startupTasks = isOptionsObject && Array.isArray(options.startupTasks)
        ? options.startupTasks
        : [
            ['cleanupInteractionSessions', () => cleanupComponentMessages(client, { closeAll: true })]
        ];

    for (const entry of startupTasks) {
        const normalized = normalizeStartupTask(entry);
        if (!normalized) continue;
        const [label, task] = normalized;
        if (typeof task !== 'function') continue;
        Promise.resolve()
            .then(() => task(client))
            .catch(error => logError(`startup.${label}`, error));
    }
}

export function stopAutomatedTasks() {
    for (const job of scheduledJobs) {
        try {
            job.stop?.();
            job.destroy?.();
        } catch (error) {
            logError('automatedTasks.stop', error);
        }
    }
    scheduledJobs = [];
    schedulesInitialized = false;
}

export function resetAutomatedTasksForTests() {
    stopAutomatedTasks();
}

export default {
    scheduleAutomatedTasks,
    runStartupTasks,
    stopAutomatedTasks,
    resetAutomatedTasksForTests
};
