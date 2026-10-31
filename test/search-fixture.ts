/** Deterministic HTTP peer for the real SDK transport, not a mocked MCP client. */
export function mcpFixture() {
  const requests: { url: string; headers: Headers; body: any; signal?: AbortSignal | null }[] = []
  let failure: 'http' | 'tool' | 'rpc' | 'malformed' | 'missing' | 'hang' | 'quota' | undefined
  let failureMethod: string | undefined
  let sse = false
  const fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ url: String(url), headers: new Headers(init?.headers), body, signal: init?.signal })
    if (init?.method === 'GET') return new Response('', { status: 405 })
    if (!body?.id && body?.id !== 0) return new Response(null, { status: 202 })
    const activeFailure = !failureMethod || body.method === failureMethod ? failure : undefined
    if (activeFailure === 'quota') return new Response('anonymous quota exceeded', { status: 429, headers: { 'retry-after': '60' } })
    if (activeFailure === 'hang') return new Promise((_, reject) => {
      const abort = () => reject(init?.signal?.reason ?? new Error('aborted'))
      if (init?.signal?.aborted) abort()
      else init?.signal?.addEventListener('abort', abort, { once: true })
    })
    if (activeFailure === 'http') return new Response('service unavailable', { status: 503 })
    if (activeFailure === 'malformed') return new Response('{broken', { headers: { 'content-type': 'application/json' } })
    let result: any
    if (body.method === 'initialize') result = {
      protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1.0.0' },
    }
    else if (body.method === 'tools/list') result = { tools: activeFailure === 'missing' ? [] :
      ['web_search', 'web_fetch'].map(name => ({ name, inputSchema: { type: 'object' } })) }
    else if (body.method === 'tools/call') result = {
      content: [{ type: 'text', text: body.params.name === 'web_search'
        ? 'TypeScript documentation https://www.typescriptlang.org/docs/'
        : '# TypeScript docs\nUse strict mode for type checking.' }], isError: activeFailure === 'tool',
    }
    const message = activeFailure === 'rpc'
      ? { jsonrpc: '2.0', id: body.id, error: { code: -32603, message: 'fixture RPC error' } }
      : { jsonrpc: '2.0', id: body.id, result }
    return sse
      ? new Response(`event: message\r\ndata: ${JSON.stringify(message)}\r\n\r\n`, { headers: { 'content-type': 'text/event-stream' } })
      : Response.json(message)
  }
  return { requests, fetch, fail: (value: typeof failure, method?: string) => { failure = value; failureMethod = method }, sse: () => { sse = true } }
}

export function modelReply(name?: string, args: unknown = {}) {
  const delta = name ? { tool_calls: [{ index: 0, id: `call-${name}`, function: { name, arguments: JSON.stringify(args) } }] }
    : { content: 'Use strict mode as the fetched documentation recommends.' }
  return new Response(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: name ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`, {
    headers: { 'content-type': 'text/event-stream' },
  })
}
