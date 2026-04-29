export const DEFAULT_USER_PREFERENCES = {
    number_format: 'illion',
    idle_cash_alerts: true,
    daily_monthly_sc_alerts: true,
    barrier_alerts: true,
    bottleneck_alerts: true,
    idle_time_minutes: 10
};

const NUMBER_FORMATS = new Set(['illion', 'alphabetical', 'scientific', 'engineering']);

export function normalizeUserPreferences(rawPreferences, isPremium = false) {
    const source = rawPreferences && typeof rawPreferences === 'object' ? rawPreferences : {};
    const idleTime = Number(source.idle_time_minutes);

    const normalized = {
        ...DEFAULT_USER_PREFERENCES,
        ...source,
        number_format: NUMBER_FORMATS.has(String(source.number_format || '').toLowerCase())
            ? String(source.number_format).toLowerCase()
            : DEFAULT_USER_PREFERENCES.number_format,
        idle_cash_alerts: source.idle_cash_alerts !== false,
        daily_monthly_sc_alerts: source.daily_monthly_sc_alerts !== false,
        barrier_alerts: source.barrier_alerts !== false,
        bottleneck_alerts: source.bottleneck_alerts !== false,
        idle_time_minutes: Number.isFinite(idleTime) ? Math.floor(idleTime) : DEFAULT_USER_PREFERENCES.idle_time_minutes
    };

    normalized.idle_time_minutes = Math.max(1, Math.min(60, normalized.idle_time_minutes));
    if (!isPremium) {
        normalized.idle_time_minutes = DEFAULT_USER_PREFERENCES.idle_time_minutes;
    }

    return normalized;
}

export function isValidNumberFormat(value) {
    return NUMBER_FORMATS.has(String(value || '').toLowerCase());
}
