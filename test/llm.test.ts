// test/llm.test.ts
// 测试 llm 模块的核心功能：SSE 解析、消息构建、格式转换。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stream, buildAssistantMessage, buildToolResultMessage, contextToOpenAIMessages, type Model } from '../src/llm.js'

// mock fetch，用 JSON.stringify 构造 SSE 数据（避免手写转义）
function mockSSE(chunks: object[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(ctrl) {
      for (const chunk of chunks) ctrl.enqueue(enc.encode(`data: ${JSON.stringify(chunk)}\n\n`))
      ctrl.enqueue(enc.encode('data: [DONE]\n\n'))
      ctrl.close()
    },
  })
}

const baseModel: Model = { apiKey: 'test-key', model: 'glm-5.2' }

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })

describe('stream', () => {
  it('解析纯文本响应', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      body: mockSSE([
        { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] },
        { choices: [{ delta: { content: ' world' }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
    })

    const events: { type: string; [k: string]: unknown }[] = []
    for await (const e of stream(baseModel, { messages: [] })) events.push(e)

    expect(events.filter(e => e.type === 'text_delta').map(e => e.delta).join('')).toBe('Hello world')
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'end_turn' })
  })

  it('解析 tool_use 响应', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      body: mockSSE([
        { choices: [{ delta: { content: 'Reading file' }, finish_reason: null }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read_file', arguments: '{"path":' } }] }, finish_reason: null }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"a.txt"}' } }] }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      ]),
    })

    const events: { type: string; [k: string]: unknown }[] = []
    for await (const e of stream(baseModel, { messages: [] })) events.push(e)

    const tc = events.find(e => e.type === 'tool_call') as { id: string; name: string; args: unknown }
    expect(tc).toEqual({ type: 'tool_call', id: 'call_1', name: 'read_file', args: { path: 'a.txt' } })
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'tool_use' })
  })
})

describe('buildAssistantMessage', () => {
  it('把 text + tool_calls 打包成 assistant message', () => {
    const msg = buildAssistantMessage('hi', [{ id: 't1', name: 'read_file', args: { path: 'a' } }])
    expect(msg.role).toBe('assistant')
    expect(msg.content).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'tool_use', id: 't1', name: 'read_file', input: { path: 'a' } },
    ])
  })
})

describe('buildToolResultMessage', () => {
  it('把 tool 执行结果打包成 user message', () => {
    const msg = buildToolResultMessage([{ tool_use_id: 't1', content: 'hello' }])
    expect(msg.role).toBe('user')
    expect(msg.content).toEqual([{ type: 'tool_result', tool_use_id: 't1', content: 'hello' }])
  })
})

describe('contextToOpenAIMessages', () => {
  it('纯文本 user message 原样转换', () => {
    const result = contextToOpenAIMessages({ messages: [{ role: 'user', content: 'hello' }] })
    expect(result).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('system prompt 转成 system message', () => {
    const result = contextToOpenAIMessages({ systemPrompt: 'be helpful', messages: [] })
    expect(result[0]).toEqual({ role: 'system', content: 'be helpful' })
  })

  it('assistant + tool_use 转成 tool_calls', () => {
    const result = contextToOpenAIMessages({
      messages: [{
        role: 'assistant',
        content: [
          { type: 'text', text: 'reading' },
          { type: 'tool_use', id: 't1', name: 'read_file', input: { path: 'a' } },
        ],
      }],
    })
    expect(result[0]).toEqual({
      role: 'assistant', content: 'reading', tool_calls: [
        { id: 't1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a"}' } },
      ],
    })
  })

  it('tool_result 转成 role:tool 消息', () => {
    const result = contextToOpenAIMessages({
      messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'file content' }] }],
    })
    expect(result[0]).toEqual({ role: 'tool', tool_call_id: 't1', content: 'file content' })
  })

  it('空 assistant 文本时 content 为 null', () => {
    const result = contextToOpenAIMessages({
      messages: [{ role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'read', input: {} }] }],
    })
    expect((result[0] as { content: unknown }).content).toBeNull()
  })
})
