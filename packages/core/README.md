# @zokizuan/satori-core

Core semantic indexing engine for Satori.

Maintained by: `ham-zax` (`@zokizuan`).

## Responsibilities

- codebase file discovery + filtering
- code splitting (AST/LangChain)
- embedding generation
- vector persistence/search via Milvus
- incremental sync via Merkle-based change detection

## Install

```bash
npm install @zokizuan/satori-core
```

## Minimal Usage

```ts
import { Context, OpenAIEmbedding, MilvusVectorDatabase } from '@zokizuan/satori-core';

const context = new Context({
  embedding: new OpenAIEmbedding({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'text-embedding-3-small'
  }),
  vectorDatabase: new MilvusVectorDatabase({
    address: process.env.MILVUS_ADDRESS,
    token: process.env.MILVUS_TOKEN
  })
});

await context.indexCodebase('/absolute/path/to/repo');
const results = await context.semanticSearch('/absolute/path/to/repo', 'authentication logic', 5);
```

## Development

```bash
pnpm build
pnpm typecheck
pnpm test:integration
```
