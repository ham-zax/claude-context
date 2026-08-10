import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeTerminalText } from "./terminal-sanitize.js";

const cases = [
    {
        name: "CSI sequences",
        input: "before\u001b[31mred\u001b[0mafter",
        expected: "beforeredafter",
    },
    {
        name: "OSC sequences terminated by BEL",
        input: "before\u001b]0;/home/private/model\u0007after",
        expected: "beforeafter",
    },
    {
        name: "OSC sequences terminated by ESC backslash",
        input: "before\u001b]0;/home/private/model\u001b\\after",
        expected: "beforeafter",
    },
    {
        name: "bare ESC controls",
        input: "before\u001bafter",
        expected: "beforeafter",
    },
    {
        name: "newlines and tabs",
        input: "before\nmiddle\tafter",
        expected: "before middle after",
    },
    {
        name: "C1 controls",
        input: "before\u0085after",
        expected: "before after",
    },
    {
        name: "unterminated OSC sequences",
        input: "before\u001b]0;/home/private/model",
        expected: "before",
    },
] as const;

for (const fixture of cases) {
    test(`sanitizeTerminalText strips ${fixture.name}`, () => {
        assert.equal(sanitizeTerminalText(fixture.input), fixture.expected);
    });
}
