export function sanitizeTerminalText(value: string): string {
    let sanitized = "";
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code === 0x1b) {
            const sequenceType = value.charCodeAt(index + 1);
            if (sequenceType === 0x5b) {
                index += 2;
                while (index < value.length) {
                    const sequenceCode = value.charCodeAt(index);
                    if (sequenceCode >= 0x40 && sequenceCode <= 0x7e) break;
                    index += 1;
                }
            } else if (sequenceType === 0x5d) {
                index += 2;
                while (index < value.length) {
                    const sequenceCode = value.charCodeAt(index);
                    if (sequenceCode === 0x07) break;
                    if (sequenceCode === 0x1b && value.charCodeAt(index + 1) === 0x5c) {
                        index += 1;
                        break;
                    }
                    index += 1;
                }
            }
            continue;
        }
        if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
            sanitized += " ";
            continue;
        }
        sanitized += value[index];
    }
    return sanitized.replace(/\s+/g, " ").trim();
}
