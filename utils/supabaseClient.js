'use strict';

import { getSupabaseClient } from '../supabase.js';

// Backwards-compatible facade for modules that still import `supabase`.
// The actual client is created lazily by supabase.js.
const supabase = new Proxy({}, {
    get(_target, property) {
        const client = getSupabaseClient();
        const value = client[property];
        return typeof value === 'function' ? value.bind(client) : value;
    }
});

export { getSupabaseClient };
export default supabase;
