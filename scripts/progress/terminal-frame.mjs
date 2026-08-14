const ESC = '\x1b[';
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function isInteractiveTerminal() {
  return Boolean(process.stdout.isTTY && !process.env.CI);
}

export function stripAnsi(text) {
  return typeof text === 'string' ? text.replace(ANSI_REGEX, '') : '';
}

export function truncateToColumns(line, columns = (process.stdout?.columns || 80)) {
  if (!line || typeof line !== 'string') return '';
  const visible = stripAnsi(line);
  if (visible.length <= columns) return line;
  const maxLen = Math.max(10, columns - 1);
  let visibleCount = 0;
  let result = '';
  let inEscape = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '\x1b') {
      inEscape = true;
      result += line[i];
    } else if (inEscape) {
      result += line[i];
      if (line[i] === 'm') inEscape = false;
    } else {
      if (visibleCount >= maxLen) {
        result += '…\x1b[0m';
        break;
      }
      result += line[i];
      visibleCount += 1;
    }
  }
  return result;
}

export function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${String(remainingMinutes).padStart(2, '0')}m`;
}

export function shortPath(filePath, parts = 2) {
  if (!filePath) return 'unknown';
  const normalized = String(filePath).replaceAll('\\', '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.slice(-parts).join('/');
}

export class TerminalFrame {
  #interactive;
  #renderedLines = 0;
  #cursorHidden = false;
  #lastFrame = '';

  constructor({ interactive = isInteractiveTerminal() } = {}) {
    this.#interactive = interactive;
    if (this.#interactive) {
      TerminalFrame.#ensureExitHook();
    }
  }

  static #exitHookRegistered = false;
  static #ensureExitHook() {
    if (TerminalFrame.#exitHookRegistered) return;
    TerminalFrame.#exitHookRegistered = true;
    process.once('exit', () => {
      if (process.stdout?.isTTY) {
        process.stdout.write('\x1b[?25h');
      }
    });
  }

  get interactive() {
    return this.#interactive;
  }

  render(lines) {
    if (!this.#interactive) {
      return '';
    }

    const columns = process.stdout?.columns || 80;
    const nextLines = lines.map((line) => truncateToColumns(line, columns));
    const frameKey = nextLines.join('\n');
    if (frameKey === this.#lastFrame && this.#renderedLines === nextLines.length) {
      return '';
    }
    this.#lastFrame = frameKey;

    const prevCount = this.#renderedLines;
    const lineCount = Math.max(prevCount, nextLines.length);

    let output = '';

    if (!this.#cursorHidden) {
      output += '\x1b[?25l';
      this.#cursorHidden = true;
    }

    if (prevCount > 0) {
      output += `${ESC}${prevCount}A`;
    }

    for (let index = 0; index < lineCount; index += 1) {
      output += '\r\x1b[2K';
      output += nextLines[index] ?? '';
      output += '\n';
    }

    if (lineCount > nextLines.length) {
      const diff = lineCount - nextLines.length;
      output += `${ESC}${diff}A\r`;
    }

    this.#renderedLines = nextLines.length;
    return output;
  }

  clear() {
    if (!this.#interactive) {
      return '';
    }

    let output = '';
    if (this.#cursorHidden) {
      output += '\x1b[?25h';
      this.#cursorHidden = false;
    }

    if (this.#renderedLines > 0) {
      output += `${ESC}${this.#renderedLines}A\x1b[0J\r`;
      this.#renderedLines = 0;
    }
    this.#lastFrame = '';
    return output;
  }

  reset() {
    this.#renderedLines = 0;
    this.#lastFrame = '';
  }
}
