import { pathToFileURL } from 'node:url';

const mocks = new Map([
    ['@supabase/supabase-js', `export function createClient() { throw new Error('Supabase client should not be constructed in unit tests.'); }`],
    ['dotenv', `export default { config() {} }; export function config() {}`],
    ['discord.js', `class Builder { constructor() { this.data = {}; } setName(name) { this.data.name = name; return this; } setDescription(description) { this.data.description = description; return this; } setColor(value) { this.data.color = value; return this; } setTitle(value) { this.data.title = value; return this; } setFooter(value) { this.data.footer = value; return this; } setTimestamp() { return this; } setLabel(value) { this.data.label = value; return this; } setCustomId(value) { this.data.customId = value; return this; } setStyle(value) { this.data.style = value; return this; } setDisabled(value) { this.data.disabled = value; return this; } addFields(...fields) { this.data.fields = fields.flat(); return this; } addComponents(...components) { this.data.components = components.flat(); return this; } addIntegerOption(callback) { callback?.(new Builder()); return this; } addStringOption(callback) { callback?.(new Builder()); return this; } addUserOption(callback) { callback?.(new Builder()); return this; } addSubcommand(callback) { callback?.(new Builder()); return this; } toJSON() { return this.data; } } export class SlashCommandBuilder extends Builder {} export class EmbedBuilder extends Builder {} export class ActionRowBuilder extends Builder {} export class ButtonBuilder extends Builder {} export const ButtonStyle = { Primary: 1, Secondary: 2, Success: 3 };`]
]);

export async function resolve(specifier, context, nextResolve) {
    if (mocks.has(specifier)) {
        return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
    if (url.startsWith('data:text/javascript,')) {
        return { format: 'module', source: decodeURIComponent(url.slice('data:text/javascript,'.length)), shortCircuit: true };
    }
    return nextLoad(url, context);
}
