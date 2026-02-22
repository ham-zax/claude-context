import { z } from "zod";
import { McpTool, ToolContext, formatZodError } from "./types.js";

const readFileInputSchema = z.object({
    path: z.string().min(1).describe("ABSOLUTE path to the file.")
});

export const readFileTool: McpTool = {
    name: "read_file",
    description: () => "Read full content of a file from the local filesystem.",
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

        return ctx.toolHandlers.handleReadCode(parsed.data);
    }
};
