import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    buildSearchRerankRequestContractManifest,
    resolveSearchRerankRequestContractAssetPath,
} from "../src/core/search-rerank-request-contract.js";

function main(): void {
    const checkMode = process.argv.includes("--check");
    const manifest = buildSearchRerankRequestContractManifest();
    const next = `${JSON.stringify(manifest, null, 2)}\n`;
    const assetPath = resolveSearchRerankRequestContractAssetPath();

    if (checkMode) {
        const current = fs.existsSync(assetPath) ? fs.readFileSync(assetPath, "utf8") : "";
        if (current !== next) {
            console.error(
                "[contract:check] rerank request contract is out of date. Run: pnpm -C packages/mcp contract:generate",
            );
            process.exit(1);
        }
        console.log(`[contract:check] rerank request contract is up to date (${manifest.contractSha256}).`);
        return;
    }

    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    fs.writeFileSync(assetPath, next, "utf8");
    console.log(`[contract:generate] wrote ${path.relative(process.cwd(), assetPath)} (${manifest.contractSha256}).`);
}

main();
