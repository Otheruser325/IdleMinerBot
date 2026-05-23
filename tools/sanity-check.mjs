import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

async function validateCommands(dir, validator) {
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.js'));
  const failures = [];

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const mod = await import(pathToFileURL(fullPath).href);
    const command = mod?.default || mod;
    const validationError = validator(command);
    if (validationError) {
      failures.push(`${file}: ${validationError}`);
    }
  }

  return failures;
}

const prefixFailures = await validateCommands(
  path.resolve('commands/prefix'),
  (command) => {
    if (!command?.name) return 'missing `name`.';
    if (typeof command.execute !== 'function') return 'missing `execute(message, args)` function.';
    return null;
  }
);

const slashFailures = await validateCommands(
  path.resolve('commands/slash'),
  (command) => {
    if (!command?.data?.name) return 'missing `data.name`.';
    if (typeof command.execute !== 'function') return 'missing `execute(interaction)` function.';
    return null;
  }
);

const failures = [...prefixFailures.map(v => `prefix/${v}`), ...slashFailures.map(v => `slash/${v}`)];

if (failures.length > 0) {
  console.error('Sanity check failed:');
  for (const failure of failures) {
    console.error(` - ${failure}`);
  }
  process.exit(1);
}

console.log(`Sanity checks passed (${prefixFailures.length + slashFailures.length === 0 ? 'all command modules valid' : 'no failures'}).`);
