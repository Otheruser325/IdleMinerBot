import test from 'node:test';
import assert from 'node:assert/strict';
import prefixHello from '../commands/prefix/hello.js';
import slashHello from '../commands/slash/hello.js';
import { createMessageAdapter, executeSharedCommand } from '../utils/commandBridge.js';
import help, { collectCommands, pagePayload } from '../commands/shared/help.js';
import { getStandaloneHandler, registerInteraction } from '../utils/interactionDispatcher.js';

function createInteraction() {
    const calls = [];
    return {
        id: 'interaction-1',
        user: { id: '12345678901234567', username: 'Miner' },
        channelId: 'channel-1',
        guildId: 'guild-1',
        commandName: 'hello',
        guild: { id: 'guild-1' },
        deferred: false,
        replied: false,
        async deferReply() {
            calls.push(['deferReply']);
            this.deferred = true;
        },
        async editReply(payload) {
            calls.push(['editReply', payload]);
            this.replied = true;
            return { payload };
        },
        async reply(payload) {
            calls.push(['reply', payload]);
            this.replied = true;
            return { payload };
        },
        async followUp(payload) {
            calls.push(['followUp', payload]);
            return { payload };
        },
        calls
    };
}

test('help exposes shared command guidance and prefix/slash usage', () => {
    const collection = new Map([
        ['work', { name: 'work', description: 'Operate the mine.', usage: '<area> [tier]' }],
        ['help', help]
    ]);
    const context = { client: { commands: collection } };
    const commands = collectCommands(context);
    const work = commands.find(command => command.name === 'work');
    assert.match(work.usage, /im!work <area> \[tier\].*\/work <area> \[tier\]/);
    assert.match(work.guidance, /shaft.*elevator.*warehouse/i);
    const payload = pagePayload(commands, 1, 1, 'help:test');
    assert.equal(payload.components.length, 1);
    assert.match(payload.embeds[0].data.footer.text, /60 seconds/i);
    assert.equal(payload.embeds[0].data.fields.some(field => /Advice:/i.test(field.value)), false);
});

test('interaction handlers route exact and pattern custom IDs while excluding collector-owned handlers', () => {
    const registry = new Map();
    const exact = { customId: 'test', execute() {} };
    const collectorOwned = { customId: 'owned', collectorOwned: true, execute() {} };
    const patterned = { customId: /^menu:/, execute() {} };
    assert.equal(registerInteraction(registry, exact), true);
    assert.equal(registerInteraction(registry, collectorOwned), true);
    assert.equal(registerInteraction(registry, patterned), true);
    assert.equal(getStandaloneHandler(registry, 'test'), exact);
    assert.equal(getStandaloneHandler(registry, 'owned'), null);
    assert.equal(getStandaloneHandler(registry, 'menu:next'), patterned);
});

test('prefix and slash adapters expose the same shared hello behavior', async () => {
    const prefixReplies = [];
    await prefixHello.execute({ author: { id: '1' }, reply: value => prefixReplies.push(value) });
    assert.deepEqual(prefixReplies, ['Hello!']);

    assert.equal(slashHello.data.toJSON().name, 'hello');
    const interaction = createInteraction();
    await slashHello.execute(interaction);
    assert.equal(interaction.calls.filter(([name]) => name === 'deferReply').length, 1);
    assert.equal(interaction.calls.at(-1)[0], 'editReply');
    assert.equal(interaction.calls.at(-1)[1].content, 'Hello!');
});

test('shared command bridge acknowledges once and adapts channel sends to the interaction response', async () => {
    const interaction = createInteraction();
    const command = {
        async execute(message, args) {
            assert.equal(message.author.id, interaction.user.id);
            assert.deepEqual(args, ['one', '2']);
            await message.reply('first');
            return message.channel.send('second');
        }
    };

    await executeSharedCommand(interaction, command, ['one', 2, null]);
    assert.equal(interaction.calls.filter(([name]) => name === 'deferReply').length, 1);
    assert.equal(interaction.calls.filter(([name]) => name === 'editReply').length, 1);
    assert.equal(interaction.calls.filter(([name]) => name === 'followUp').length, 1);
});

test('message adapter provides a stable interaction-shaped channel contract', async () => {
    const interaction = createInteraction();
    const message = createMessageAdapter(interaction);
    assert.equal(message.author, interaction.user);
    assert.equal(message.channel.id, interaction.channelId);
    assert.equal(message.guildId, interaction.guildId);
    assert.equal(message.channel.isDMBased(), false);

    await message.edit('progress update');
    assert.equal(interaction.calls.at(-1)[0], 'editReply');
    assert.equal(interaction.calls.at(-1)[1].content, 'progress update');
});
