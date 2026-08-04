import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchOperators } from './search-query-planning.js';

test('quoted must: value stays one literal token after unquoting', () => {
    const parsed = parseSearchOperators('must:"replace(tzinfo=None)" where is naive utc handling');
    assert.deepEqual(parsed.must, ['replace(tzinfo=None)']);
    assert.deepEqual(parsed.semanticQuery, 'where is naive utc handling');
});

test('quoted must: value with escaped quotes is unquoted without splitting', () => {
    const parsed = parseSearchOperators('must:"a \\"quoted\\" phrase" other');
    assert.deepEqual(parsed.must, ['a "quoted" phrase']);
});

test('multiple must: values remain separate tokens', () => {
    const parsed = parseSearchOperators('must:tzinfo must:None check');
    assert.deepEqual(parsed.must, ['tzinfo', 'None']);
});

test('wildcard-looking quoted must: values are treated literally, not as globs', () => {
    const parsed = parseSearchOperators('must:"replace(*, None)" caller');
    assert.deepEqual(parsed.must, ['replace(*, None)']);
    assert.equal(parsed.must[0].includes('*'), true);
    assert.equal(parsed.must[0].includes('('), true);
});

test('unquoted must: value with punctuation stays a single token', () => {
    const parsed = parseSearchOperators('must:replace(tzinfo=None)');
    assert.deepEqual(parsed.must, ['replace(tzinfo=None)']);
});
