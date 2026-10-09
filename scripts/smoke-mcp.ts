import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = process.argv[2];
if (!endpoint) throw new Error('Usage: npx tsx scripts/smoke.ts https://<worker-host>/mcp');
const client = new Client({ name: 'fffs-public-smoke', version: '1.0.0' });
const data = (result: Record<string, unknown>) => { assert.notEqual(result.isError, true, JSON.stringify(result)); return result.structuredContent as Record<string, unknown>; };
await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
try {
  const tools = await client.listTools(); assert.equal(tools.tools.length, 6);
  const status = data(await client.callTool({ name: 'get_library_status', arguments: {} }));
  const all = data(await client.callTool({ name: 'list_fffs', arguments: { status: 'all', limit: 1 } }));
  const search = data(await client.callTool({ name: 'search_fffs', arguments: { query: 'FFFS 2014:4' } })); assert.equal(search.total, 1);
  const first = data(await client.callTool({ name: 'get_fffs', arguments: { id: '2014:4' } })); assert.ok((first.content as string).length <= 20_000); assert.equal(first.asOf, status.asOf);
  if (first.nextCursor) { const second = data(await client.callTool({ name: 'get_fffs', arguments: { id: '2014:4', cursor: first.nextCursor } })); assert.ok((second.offset as number) > 0); }
  const sectionId = (first.sections as { id: string }[])[0]?.id;
  if (sectionId) { const section = data(await client.callTool({ name: 'get_section', arguments: { id: '2014:4', sectionId } })); assert.ok((section.content as string).length > 0); }
  data(await client.callTool({ name: 'get_amendments', arguments: { id: '2014:4' } }));
  const resources = await client.listResources(); assert.ok(resources.resources.some(resource => resource.uri === 'fffs://catalog'));
  await client.readResource({ uri: 'fffs://catalog' }); await client.readResource({ uri: 'fffs://2014-04' }); await client.listResourceTemplates();
  console.log(JSON.stringify({ ok: true, endpoint, asOf: status.asOf, toolCount: tools.tools.length, documentCount: all.total, resourceCount: resources.resources.length, canonicalUrl: (first.document as Record<string, unknown>).canonicalUrl }, null, 2));
} finally { await client.close(); }
