import test from 'node:test';
import assert from 'node:assert/strict';
import { parseToneFrequencies, DEFAULT_ORDER_ALERT_TONES } from '../lib/orderAlertTones.ts';

test('parses a short custom alert melody and rounds frequencies', () => {
    assert.deepEqual(parseToneFrequencies('660, 880.4, 1046'), [660, 880, 1046]);
});

test('rejects invalid custom melodies and offers distinct built-in tone choices', () => {
    assert.equal(parseToneFrequencies(''), null);
    assert.equal(parseToneFrequencies('200, 600'), null);
    assert.equal(parseToneFrequencies('600, 1900'), null);
    assert.equal(parseToneFrequencies('600'), null);
    assert.equal(parseToneFrequencies('600, , 900'), null);
    assert.ok(DEFAULT_ORDER_ALERT_TONES.length >= 4);
    assert.equal(new Set(DEFAULT_ORDER_ALERT_TONES.map(tone => tone.id)).size, DEFAULT_ORDER_ALERT_TONES.length);
});
