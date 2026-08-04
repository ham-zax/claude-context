export const CANDIDATE_STDERR_LIMIT_BYTES = 16 * 1024;

export interface CandidateStderrCollector {
    write(chunk: string): void;
    text(): string;
}

const NPM_AUTH_TOKEN_URL_PATTERN = /((?:https?:)?\/\/[^\s"'<>]*\/:_authToken=)[^\s"'<>&]+/gi;
const NPM_WEB_AUTH_URL_PATTERN = /((?:https?:\/\/)?www\.npmjs\.com\/auth\/cli\/)[^\s"'<>/?#]+/gi;
const NPM_DONE_AUTH_URL_PATTERN = /((?:https?:\/\/)?registry\.npmjs\.org\/-\/v1\/done\?[^\s"'<>]*?\bauthId=)[^&\s"'<>]+/gi;
const SECRET_ASSIGNMENT_PATTERN = /(["']?)([a-zA-Z0-9_.-]*(?:TOKEN|AUTH_TOKEN|API_KEY|SECRET|PASSWORD|CREDENTIAL)[a-zA-Z0-9_.-]*)(?:\1)\s*([=:])\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi;
const AUTHORIZATION_HEADER_PATTERN = /(Authorization\s*:\s*)(Bearer|Basic)\s+[^\s"'<>]+/gi;
const AUTHORIZATION_JSON_PATTERN = /(["']?authorization["']?\s*:\s*["']?)(Bearer|Basic)\s+[^\s"',}]+(["']?)/gi;
// Terminal control sequences are intentionally matched for stripping.
// eslint-disable-next-line no-control-regex
const ANSI_OSC_PATTERN = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;
// eslint-disable-next-line no-control-regex
const ANSI_CSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
// eslint-disable-next-line no-control-regex
const C0_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function normalizeCandidateStderr(text: string): string {
    let normalized = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    normalized = normalized.replace(ANSI_OSC_PATTERN, "");
    normalized = normalized.replace(ANSI_CSI_PATTERN, "");
    normalized = normalized.replace(C0_CONTROL_PATTERN, "");
    normalized = normalized.replace(NPM_AUTH_TOKEN_URL_PATTERN, "$1<redacted>");
    normalized = normalized.replace(NPM_WEB_AUTH_URL_PATTERN, "$1<redacted>");
    normalized = normalized.replace(NPM_DONE_AUTH_URL_PATTERN, "$1<redacted>");
    normalized = normalized.replace(SECRET_ASSIGNMENT_PATTERN, "$1$2$1$3<redacted>");
    normalized = normalized.replace(AUTHORIZATION_HEADER_PATTERN, "$1$2 <redacted>");
    normalized = normalized.replace(AUTHORIZATION_JSON_PATTERN, "$1$2 <redacted>$3");
    return normalized;
}

const TRUNCATION_MARKER = "[stderr line truncated]\n";

function retainCompleteLines(text: string): string {
    let retained = text;
    while (Buffer.byteLength(retained, "utf8") > CANDIDATE_STDERR_LIMIT_BYTES) {
        const newline = retained.indexOf("\n");
        if (newline === -1) {
            return TRUNCATION_MARKER;
        }
        retained = retained.slice(newline + 1);
    }
    return retained;
}

function normalizedLineOrMarker(rawLine: string): string {
    if (Buffer.byteLength(rawLine, "utf8") > CANDIDATE_STDERR_LIMIT_BYTES) {
        return TRUNCATION_MARKER;
    }
    const normalized = normalizeCandidateStderr(rawLine);
    return Buffer.byteLength(normalized, "utf8") > CANDIDATE_STDERR_LIMIT_BYTES
        ? TRUNCATION_MARKER
        : normalized;
}

function splitCompleteLines(input: string): { lines: string[]; remainder: string } {
    const lines: string[] = [];
    let start = 0;
    for (let index = 0; index < input.length; index += 1) {
        const character = input[index];
        if (character === "\n") {
            lines.push(input.slice(start, index + 1));
            start = index + 1;
        } else if (character === "\r") {
            if (index + 1 === input.length) {
                break;
            }
            const end = input[index + 1] === "\n" ? index + 2 : index + 1;
            lines.push(input.slice(start, end));
            start = end;
            index = end - 1;
        }
    }
    return { lines, remainder: input.slice(start) };
}

export function createCandidateStderrCollector(): CandidateStderrCollector {
    let rawBuffer = "";
    let normalizedBuffer = "";
    let discardingOversizedLine = false;
    return {
        write(chunk: string): void {
            let input = rawBuffer + chunk;
            if (discardingOversizedLine) {
                const firstNewline = input.indexOf("\n");
                if (firstNewline === -1) {
                    rawBuffer = "";
                    return;
                }
                input = input.slice(firstNewline + 1);
                discardingOversizedLine = false;
            }

            const split = splitCompleteLines(input);
            for (const line of split.lines) {
                normalizedBuffer = retainCompleteLines(
                    normalizedBuffer + normalizedLineOrMarker(line),
                );
            }
            rawBuffer = split.remainder;
            if (Buffer.byteLength(rawBuffer, "utf8") > CANDIDATE_STDERR_LIMIT_BYTES) {
                normalizedBuffer = retainCompleteLines(normalizedBuffer + TRUNCATION_MARKER);
                rawBuffer = "";
                discardingOversizedLine = true;
            }
        },
        text(): string {
            if (discardingOversizedLine || rawBuffer === "") {
                return normalizedBuffer;
            }
            return retainCompleteLines(
                normalizedBuffer + normalizeCandidateStderr(rawBuffer),
            );
        },
    };
}
