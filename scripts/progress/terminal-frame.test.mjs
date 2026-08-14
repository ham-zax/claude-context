import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TerminalFrame,
  formatDuration,
  shortPath,
  stripAnsi,
  truncateToColumns,
  isInteractiveTerminal,
} from './terminal-frame.mjs';

test('formatDuration formats seconds, minutes, and hours accurately', () => {
  assert.equal(formatDuration(0), '0s');
  assert.equal(formatDuration(45_000), '45s');
  assert.equal(formatDuration(60_000), '1m 00s');
  assert.equal(formatDuration(125_000), '2m 05s');
  assert.equal(formatDuration(3660_000), '1h 01m');
});

test('shortPath normalizes slashes and takes the trailing segments', () => {
  assert.equal(shortPath(''), 'unknown');
  assert.equal(shortPath('foo/bar/baz.ts', 2), 'bar/baz.ts');
  assert.equal(shortPath('C:\\repo\\satori\\packages\\core\\src\\index.ts', 2), 'src/index.ts');
  assert.equal(shortPath('/home/hamza/repo/satori/src/test.ts', 3), 'satori/src/test.ts');
});

test('stripAnsi removes ANSI escape sequences', () => {
  assert.equal(stripAnsi('\x1b[36m◆\x1b[0m \x1b[1mCore tests\x1b[0m'), '◆ Core tests');
});

test('truncateToColumns clamps long lines to terminal width', () => {
  const longLine = 'very-long-path-that-exceeds-terminal-width/and/subdirectories/file.test.ts';
  const truncated = truncateToColumns(longLine, 30);
  assert.ok(stripAnsi(truncated).length <= 30);
  assert.ok(truncated.includes('…'));
});

test('TerminalFrame non-interactive emits nothing', () => {
  const frame = new TerminalFrame({ interactive: false });
  assert.equal(frame.interactive, false);
  assert.equal(frame.render(['line 1', 'line 2']), '');
  assert.equal(frame.clear(), '');
});

test('TerminalFrame interactive renders first frame, hides cursor, and moves cursor on redraw', () => {
  const frame = new TerminalFrame({ interactive: true });
  assert.equal(frame.interactive, true);

  const first = frame.render(['line A', 'line B']);
  assert.equal(first, '\x1b[?25l\r\x1b[2Kline A\n\r\x1b[2Kline B\n');

  // Identical frame renders nothing (diffing optimization)
  assert.equal(frame.render(['line A', 'line B']), '');

  const second = frame.render(['line A modified', 'line B modified']);
  assert.equal(second, '\x1b[2A\r\x1b[2Kline A modified\n\r\x1b[2Kline B modified\n');

  const cleared = frame.clear();
  assert.equal(cleared, '\x1b[?25h\x1b[2A\x1b[0J\r');
  assert.equal(frame.clear(), '');
});
