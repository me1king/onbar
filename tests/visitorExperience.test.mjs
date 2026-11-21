import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseVisitorExperience } from '../lib/visitorExperience.ts';

test('prioritizes Game Night for weekend evening visits', () => {
    const result = chooseVisitorExperience({
        source: 'direct',
        time: 'evening',
        day: 'weekend',
        returning: false
    });

    assert.equal(result.id, 'game-night');
    assert.match(result.reason, /weekend/i);
});

test('uses campaign intent when it is a stronger signal than a default visit', () => {
    const result = chooseVisitorExperience({
        source: 'snacks',
        time: 'morning',
        day: 'weekday',
        returning: false
    });

    assert.equal(result.id, 'snacks');
});

test('falls back to the full menu when signals are weak', () => {
    const result = chooseVisitorExperience({
        source: 'direct',
        time: 'morning',
        day: 'weekday',
        returning: false
    });

    assert.equal(result.id, 'home');
});
