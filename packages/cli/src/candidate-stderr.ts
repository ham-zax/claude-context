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

function dropToNewestTail(text: string): string {
    if (Buffer.byteLength(text, "utf8") <= CANDIDATE_STDERR_LIMIT_BYTES) {
        return text;
    }
    let low = 0;
    let high = text.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (Buffer.byteLength(text.slice(mid), "utf8") > CANDIDATE_STDERR_LIMIT_BYTES) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    return text.slice(low);
}

export function createCandidateStderrCollector(): CandidateStderrCollector {
    let rawBuffer = "";
    let normalizedBuffer = "";
    return {
        write(chunk: string): void {
            rawBuffer = dropToNewestTail(rawBuffer + chunk);
            normalizedBuffer = dropToNewestTail(normalizeCandidateStderr(rawBuffer));
        },
        text(): string {
            return normalizedBuffer;
        },
    };
}
