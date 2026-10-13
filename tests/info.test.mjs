'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';

import info from '../commands/shared/info.js';

const { patchNotes, formattedFeatures, chunkLines, buildEmbed } = info;

test('every patch note renders without exceeding Discord field limits', () => {
    for (const note of patchNotes) {
        const embed = buildEmbed(note, 0).toJSON();
        for (const field of embed.fields || []) {
            assert.ok(field.value.length <= 1024, `${note.version} field "${field.name}" is ${field.value.length} chars (max 1024)`);
        }
        assert.ok(embed.fields.length <= 25, `${note.version} produces ${embed.fields.length} fields (max 25)`);
    }
});

test('patch notes are ordered newest first from v1.2.2 down to v1.0.0', () => {
    assert.deepEqual(
        patchNotes.map(note => note.version),
        ['1.2.2', '1.2.1', '1.2.0', '1.1.1', '1.1.0', '1.0.0']
    );
    for (const note of patchNotes) {
        assert.equal(Number.isFinite(new Date(note.date).getTime()), true, `invalid date for ${note.version}`);
        assert.ok(note.changes.length > 0, `${note.version} has no changes`);
    }
});

test('a long note is paginated across multiple feature fields', () => {
    const note = patchNotes.find(entry => entry.version === '1.2.2');
    assert.ok(note, 'the 1.2.2 note is present');
    const fake = { version: 'x', date: '2026-01-01', changes: Array.from({ length: 40 }, () => 'x'.repeat(60)) };
    assert.ok(formattedFeatures(fake).length > 1024, 'the raw text exceeds one field');
    const embed = buildEmbed(fake, 0).toJSON();
    const featureFields = embed.fields.filter(field => field.name.startsWith("What's Changed"));
    assert.ok(featureFields.length > 1, 'it is split into more than one feature field');
});

test('chunkLines never splits a line and respects the limit', () => {
    const chunks = chunkLines(['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(1500)], 100);
    for (const chunk of chunks) assert.ok(chunk.length <= 100, `chunk is ${chunk.length} chars`);
    const long = chunks[chunks.length - 1];
    assert.equal(long.length, 100, 'an over-long line is hard-truncated to the limit');
});

test('chunkLines returns a single empty chunk for no lines', () => {
    assert.deepEqual(chunkLines([]), ['']);
});

test('buildEmbed includes version, date, developer and language fields', () => {
    const embed = buildEmbed(patchNotes[0], 0).toJSON();
    const names = embed.fields.map(field => field.name);
    assert.ok(names.includes('Version'));
    assert.ok(names.includes('Date'));
    assert.ok(names.includes('Developer'));
    assert.ok(names.includes('Programming Language'));
    assert.equal(embed.fields.find(field => field.name === 'Version').value, '1.2.2');
    assert.match(embed.footer.text, /Patch 1 of 6 \| Thank you for using our bot!/);
});

test('buildEmbed footers track the selected page', () => {
    const embed = buildEmbed(patchNotes[1], 1).toJSON();
    assert.equal(embed.fields.find(field => field.name === 'Version').value, '1.2.1');
    assert.match(embed.footer.text, /Patch 2 of 6/);
});
