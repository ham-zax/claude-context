import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityResolver } from '../core/capabilities.js';
import { ContextMcpConfig } from '../config.js';
import { getMcpToolList, toolRegistry } from './registry.js';
import { ToolContext } from './types.js';

function buildConfig(overrides: Partial<ContextMcpConfig> = {}): ContextMcpConfig {
    return {
        name: 'test',
        version: '1.0.0',
        encoderProvider: 'VoyageAI',
        encoderModel: 'voyage-4-large',
        encoderOutputDimension: 1024,
        voyageKey: 'voyage-key',
        milvusEndpoint: 'https://example.zilliz.com',
        milvusApiToken: 'token',
        rankerModel: 'rerank-2.5',
        ...overrides,
    };
}

function buildContext(overrides: Partial<ContextMcpConfig> = {}): ToolContext {
    const capabilities = new CapabilityResolver(buildConfig(overrides));
    return {
        capabilities,
    } as ToolContext;
}

test('tool registry exposes exactly four public tools', () => {
    const names = Object.keys(toolRegistry);
    assert.deepEqual(names, ['manage_index', 'search_codebase', 'read_file', 'list_codebases']);
});

test('generated ListTools payload returns exactly four tools', () => {
    const list = getMcpToolList(buildContext());
    const names = list.map((tool) => tool.name);

    assert.deepEqual(names, ['manage_index', 'search_codebase', 'read_file', 'list_codebases']);
});

test('search_codebase schema keeps useReranker optional without default', () => {
    const tools = getMcpToolList(buildContext());
    const searchTool = tools.find((tool) => tool.name === 'search_codebase');
    assert.ok(searchTool);

    const properties = searchTool!.inputSchema.properties as Record<string, any>;
    assert.ok(properties.useReranker);
    assert.equal(Object.prototype.hasOwnProperty.call(properties.useReranker, 'default'), false);

    const required = searchTool!.inputSchema.required as string[];
    assert.ok(required.includes('path'));
    assert.ok(required.includes('query'));
});

test('read_file schema includes optional start_line and end_line parameters', () => {
    const tools = getMcpToolList(buildContext());
    const readFileTool = tools.find((tool) => tool.name === 'read_file');
    assert.ok(readFileTool);

    const properties = readFileTool!.inputSchema.properties as Record<string, any>;
    assert.ok(properties.path);
    assert.ok(properties.start_line);
    assert.ok(properties.end_line);

    const required = readFileTool!.inputSchema.required as string[];
    assert.deepEqual(required, ['path']);
    assert.equal(Object.prototype.hasOwnProperty.call(properties.start_line, 'default'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(properties.end_line, 'default'), false);
});
