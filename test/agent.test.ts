// test/agent.test.ts
// 测试 agent loop 的核心路径：纯文本回复、tool_call 执行后把结果放回到 Context、未知 tool 报错。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StreamEvent, Model, Context } from '../src/llm.js'

const { mockStreamFn } = vi.hoisted(() => ({
  mockStreamFn: vi.fn(async function* (): AsyncGenerator<StreamEvent> {
    yield { type: 'done', stopReason: 'end_turn' }
  }),
}))

vi.mock('../src/llm.js', () => ({
  stream: mockStreamFn,
  buildAssistantMessage: (text: string, toolCalls: { id: string; name: string; args: unknown }[]) => {
    const content: unknown[] = []
    if (text) content.push({ type: 'text', text })
    for (const tc of toolCalls) content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
    return { role: 'assistant', content }
  },
  buildToolResultMessage: (results: { tool_use_id: string; content: string }[]) => ({
    role: 'user',
    content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.tool_use_id, content: r.content })),
  }),
}))

import { runAgent, type AgentTool } from '../src/agent.js'

beforeEach(() => { mockStreamFn.mockClear() })

const model: Model = { apiKey: 'k', model: 'test' }

describe('runAgent', () => {
  it('纯文本回复：一轮就结束', async () => {
    mockStreamFn.mockImplementation(async function* (): AsyncGenerator<StreamEvent> {
      yield { type: 'text_delta', delta: 'Hello' }
      yield { type: 'done', stopReason: 'end_turn' }
    })

    const ctx: Context = { messages: [] }
    const events: { type: string; [k: string]: unknown }[] = []
    for await (const e of runAgent(model, ctx, [] as AgentTool[])) events.push(e)

    expect(events.find(e => e.type === 'assistant_text')).toEqual({ type: 'assistant_text', delta: 'Hello' })
    expect(events.at(-1)).toEqual({ type: 'turn_end', stopReason: 'end_turn' })
    expect(ctx.messages).toHaveLength(1)
  })

  it('tool_call → 执行 → 把结果放回到 Context → 下一轮纯文本', async () => {
    const echoTool: AgentTool = {
      name: 'echo',
      description: 'echo back',
      parameters: { type: 'object', properties: {} },
      execute: async (args: { text: string }) => `ECHO: ${args.text}`,
    }

    let round = 0
    mockStreamFn.mockImplementation(async function* (): AsyncGenerator<StreamEvent> {
      if (round === 0) {
        yield { type: 'tool_call', id: 't1', name: 'echo', args: { text: 'hi' } }
        yield { type: 'done', stopReason: 'tool_use' }
      } else {
        yield { type: 'text_delta', delta: 'Done' }
        yield { type: 'done', stopReason: 'end_turn' }
      }
      round++
    })

    const ctx: Context = { messages: [] }
    const events: { type: string; [k: string]: unknown }[] = []
    for await (const e of runAgent(model, ctx, [echoTool])) events.push(e)

    expect(events.map(e => e.type)).toEqual(['tool_call', 'tool_result', 'assistant_text', 'turn_end'])
    const tr = events.find(e => e.type === 'tool_result') as { result: string }
    expect(tr.result).toBe('ECHO: hi')
    // 3 条消息：assistant(tool_use) + user(tool_result) + assistant(text)
    expect(ctx.messages).toHaveLength(3)
  })

  it('未知 tool 名 → 把报错结果放回到 Context', async () => {
    let round = 0
    mockStreamFn.mockImplementation(async function* (): AsyncGenerator<StreamEvent> {
      if (round === 0) {
        yield { type: 'tool_call', id: 't1', name: 'nope', args: {} }
        yield { type: 'done', stopReason: 'tool_use' }
      } else {
        yield { type: 'text_delta', delta: 'ok' }
        yield { type: 'done', stopReason: 'end_turn' }
      }
      round++
    })

    const events: { type: string; [k: string]: unknown }[] = []
    for await (const e of runAgent(model, { messages: [] }, [] as AgentTool[])) events.push(e)

    const tr = events.find(e => e.type === 'tool_result') as { result: string }
    expect(tr.result).toContain('not found')
  })
})
