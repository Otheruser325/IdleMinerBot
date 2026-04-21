import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL in environment');
}

if (!supabaseKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_ANON_KEY in environment');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;