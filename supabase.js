'use strict';

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

let client = null;

/**
 * Create the Supabase client only when it is first used.  Keeping the client
 * lazy lets command modules and unit tests be imported without a configured
 * production database.
 */
export function getSupabaseClient() {
    if (client) return client;

    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!url || !key) {
        throw new Error(
            'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
            'in your .env file. The anon key is intentionally not accepted: this process ' +
            'owns the players table and must connect with the service-role key so the ' +
            'row-level-security policies in tools/supabase-init.sql are never bypassed ' +
            'by a weaker credential.'
        );
    }

    client = createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });

    return client;
}

export default { getSupabaseClient };
