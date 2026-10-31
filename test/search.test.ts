import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runtimeTools } from '../src/search.js'
import { runAgent } from '../src/agent.js'
import { mcpFixture, modelReply } from './search-fixture.js'

const query = { objective: 'TypeScript strict mode docs', search_queries: ['TypeScript strict mode'] }
const context = () => ({ messages: [] })
const search = async (ctx = context()) => (await runtimeTools(ctx, { search: 'parallel' })).find(t => t.name === 'web_search')!
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

describe('CLI runtime search tools', () => {
  it('unconfigured no-key runtime dispatches search/fetch into model context through real HTTP callers', async () => {
    vi.stubEnv('NANOPI_SEARCH', '')
    delete process.env.NANOPI_SEARCH
    vi.stubEnv('PARALLEL_API_KEY', 'unused-ambient-key')
    const peer = mcpFixture()
    let round = 0
    const modelRequests: any[] = []
    vi.stubGlobal('fetch', async (url: any, init: RequestInit) => {
      if (String(url).startsWith('https://model.test/')) {
        modelRequests.push(JSON.parse(String(init.body)))
        return round++ === 0 ? modelReply('web_search', query)
          : round === 2 ? modelReply('web_fetch', { urls: ['https://www.typescriptlang.org/docs/'] }) : modelReply()
      }
      return peer.fetch(url, init)
    })
    const ctx = context()
    const tools = await runtimeTools(ctx)
    expect(tools.map(t => t.name)).toEqual(['read_file', 'write_file', 'edit', 'run_bash', 'web_search', 'web_fetch'])
    const events = []
    for await (const event of runAgent({ apiKey: 'fixture-model', model: 'scripted', baseUrl: 'https://model.test/v1' }, ctx, tools)) events.push(event)
    expect(events.filter(e => e.type === 'tool_result')).toHaveLength(2)
    expect(modelRequests[1].messages.at(-1).content).toContain('https://www.typescriptlang.org/docs/')
    expect(modelRequests[2].messages.at(-1).content).toContain('Use strict mode')
    expect(events.at(-2)).toMatchObject({ type: 'assistant_text', delta: expect.stringContaining('strict mode') })
    for (const req of peer.requests) {
      expect(req.url).toBe('https://search.parallel.ai/mcp')
      expect(req.headers.get('user-agent')).toBe('pi-from-scratch/0.1.0')
      expect(req.headers.has('authorization')).toBe(false)
    }
    expect(peer.requests.filter(r => r.body?.method === 'tools/list')).toHaveLength(2)
    const calls = peer.requests.filter(r => r.body?.method === 'tools/call')
    expect(calls[0].body.params.arguments.session_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(calls[1].body.params.arguments.session_id).toBe(calls[0].body.params.arguments.session_id)
  })

  it('explicit off never connects or writes session state; unknown selections fail clearly', async () => {
    const network = vi.fn()
    vi.stubGlobal('fetch', network)
    vi.stubEnv('NANOPI_SEARCH', 'off')
    const tools = await runtimeTools(context(), { sessionFile: '/cannot-write/search-session-id' })
    expect(tools).toHaveLength(4)
    expect(network).not.toHaveBeenCalled()
    await expect(runtimeTools(context(), { search: 'other' })).rejects.toThrow('parallel or off')
    expect(await runtimeTools(context(), { search: 'parallel' })).toHaveLength(6)
  })

  it('conversation owner isolates interleaved contexts, preserves followups/retries, and resets with new context', async () => {
    const peer = mcpFixture(); peer.sse(); vi.stubGlobal('fetch', peer.fetch)
    const a = context(), b = context()
    const ta = await search(a), tb = await search(b)
    await Promise.all([ta.execute(query), tb.execute(query)])
    await (await search(a)).execute(query)
    peer.fail('tool'); await expect(ta.execute(query)).rejects.toThrow()
    peer.fail(undefined); await ta.execute(query)
    await (await search()).execute(query)
    const ids = peer.requests.filter(r => r.body?.method === 'tools/call').map(r => r.body.params.arguments.session_id)
    expect(ids[0]).not.toBe(ids[1]); expect(ids[2]).toBe(ids[0])
    expect(ids[3]).toBe(ids[0]); expect(ids[4]).toBe(ids[0]); expect(ids[5]).not.toBe(ids[0])
  })

  it('restores the conversation UUID with persisted history and generates a new UUID after clearing it', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nanopi-search-'))
    const sessionFile = path.join(dir, 'search-session-id')
    try {
      await runtimeTools(context(), { sessionFile, search: 'parallel' })
      const first = await fs.readFile(sessionFile, 'utf8')
      await runtimeTools({ messages: [{ role: 'user', content: 'history' }] }, { sessionFile, search: 'parallel' })
      expect(await fs.readFile(sessionFile, 'utf8')).toBe(first)
      await runtimeTools(context(), { sessionFile, search: 'parallel' })
      expect(await fs.readFile(sessionFile, 'utf8')).not.toBe(first)
    } finally { await fs.rm(dir, { recursive: true, force: true }) }
  })

  it.each(['http', 'tool', 'rpc', 'malformed', 'missing', 'quota'] as const)('surfaces %s failures without provider fallback', async failure => {
    const peer = mcpFixture(); peer.fail(failure); vi.stubGlobal('fetch', peer.fetch)
    await expect((await search()).execute(query)).rejects.toThrow()
    expect(peer.requests.every(r => r.url === 'https://search.parallel.ai/mcp')).toBe(true)
  })

  it.each(['web_search', 'web_fetch'])('cancels %s execution, and quota retry retains its conversation UUID', async name => {
    const peer = mcpFixture(); peer.fail('hang', 'tools/call'); vi.stubGlobal('fetch', peer.fetch)
    const tools = await runtimeTools(context(), { search: 'parallel' })
    const tool = tools.find(t => t.name === name)!
    const args = name === 'web_search' ? query : { urls: ['https://www.typescriptlang.org/docs/'] }
    const controller = new AbortController()
    const cancelled = tool.execute(args, controller.signal)
    const rejected = expect(cancelled).rejects.toThrow()
    await vi.waitFor(() => expect(peer.requests.some(r => r.body?.method === 'tools/call')).toBe(true))
    controller.abort(); await rejected
    peer.fail('quota', 'tools/call')
    await expect(tool.execute(args)).rejects.toThrow()
    peer.fail(undefined)
    await expect(tool.execute(args)).resolves.toContain(name === 'web_search' ? 'typescriptlang.org' : 'strict mode')
    const ids = peer.requests.filter(r => r.body?.method === 'tools/call').map(r => r.body.params.arguments.session_id)
    expect(new Set(ids).size).toBe(1)
  })

  it('validates URLs and arguments before network access', async () => {
    const network = vi.fn(); vi.stubGlobal('fetch', network)
    const tools = await runtimeTools(context(), { search: 'parallel' })
    const fetchTool = tools.find(t => t.name === 'web_fetch')!
    for (const urls of [[], ['file:///etc/passwd'], ['javascript:alert(1)'], ['not a URL'], Array(21).fill('https://example.com')]) {
      expect(() => fetchTool.execute({ urls })).toThrow('HTTP/HTTPS')
    }
    expect(() => tools.find(t => t.name === 'web_search')!.execute({ objective: 'x', search_queries: [] })).toThrow('search_queries')
    expect(network).not.toHaveBeenCalled()
  })

  it('cancels discovery and times out the whole call, then allows retry with the same conversation', async () => {
    const peer = mcpFixture(); peer.fail('hang'); vi.stubGlobal('fetch', peer.fetch)
    const tool = await search()
    const controller = new AbortController()
    const cancelled = tool.execute(query, controller.signal)
    controller.abort()
    await expect(cancelled).rejects.toThrow()
    const already = new AbortController(); already.abort()
    await expect(tool.execute(query, already.signal)).rejects.toThrow()
    vi.useFakeTimers()
    const timed = tool.execute(query)
    const rejected = expect(timed).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(30_001)
    await rejected
    vi.useRealTimers()
    peer.fail(undefined)
    await expect(tool.execute(query)).resolves.toContain('typescriptlang.org')
  })
})
