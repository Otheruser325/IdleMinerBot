import test from 'node:test';
import assert from 'node:assert/strict';
import info, { patchNotes, resolvePage } from '../commands/shared/info.js';

const userId = '12345678901234567';

function createMessageContext() {
    const calls = [];
    return {
        author: { id: userId, username: 'Miner', displayAvatarURL: () => 'https://example.com/avatar.png' },
        commandPrefix: 'im!',
        async reply(payload) {
            calls.push(payload);
            return payload;
        },
        calls
    };
}

test('info patch notes are versioned newest first', () => {
    assert.equal(patchNotes.length, 6);
    assert.deepEqual(
        patchNotes.map(note => note.version),
        ['1.2.2', '1.2.1', '1.2.0', '1.1.1', '1.1.0', '1.0.0']
    );
    for (const note of patchNotes) {
        assert.equal(Number.isFinite(new Date(note.date).getTime()), true, `invalid date for ${note.version}`);
        assert.equal(typeof note.features, 'string');
        assert.ok(note.features.length > 0);
    }
});

test('info page resolution defaults invalid input to the latest page', () => {
    assert.equal(resolvePage(undefined), 1);
    assert.equal(resolvePage('abc'), 1);
    assert.equal(resolvePage(0), 1);
    assert.equal(resolvePage(-3), 1);
    assert.equal(resolvePage(999), 1);
    assert.equal(resolvePage(2), 2);
    assert.equal(resolvePage('3'), 3);
});

test('info renders the latest patch note as an embed', async () => {
    const context = createMessageContext();
    await info.handleInfoCommand(context, {});

    const payload = context.calls[0];
    assert.equal(Array.isArray(payload.embeds), true);
    const embed = payload.embeds[0].data;
    assert.equal(embed.title, 'Idle Miner Bot Information');
    const field = name => embed.fields.find(entry => entry.name === name)?.value;
    assert.equal(field('Version'), '1.2.2');
    assert.match(field('Open Source'), /github\.com\/Otheruser325\/IdleMinerBot/);
    assert.equal(embed.footer.text, 'Page 1 of 6 | Thank you for using our bot!');
});

test('info supports navigating to older pages', async () => {
    const context = createMessageContext();
    await info.handleInfoCommand(context, { page: 2 });
    const embed = context.calls[0].embeds[0].data;
    assert.equal(embed.fields.find(entry => entry.name === 'Version').value, '1.2.1');
    assert.equal(embed.footer.text, 'Page 2 of 6 | Thank you for using our bot!');
});
