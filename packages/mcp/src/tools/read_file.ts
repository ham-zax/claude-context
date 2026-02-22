import fs from "node:fs";
import { z } from "zod";
import { McpTool, ToolContext, formatZodError } from "./types.js";
import { ensureAbsolutePath } from "../utils.js";

const readFileInputSchema = z.object({
    path: z.string().min(1).describe("ABSOLUTE path to the file."),
    start_line: z.number().int().positive().optional().describe("Optional start line (1-based, inclusive)."),
    end_line: z.number().int().positive().optional().describe("Optional end line (1-based, inclusive).")
});

function splitIntoLines(content: string): string[] {
    if (content.length === 0) {
        return [];
    }

    const lines = content.split(/\r?\n/);
    if (lines.length > 1 && lines[lines.length - 1] === "") {
        lines.pop();
    }
    return lines;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export const readFileTool: McpTool = {
    name: "read_file",
    description: () => "Read file content from the local filesystem, with optional 1-based inclusive line ranges and safe truncation.",
    inputSchemaZod: () => readFileInputSchema,
    execute: async (args: unknown, ctx: ToolContext) => {
        const parsed = readFileInputSchema.safeParse(args || {});
        if (!parsed.success) {
            return {
                content: [{
                    type: "text",
                    text: formatZodError("read_file", parsed.error)
                }],
                isError: true
            };
        }

        const input = parsed.data;

        try {
            const absolutePath = ensureAbsolutePath(input.path);

            if (!fs.existsSync(absolutePath)) {
                return {
                    content: [{ type: "text", text: `Error: File '${absolutePath}' not found.` }],
                    isError: true
                };
            }

            const stat = fs.statSync(absolutePath);
            if (!stat.isFile()) {
                return {
                    content: [{ type: "text", text: `Error: '${absolutePath}' is not a file.` }],
                    isError: true
                };
            }

            const content = fs.readFileSync(absolutePath, "utf-8");
            const lines = splitIntoLines(content);
            const totalLines = lines.length;
            if (totalLines === 0) {
                return {
                    content: [{
                        type: "text",
                        text: content
                    }]
                };
            }

            const maxLines = Math.max(1, ctx.readFileMaxLines);
            const hasStart = input.start_line !== undefined;
            const hasEnd = input.end_line !== undefined;
            let startLine = 1;
            let endLine = totalLines;
            let addContinuationHint = false;

            if (!hasStart && !hasEnd) {
                if (totalLines > maxLines) {
                    endLine = maxLines;
                    addContinuationHint = true;
                }
            } else if (hasStart && !hasEnd) {
                startLine = clamp(input.start_line as number, 1, totalLines);
                endLine = Math.min(startLine + maxLines - 1, totalLines);
                addContinuationHint = endLine < totalLines;
            } else if (!hasStart && hasEnd) {
                endLine = clamp(input.end_line as number, 1, totalLines);
            } else {
                startLine = clamp(input.start_line as number, 1, totalLines);
                endLine = clamp(input.end_line as number, startLine, totalLines);
            }

            const selected = lines.slice(startLine - 1, endLine).join("\n");
            if (!addContinuationHint) {
                return {
                    content: [{
                        type: "text",
                        text: selected
                    }]
                };
            }

            const nextStartLine = endLine + 1;
            const hint = `\n\n(File truncated at line ${endLine}. To read more, call read_file with path="${absolutePath}" and start_line=${nextStartLine}.)`;

            return {
                content: [{
                    type: "text",
                    text: `${selected}${hint}`
                }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Error reading file: ${error.message}` }],
                isError: true
            };
        }
    }
};
