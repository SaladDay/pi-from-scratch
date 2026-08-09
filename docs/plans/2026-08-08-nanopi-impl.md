# nanopi 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 0 手撕出一个极简 AI coding agent（~480 行 TypeScript），复刻 pi-mono 四模块架构，用于教学。

**Architecture:** 四个模块按依赖单向流动：`llm`（统一 LLM API，SSE → 事件流）→ `agent`（LLM ↔ tool 循环）→ `tui`（单行输入 + 流式输出）→ `cli`（拼装层 + 4 个内置 tool + session 持久化）。零跨层依赖，`cli` 是唯一入口。

**Tech Stack:** TypeScript 5.x, Node.js >= 20, vitest, @anthropic-ai/sdk（仅 HTTP 客户端，不用其 streaming/agent 封装）

## Global Constraints

- Node.js >= 20（原生 `fetch`、原生 `readline/promises`）
- 仅依赖 `@anthropic-ai/sdk` 做 HTTP + SSE 解析；**不用** SDK 的 `.stream()` / `MessageStream` / agent loop 封装——这些是 nanopi 要手撕的东西
- TypeScript strict mode
- 每个模块一个文件，零跨模块内部状态
- 测试用 vitest；mock LLM 响应，不发真实请求
- 代码注释中文，面向学习者

---

## File Structure

```
nanopi/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── llm.ts          # 统一 LLM API：stream() → AsyncIterable<StreamEvent>
│   ├── agent.ts        # Agent Loop：runAgent() → AsyncGenerator<AgentEvent>
│   ├── tui.ts          # 极简终端界面：Tui 类
│   ├── tools.ts        # 4 个内置 tool 定义
│   └── cli.ts          # main()：拼装 + session 持久化
├── test/
│   ├── llm.test.ts
│   ├── agent.test.ts
│   ├── tui.test.ts
│   └── tools.test.ts
└── docs/
    └── specs/2026-08-08-nanopi-design.md
```

| 文件 | 职责 | 行数 |
|------|------|------|
| `src/llm.ts` | SSE 解析 + 事件统一 + abort + context 序列化 | ~150 |
| `src/agent.ts` | while 循环：stream → tool exec → 把结果放回到 Context → 重复 | ~80 |
| `src/tui.ts` | readline 输入 + stdout 流式 + Ctrl+C | ~100 |
| `src/tools.ts` | read_file / write_file / edit / run_bash | ~130 |
| `src/cli.ts` | main() + session JSONL append | ~50 |
| **合计** | | **~510** |

---

### Task 0: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/.gitkeep`（占位，保证 src/ 存在）
- Create: `test/.gitkeep`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "nanopi",
  "version": "0.1.0",
  "type": "module",
  "bin": { "nanopi": "./dist/cli.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: 安装依赖并验证**

Run: `npm install`
Expected: node_modules 创建成功，无错误

- [ ] **Step 5: 验证 vitest 能跑空测试**

Run: `npx vitest run`
Expected: "No test files found" 或通过，无报错

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold nanopi project (ts + vitest)"
```

---

### Task 1: `llm` 模块 — 统一 LLM API

**Files:**
- Create: `src/llm.ts`
- Test: `test/llm.test.ts`

**Interfaces:**
- Produces: `Context`, `Message`, `StreamEvent`, `Model`, `stream()`, `contentBlocksToMessage()`

**学习要点**：SSE 流式解析、tool_use 事件的累积、abort 处理、context 的纯 JSON 可序列化。

Anthropic SSE 事件流（我们关心的部分）：
```
message_start          → 初始化
content_block_start    → 块开始，type 是 "text" 或 "tool_use"
content_block_delta    → text_delta（文本）或 input_json_delta（tool args 的 partial JSON）
content_block_stop     → 块结束
message_delta          → stop_reason: "end_turn" | "tool_use"
message_stop           → 流结束
```

- [ ] **Step 1: 写类型定义和导出**

```typescript
// src/llm.ts
// 统一 LLM API —— 把 Anthropic SSE 响应解析成四种事件流。
// 教学版只支持 Anthropic；多 provider 是脏活，留作扩展练习。

// ===== 类型 =====

/** 模型配置 */
export type Model = {
  apiKey: string
  model: string          // 如 "claude-sonnet-4-5"
  baseUrl?: string       // 默认 https://api.anthropic.com
  maxTokens?: number     // 默认 4096
}

/** 消息：user / assistant 共用同一结构，content 是 content block 数组 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string }

export type Message = {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

/** Context：纯 JSON，可 stringify 落盘 */
export type Context = {
  messages: Message[]
}

/** 流事件：llm 模块对外的统一输出 */
export type StreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'done'; stopReason: 'end_turn' | 'tool_use' | 'aborted' }
  | { type: 'error'; error: Error }

// ===== stream 函数 =====

/** 把 tools（agent 模块传入）转成 Anthropic API 的 tools 格式 */
type ToolDef = {
  name: string
  description: string
  input_schema: object
}

/**
 * 调用 Anthropic Messages API（streaming），返回统一事件流。
 *
 * @param model    模型配置
 * @param context  对话上下文（messages 会被原样发送）
 * @param opts     tools + abort signal
 * @yields StreamEvent
 */
export async function* stream(
  model: Model,
  context: Context,
  opts: { tools?: ToolDef[]; signal?: AbortSignal } = {},
): AsyncGenerator<StreamEvent> {
  // TODO: Step 2 实现
}
```

- [ ] **Step 2: 实现 stream() —— 发请求 + SSE 解析**

```typescript
export async function* stream(
  model: Model,
  context: Context,
  opts: { tools?: ToolDef[]; signal?: AbortSignal } = {},
): AsyncGenerator<StreamEvent> {
  const url = `${model.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`

  const body: Record<string, unknown> = {
    model: model.model,
    max_tokens: model.maxTokens ?? 4096,
    stream: true,
    messages: context.messages,
  }
  if (opts.tools?.length) body.tools = opts.tools

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': model.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    })
  } catch (e) {
    if (opts.signal?.aborted) {
      yield { type: 'done', stopReason: 'aborted' }
      return
    }
    yield { type: 'error', error: e as Error }
    return
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => 'unknown error')
    yield { type: 'error', error: new Error(`API ${response.status}: ${text}`) }
    return
  }

  // SSE 解析：按行读，event: xxx / data: {json}
  // tool_use 块的 input 通过 input_json_delta 累积 partial JSON，到 content_block_stop 时 parse
  const blocks = new Map<number, { type: string; id?: string; name?: string; jsonBuf: string }>()
  let stopReason: 'end_turn' | 'tool_use' = 'end_turn'

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      // SSE 事件以空行分隔，按事件块处理
      let nl: number
      while ((nl = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, nl)
        buf = buf.slice(nl + 2)
        const event = parseSSE(raw)
        if (!event) continue

        if (event.type === 'content_block_start') {
          const cb = event.content_block
          blocks.set(event.index, {
            type: cb.type,
            id: cb.id,
            name: cb.name,
            jsonBuf: '',
          })
        } else if (event.type === 'content_block_delta') {
          const d = event.delta
          if (d.type === 'text_delta') {
            yield { type: 'text_delta', delta: d.text }
          } else if (d.type === 'input_json_delta') {
            const blk = blocks.get(event.index)
            if (blk) blk.jsonBuf += d.partial_json
          }
        } else if (event.type === 'content_block_stop') {
          const blk = blocks.get(event.index)
          if (blk?.type === 'tool_use') {
            let args: unknown = {}
            if (blk.jsonBuf) {
              try { args = JSON.parse(blk.jsonBuf) } catch { args = {} }
            }
            yield { type: 'tool_call', id: blk.id!, name: blk.name!, args }
          }
        } else if (event.type === 'message_delta') {
          if (event.delta?.stop_reason) {
            stopReason = event.delta.stop_reason
          }
        } else if (event.type === 'message_stop') {
          // 流结束
        }
      }
    }
  } catch (e) {
    if (opts.signal?.aborted) {
      yield { type: 'done', stopReason: 'aborted' }
      return
    }
    yield { type: 'error', error: e as Error }
    return
  }

  yield { type: 'done', stopReason: opts.signal?.aborted ? 'aborted' : stopReason }
}

/** 解析一个 SSE 事件块（"event: xxx\ndata: {json}"）为 JS 对象 */
function parseSSE(raw: string): any | null {
  let dataLine = ''
  for (const line of raw.split('\n')) {
    if (line.startsWith('data: ')) dataLine = line.slice(6)
    else if (line.startsWith('data:')) dataLine = line.slice(5)
  }
  if (!dataLine || dataLine === '[DONE]') return null
  try { return JSON.parse(dataLine) } catch { return null }
}
```

- [ ] **Step 3: 写 assistant message 构建辅助函数**

agent 模块需要把流事件累积成 assistant message，塞回 context。把这个逻辑放 llm 模块，因为它了解 content block 结构。

```typescript
/**
 * 从一轮 stream 的事件中累积出 assistant message，可塞回 context.messages。
 * 调用方在消费 stream() 的同时收集 text 和 tool_calls，最后调此函数。
 */
export function buildAssistantMessage(
  text: string,
  toolCalls: { id: string; name: string; args: unknown }[],
): Message {
  const content: ContentBlock[] = []
  if (text) content.push({ type: 'text', text })
  for (const tc of toolCalls) {
    content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
  }
  return { role: 'assistant', content }
}

/** 构造 tool_result user message（把工具执行结果放回到 Context） */
export function buildToolResultMessage(
  results: { tool_use_id: string; content: string }[],
): Message {
  return {
    role: 'user',
    content: results.map(r => ({
      type: 'tool_result' as const,
      tool_use_id: r.tool_use_id,
      content: r.content,
    })),
  }
}
```

- [ ] **Step 4: 写测试 —— mock fetch 返回 SSE**

```typescript
// test/llm.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stream, buildAssistantMessage, buildToolResultMessage, type Model, type Context } from '../src/llm.js'

// mock 全局 fetch
function mockSSE(events: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(ctrl) {
      for (const e of events) ctrl.enqueue(enc.encode(e))
      ctrl.close()
    },
  })
}

const baseModel: Model = { apiKey: 'test-key', model: 'claude-sonnet-4-5' }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('stream', () => {
  it('解析纯文本响应', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      body: mockSSE([
        'event: message_start\ndata: {"type":"message_start","message":{"content":[]}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    })

    const events = []
    for await (const e of stream(baseModel, { messages: [] })) events.push(e)

    expect(events.filter(e => e.type === 'text_delta').map(e => (e as any).delta).join('')).toBe('Hello world')
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'end_turn' })
  })

  it('解析 tool_use 响应', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      body: mockSSE([
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Reading file"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"read_file","input":{}}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"path\":"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"a.txt\\"}"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    })

    const events = []
    for await (const e of stream(baseModel, { messages: [] })) events.push(e)

    const tc = events.find(e => e.type === 'tool_call') as any
    expect(tc).toEqual({ type: 'tool_call', id: 'toolu_1', name: 'read_file', args: { path: 'a.txt' } })
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'tool_use' })
  })

  it('API 错误时 yield error', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      body: null,
      text: async () => 'Unauthorized',
    })

    const events = []
    for await (const e of stream(baseModel, { messages: [] })) events.push(e)

    expect(events.at(-1)!.type).toBe('error')
    expect((events.at(-1) as any).error.message).toContain('401')
  })

  it('abort 时 yield done(aborted)', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    ;(globalThis.fetch as any).mockRejectedValue(new DOMException('aborted', 'AbortError'))

    const events = []
    for await (const e of stream(baseModel, { messages: [] }, { signal: ctrl.signal })) events.push(e)

    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'aborted' })
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
    expect(msg.content).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: 'hello' },
    ])
  })
})
```

- [ ] **Step 5: 运行测试，验证通过**

Run: `npx vitest run test/llm.test.ts`
Expected: 5 个测试全通过

- [ ] **Step 6: Commit**

```bash
git add src/llm.ts test/llm.test.ts
git commit -m "feat(llm): unified streaming LLM API with SSE parse + abort"
```

---

### Task 2: `agent` 模块 — Agent Loop

**Files:**
- Create: `src/agent.ts`
- Test: `test/agent.test.ts`

**Interfaces:**
- Consumes: `stream()`, `buildAssistantMessage()`, `buildToolResultMessage()`, `Context`, `Model` from `llm`
- Produces: `AgentTool`, `AgentEvent`, `runAgent()`

**学习要点**：agent 的本质是一个 while 循环——stream → 检测 tool_call → 执行 → 把结果放回到 Context → 重复。没有 state management，没有 max steps，模型说停就停。

- [ ] **Step 1: 写类型定义和 runAgent 骨架**

```typescript
// src/agent.ts
// Agent Loop —— 整个项目的灵魂：一个 while 循环。
// LLM 流式回复 → 如果有 tool_call 就执行工具 → 把结果放回到 Context → 继续流式
// 直到模型不再调工具（stopReason === 'end_turn'）。

import { stream, buildAssistantMessage, buildToolResultMessage, type Model, type Context } from './llm.js'

/** 工具定义：name + 描述 + JSON Schema 参数 + execute 函数 */
export type AgentTool = {
  name: string
  description: string
  input_schema: object  // JSON Schema
  execute: (args: any) => Promise<string>
}

/** agent 对外的事件流，供 UI 消费 */
export type AgentEvent =
  | { type: 'assistant_text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: string }
  | { type: 'turn_end'; stopReason: 'end_turn' | 'aborted' }

/**
 * 运行 agent 循环。
 *
 * @param model    模型配置
 * @param context  对话上下文（会被原地修改：push assistant message + tool_result message）
 * @param tools    工具注册表
 * @param signal   abort 信号
 * @yields AgentEvent
 */
export async function* runAgent(
  model: Model,
  context: Context,
  tools: AgentTool[],
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  // TODO: Step 2
}
```

- [ ] **Step 2: 实现 runAgent 循环体**

```typescript
export async function* runAgent(
  model: Model,
  context: Context,
  tools: AgentTool[],
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  // tool 查找表
  const toolMap = new Map(tools.map(t => [t.name, t]))

  while (true) {
    // 1. 流式调用 LLM
    let text = ''
    const toolCalls: { id: string; name: string; args: unknown }[] = []

    for await (const ev of stream(model, context, {
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
      signal,
    })) {
      if (ev.type === 'text_delta') {
        text += ev.delta
        yield { type: 'assistant_text', delta: ev.delta }
      } else if (ev.type === 'tool_call') {
        toolCalls.push({ id: ev.id, name: ev.name, args: ev.args })
        yield { type: 'tool_call', id: ev.id, name: ev.name, args: ev.args }
      } else if (ev.type === 'done') {
        if (ev.stopReason === 'aborted') {
          yield { type: 'turn_end', stopReason: 'aborted' }
          return
        }
        // done 但流里可能已有 tool_calls（content_block_stop 先于 message_delta）
      } else if (ev.type === 'error') {
        // 错误冒泡给 UI：把错误信息当 assistant 文本输出
        yield { type: 'assistant_text', delta: `[error] ${ev.error.message}` }
        yield { type: 'turn_end', stopReason: 'end_turn' }
        return
      }
    }

    // 2. 把 assistant 回复塞回 context
    context.messages.push(buildAssistantMessage(text, toolCalls))

    // 3. 没有 tool_call → 循环结束
    if (toolCalls.length === 0) {
      yield { type: 'turn_end', stopReason: 'end_turn' }
      return
    }

    // 4. 执行所有 tool_call，收集结果
    const results: { tool_use_id: string; content: string }[] = []
    for (const tc of toolCalls) {
      const tool = toolMap.get(tc.name)
      let result: string
      if (!tool) {
        result = `error: tool "${tc.name}" not found`
      } else {
        try {
          result = await tool.execute(tc.args)
        } catch (e) {
          result = `error: ${(e as Error).message}`
        }
      }
      results.push({ tool_use_id: tc.id, content: result })
      yield { type: 'tool_result', id: tc.id, name: tc.name, result }
    }

    // 5. 把 tool_result 放回到 Context，进入下一轮
    context.messages.push(buildToolResultMessage(results))
  }
}
```

- [ ] **Step 3: 写测试 —— mock stream 函数**

```typescript
// test/agent.test.ts
import { describe, it, expect, vi } from 'vitest'
import { runAgent, type AgentTool } from '../src/agent.js'
import type { Model, Context, StreamEvent } from '../src/llm.js'

// mock llm.stream：按预设的"轮次"返回事件序列
function mockStream(rounds: StreamEvent[][]) {
  let i = 0
  return vi.fn(async function* (_model: Model, _ctx: Context): AsyncGenerator<StreamEvent> {
    const round = rounds[Math.min(i++, rounds.length - 1)]
    for (const e of round) yield e
  })
}

const model: Model = { apiKey: 'k', model: 'test' }
const noTools: AgentTool[] = []

describe('runAgent', () => {
  it('纯文本回复：一轮就结束', async () => {
    const stream = mockStream([[
      { type: 'text_delta', delta: 'Hello' },
      { type: 'done', stopReason: 'end_turn' },
    ]])
    vi.doMock('../src/llm.js', { stream })

    const { runAgent } = await import('../src/agent.js')
    const ctx: Context = { messages: [] }
    const events = []
    for await (const e of runAgent(model, ctx, noTools)) events.push(e)

    expect(events.find(e => e.type === 'assistant_text')).toEqual({ type: 'assistant_text', delta: 'Hello' })
    expect(events.at(-1)).toEqual({ type: 'turn_end', stopReason: 'end_turn' })
    // assistant message 被塞回 context
    expect(ctx.messages).toHaveLength(1)
    expect(ctx.messages[0].role).toBe('assistant')
  })

  it('tool_call → 执行 → 把结果放回到 Context → 下一轮纯文本', async () => {
    const echoTool: AgentTool = {
      name: 'echo',
      description: 'echo back',
      input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      execute: async (args) => `ECHO: ${args.text}`,
    }
    const stream = mockStream([
      // 第 1 轮：调 tool
      [
        { type: 'tool_call', id: 't1', name: 'echo', args: { text: 'hi' } },
        { type: 'done', stopReason: 'tool_use' },
      ],
      // 第 2 轮：纯文本收尾
      [
        { type: 'text_delta', delta: 'Done' },
        { type: 'done', stopReason: 'end_turn' },
      ],
    ])
    vi.doMock('../src/llm.js', { stream })

    const { runAgent } = await import('../src/agent.js')
    const ctx: Context = { messages: [] }
    const events = []
    for await (const e of runAgent(model, ctx, [echoTool])) events.push(e)

    // 应看到 tool_call → tool_result → assistant_text → turn_end
    expect(events.map(e => e.type)).toEqual([
      'tool_call', 'tool_result', 'assistant_text', 'turn_end',
    ])
    const tr = events.find(e => e.type === 'tool_result') as any
    expect(tr.result).toBe('ECHO: hi')
    // context 有 3 条消息：assistant(tool_use) + user(tool_result) + assistant(text)
    expect(ctx.messages).toHaveLength(3)
  })

  it('未知 tool 名 → 把报错结果放回到 Context', async () => {
    const stream = mockStream([
      [{ type: 'tool_call', id: 't1', name: 'nope', args: {} }, { type: 'done', stopReason: 'tool_use' }],
      [{ type: 'text_delta', delta: 'ok' }, { type: 'done', stopReason: 'end_turn' }],
    ])
    vi.doMock('../src/llm.js', { stream })

    const { runAgent } = await import('../src/agent.js')
    const events = []
    for await (const e of runAgent(model, { messages: [] }, noTools)) events.push(e)

    const tr = events.find(e => e.type === 'tool_result') as any
    expect(tr.result).toContain('not found')
  })
})
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run test/agent.test.ts`
Expected: 3 个测试通过

- [ ] **Step 5: Commit**

```bash
git add src/agent.ts test/agent.test.ts
git commit -m "feat(agent): agent loop with tool execution + context feedback"
```

---

### Task 3: `tui` 模块 — 极简终端界面

**Files:**
- Create: `src/tui.ts`
- Test: `test/tui.test.ts`

**Interfaces:**
- Produces: `Tui` class

**学习要点**：教学版 TUI 不碰 differential renderer、不碰 component 树。只用 readline 读输入、stdout 流式打印、Ctrl+C 打断。极简即克制。

- [ ] **Step 1: 实现 Tui 类**

```typescript
// src/tui.ts
// 极简终端界面 —— 单行输入 + 流式输出 + Ctrl+C 打断。
// 不做 differential renderer、不做 component 树、不做 markdown 渲染。
// 这些是"终端 UI 框架"的功课，不是"手撕 agent"的灵魂。

import * as readline from 'readline'

export class Tui {
  private rl: readline.Interface | null = null
  private onPromptCb: ((text: string) => void) | null = null
  private onAbortCb: (() => void) | null = null
  private aborted = false

  /** 注册 prompt 回调 */
  onPrompt(cb: (text: string) => void): void {
    this.onPromptCb = cb
  }

  /** 注册 Ctrl+C 回调 */
  onAbort(cb: () => void): void {
    this.onAbortCb = cb
  }

  /** 启动 TUI，开始读输入 */
  start(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    // Ctrl+C → abort（不退出进程）
    process.stdin.on('keypress', (_ch: string, key: any) => {
      if (key?.ctrl && key?.name === 'c' && !this.aborted) {
        this.aborted = true
        this.onAbortCb?.()
      }
    })

    this.prompt()
  }

  private prompt(): void {
    if (!this.rl) return
    this.aborted = false
    this.rl.question('> ', (answer) => {
      const text = answer.trim()
      if (text) this.onPromptCb?.(text)
      this.prompt()
    })
  }

  /** 流式打印 assistant 文本 delta */
  printText(delta: string): void {
    process.stdout.write(delta)
  }

  /** 打印 tool 调用 */
  printToolCall(name: string, args: unknown): void {
    process.stdout.write(`\n[tool: ${name}] ${JSON.stringify(args)}\n`)
  }

  /** 打印 tool 结果 */
  printToolResult(name: string, result: string): void {
    process.stdout.write(`[result: ${name}] ${result}\n`)
  }

  /** 回合结束：换行 */
  printTurnEnd(): void {
    process.stdout.write('\n')
  }

  /** 停止 TUI */
  stop(): void {
    this.rl?.close()
    this.rl = null
  }
}
```

- [ ] **Step 2: 写测试 —— 验证打印方法**

```typescript
// test/tui.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Tui } from '../src/tui.js'

describe('Tui', () => {
  let writes: string[]
  let origWrite: typeof process.stdout.write

  beforeEach(() => {
    writes = []
    origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: any) => {
      writes.push(String(chunk))
      return true
    }) as any
  })

  afterEach(() => {
    process.stdout.write = origWrite
  })

  it('printText 流式追加', () => {
    const tui = new Tui()
    tui.printText('Hel')
    tui.printText('lo')
    expect(writes).toEqual(['Hel', 'lo'])
  })

  it('printToolCall 格式化工具调用', () => {
    const tui = new Tui()
    tui.printToolCall('read_file', { path: 'a.txt' })
    expect(writes.join('')).toContain('[tool: read_file]')
    expect(writes.join('')).toContain('a.txt')
  })

  it('printToolResult 格式化工具结果', () => {
    const tui = new Tui()
    tui.printToolResult('read_file', 'hello')
    expect(writes.join('')).toContain('[result: read_file]')
    expect(writes.join('')).toContain('hello')
  })

  it('printTurnEnd 输出换行', () => {
    const tui = new Tui()
    tui.printTurnEnd()
    expect(writes).toEqual(['\n'])
  })
})
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run test/tui.test.ts`
Expected: 4 个测试通过

- [ ] **Step 4: Commit**

```bash
git add src/tui.ts test/tui.test.ts
git commit -m "feat(tui): minimal terminal UI (readline + streaming + ctrl-c)"
```

---

### Task 4: `tools` 模块 — 4 个内置工具

**Files:**
- Create: `src/tools.ts`
- Test: `test/tools.test.ts`

**Interfaces:**
- Consumes: `AgentTool` from `agent`
- Produces: `builtinTools()` — 返回 AgentTool[]

**学习要点**：每个 tool = `{ name, description, input_schema, execute }`。execute 是 `async (args) => string`。工具是纯函数，不碰 agent 内部状态。

`edit` 用 str_replace 语义：精确匹配 + 唯一性校验。为什么是字符串替换而非行号：模型不需要维护行号状态，更接近 Claude Code / pi 原版。

- [ ] **Step 1: 实现 4 个工具**

```typescript
// src/tools.ts
// 4 个内置工具 —— 能读写改代码并执行验证的最小集。
// 每个 tool 是纯函数：async (args) => string，不碰 agent 状态。

import { promises as fs } from 'node:fs'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import * as path from 'node:path'
import type { AgentTool } from './agent.js'

const execAsync = promisify(exec)

/** read_file：返回文件内容 */
const readFile: AgentTool = {
  name: 'read_file',
  description: '读取文件内容。参数：path（文件路径）',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '要读取的文件路径' },
    },
    required: ['path'],
  },
  execute: async (args) => {
    const content = await fs.readFile(args.path, 'utf-8')
    return content
  },
}

/** write_file：覆盖写入文件 */
const writeFile: AgentTool = {
  name: 'write_file',
  description: '写入文件（覆盖）。参数：path（路径）、content（内容）',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '要写入的文件路径' },
      content: { type: 'string', description: '文件内容' },
    },
    required: ['path', 'content'],
  },
  execute: async (args) => {
    await fs.mkdir(path.dirname(args.path) || '.', { recursive: true })
    await fs.writeFile(args.path, args.content, 'utf-8')
    return `wrote ${args.path} (${args.content.length} chars)`
  },
}

/** edit：局部字符串替换（精确匹配 + 唯一性校验） */
const edit: AgentTool = {
  name: 'edit',
  description: '编辑文件：精确替换一段文本。参数：path、old_string、new_string。old_string 必须在文件中唯一匹配，否则报错。',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      old_string: { type: 'string', description: '要被替换的文本（必须唯一匹配）' },
      new_string: { type: 'string', description: '替换后的文本' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  execute: async (args) => {
    const content = await fs.readFile(args.path, 'utf-8')
    const count = content.split(args.old_string).length - 1
    if (count === 0) throw new Error(`old_string not found in ${args.path}`)
    if (count > 1) throw new Error(`old_string matches ${count} places in ${args.path}, must be unique`)
    const newContent = content.replace(args.old_string, args.new_string)
    await fs.writeFile(args.path, newContent, 'utf-8')
    return `edited ${args.path}: replaced ${args.old_string.length} chars`
  },
}

/** run_bash：执行 shell 命令 */
const runBash: AgentTool = {
  name: 'run_bash',
  description: '执行 shell 命令。参数：command（命令字符串）。返回 stdout+stderr。',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的 shell 命令' },
    },
    required: ['command'],
  },
  execute: async (args) => {
    try {
      const { stdout, stderr } = await execAsync(args.command, { maxBuffer: 1024 * 1024 })
      return stderr ? `[stderr] ${stderr}\n[stdout] ${stdout}` : stdout
    } catch (e: any) {
      return `[exit ${e.code}] ${e.stderr ?? ''}${e.stdout ?? ''}`
    }
  },
}

/** 返回全部内置工具 */
export function builtinTools(): AgentTool[] {
  return [readFile, writeFile, edit, runBash]
}
```

- [ ] **Step 2: 写测试**

```typescript
// test/tools.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { builtinTools } from '../src/tools.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nanopi-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('builtinTools', () => {
  it('返回 4 个工具', () => {
    const tools = builtinTools()
    expect(tools.map(t => t.name).sort()).toEqual(['edit', 'read_file', 'run_bash', 'write_file'])
  })

  it('read_file 读取文件', async () => {
    const tools = builtinTools()
    const read = tools.find(t => t.name === 'read_file')!
    await fs.writeFile(path.join(tmpDir, 'a.txt'), 'hello')
    const result = await read.execute({ path: path.join(tmpDir, 'a.txt') })
    expect(result).toBe('hello')
  })

  it('write_file 写入文件', async () => {
    const tools = builtinTools()
    const write = tools.find(t => t.name === 'write_file')!
    const result = await write.execute({ path: path.join(tmpDir, 'b.txt'), content: 'world' })
    expect(result).toContain('wrote')
    expect(await fs.readFile(path.join(tmpDir, 'b.txt'), 'utf-8')).toBe('world')
  })

  it('write_file 自动创建目录', async () => {
    const tools = builtinTools()
    const write = tools.find(t => t.name === 'write_file')!
    await write.execute({ path: path.join(tmpDir, 'sub', 'c.txt'), content: 'x' })
    expect(await fs.readFile(path.join(tmpDir, 'sub', 'c.txt'), 'utf-8')).toBe('x')
  })

  it('edit 唯一匹配时替换成功', async () => {
    const tools = builtinTools()
    const edit = tools.find(t => t.name === 'edit')!
    const filePath = path.join(tmpDir, 'e.txt')
    await fs.writeFile(filePath, 'foo bar baz')
    const result = await edit.execute({ path: filePath, old_string: 'bar', new_string: 'BAR' })
    expect(result).toContain('edited')
    expect(await fs.readFile(filePath, 'utf-8')).toBe('foo BAR baz')
  })

  it('edit 匹配 0 处时报错', async () => {
    const tools = builtinTools()
    const edit = tools.find(t => t.name === 'edit')!
    const filePath = path.join(tmpDir, 'e2.txt')
    await fs.writeFile(filePath, 'hello')
    await expect(edit.execute({ path: filePath, old_string: 'xyz', new_string: 'XYZ' }))
      .rejects.toThrow('not found')
  })

  it('edit 匹配多处时报错', async () => {
    const tools = builtinTools()
    const edit = tools.find(t => t.name === 'edit')!
    const filePath = path.join(tmpDir, 'e3.txt')
    await fs.writeFile(filePath, 'dup dup')
    await expect(edit.execute({ path: filePath, old_string: 'dup', new_string: 'X' }))
      .rejects.toThrow('unique')
  })

  it('run_bash 执行命令', async () => {
    const tools = builtinTools()
    const bash = tools.find(t => t.name === 'run_bash')!
    const result = await bash.execute({ command: 'echo hello' })
    expect(result.trim()).toBe('hello')
  })

  it('run_bash 命令失败时返回退出码', async () => {
    const tools = builtinTools()
    const bash = tools.find(t => t.name === 'run_bash')!
    const result = await bash.execute({ command: 'exit 3' })
    expect(result).toContain('[exit 3]')
  })
})
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run test/tools.test.ts`
Expected: 8 个测试通过

- [ ] **Step 4: Commit**

```bash
git add src/tools.ts test/tools.test.ts
git commit -m "feat(tools): read_file, write_file, edit, run_bash"
```

---

### Task 5: `cli` 模块 — 拼装 + session 持久化

**Files:**
- Create: `src/cli.ts`

**Interfaces:**
- Consumes: `runAgent` from `agent`, `Tui` from `tui`, `builtinTools` from `tools`, `Model`, `Context` from `llm`
- Produces: `main()` 入口

**学习要点**：cli 是唯一入口，把 4 个模块粘起来。session 持久化 = 每轮 append JSONL。

- [ ] **Step 1: 实现 main()**

```typescript
// src/cli.ts
// 拼装层 —— 把 llm / agent / tui / tools 粘起来，是唯一入口。
// session 持久化：每轮结束把 context.messages append 到 ~/.nanopi/session.jsonl。

import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { runAgent } from './agent.js'
import { Tui } from './tui.js'
import { builtinTools } from './tools.js'
import type { Model, Context, Message } from './llm.js'

const SESSION_DIR = path.join(os.homedir(), '.nanopi')
const SESSION_FILE = path.join(SESSION_DIR, 'session.jsonl')

/** 固定 system prompt */
const SYSTEM_PROMPT = '你是一个编码助手。用提供的工具读写文件和执行命令来完成任务。先阅读再修改，修改后可运行命令验证。'

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('请设置 ANTHROPIC_API_KEY 环境变量')
    process.exit(1)
  }

  const model: Model = {
    apiKey,
    model: process.env.NANOPI_MODEL ?? 'claude-sonnet-4-5',
    maxTokens: 4096,
  }

  // 初始化 context：system prompt + 历史（教学版每次启动从空开始）
  const context: Context = { messages: [{ role: 'user', content: SYSTEM_PROMPT }] as Message[] }
  // 注：Anthropic API 的 system 不走 messages，这里简化处理作为第一条 user msg

  const tools = builtinTools()
  const tui = new Tui()

  // 每轮：用户输入 → runAgent → 事件转发到 TUI → 持久化
  tui.onPrompt(async (text) => {
    context.messages.push({ role: 'user', content: text })

    const ctrl = new AbortController()
    tui.onAbort(() => ctrl.abort())

    for await (const ev of runAgent(model, context, tools, ctrl.signal)) {
      switch (ev.type) {
        case 'assistant_text': tui.printText(ev.delta); break
        case 'tool_call': tui.printToolCall(ev.name, ev.args); break
        case 'tool_result': tui.printToolResult(ev.name, ev.result); break
        case 'turn_end': tui.printTurnEnd(); break
      }
    }

    // 持久化：把本轮新增的 messages append 到 session.jsonl
    await persistSession(context.messages)
  })

  tui.start()
}

async function persistSession(messages: Message[]): Promise<void> {
  await fs.mkdir(SESSION_DIR, { recursive: true })
  // append 最新一条 message（避免重复写整个数组）
  const last = messages[messages.length - 1]
  if (last) await fs.appendFile(SESSION_FILE, JSON.stringify(last) + '\n', 'utf-8')
}

main().catch((e) => {
  console.error(e)
  persistSession([]) // 确保不丢已写的
  process.exit(1)
})
```

- [ ] persistSession 的逻辑需要修正：每轮 append 本轮新增的所有 message（可能多条），不是只 append 最后一条。修正：

```typescript
// 修正后的持久化逻辑：记录已持久化的 message 数量，只 append 新增的
let persistedCount = 0

async function persistSession(messages: Message[]): Promise<void> {
  await fs.mkdir(SESSION_DIR, { recursive: true })
  const newMessages = messages.slice(persistedCount)
  for (const msg of newMessages) {
    await fs.appendFile(SESSION_FILE, JSON.stringify(msg) + '\n', 'utf-8')
  }
  persistedCount = messages.length
}
```

- [ ] **Step 2: 验证 cli 能编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 验证完整测试套件**

Run: `npx vitest run`
Expected: 全部测试通过（llm 5 + agent 3 + tui 4 + tools 8 = 20 个）

- [ ] **Step 4: 烟雾测试 —— 干跑 main 逻辑（mock）**

写一个临时脚本验证拼装逻辑正确（不依赖真实 API key）：

```bash
# 验证 cli.ts 能被 tsx 加载且不立即崩溃（不设 API key 应打印提示）
ANTHROPIC_API_KEY="" npx tsx src/cli.ts 2>&1 | head -1
```
Expected: 输出 "请设置 ANTHROPIC_API_KEY 环境变量"

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): wire llm+agent+tui+tools, session JSONL persistence"
```

---

### Task 6: 端到端验证 + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: 完整构建验证**

Run: `npm run build`
Expected: dist/ 生成，无错误

- [ ] **Step 2: 全量测试**

Run: `npx vitest run`
Expected: 20 个测试全通过

- [ ] **Step 3: 写 README**

```markdown
# nanopi

从 0 手撕出一个 PI agent —— 极简克制教学版。

复刻 [pi-mono](https://github.com/badlogic/pi-mono) 的四模块架构，每砍一刀的原则是：这个概念是不是"agent 是什么"的核心。

## 四个模块

| 模块 | 对应 pi-mono | 做什么 | 行数 |
|------|-------------|--------|------|
| `llm` | pi-ai | 统一 LLM API：SSE → 事件流 | ~150 |
| `agent` | pi-agent-core | Agent Loop：LLM ↔ tool 循环 | ~80 |
| `tui` | pi-tui | 单行输入 + 流式输出 + Ctrl+C | ~100 |
| `cli` | pi-coding-agent | 拼装层 + 4 个内置 tool + session | ~150 |

## 快速开始

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

## 砍掉了什么（及为什么）

| pi-mono 概念 | nanopi | 为什么砍 |
|---|---|---|
| 多 provider 适配 | 单 provider | LLM API 脏活，非 agent 灵魂 |
| differential renderer | line-based stdout | TUI 框架的功课 |
| cost/token tracking | 无 | 运维，非学习 |
| context handoff | 无 | 高级特性 |
| split tool results | 无 | UI 精化 |
| session branching | 单文件 JSONL | 管理功能 |
| slash commands / extensions | 无 | 扩展机制 |
| compaction | 无 | 长上下文优化 |

## 架构图

见 `docs/specs/2026-08-08-nanopi-design.md`。
```

- [ ] **Step 4: 最终 commit**

```bash
git add README.md
git commit -m "docs: README + end-to-end verification"
```

---

## Self-Review

**1. Spec coverage:**
- ✓ Module 1 `llm`: Task 1（stream + SSE 解析 + abort + buildAssistantMessage/buildToolResultMessage）
- ✓ Module 2 `agent`: Task 2（runAgent while 循环 + tool 执行 + 把结果放回到 Context）
- ✓ Module 3 `tui`: Task 3（Tui 类 readline + printText + Ctrl+C）
- ✓ Module 4 `cli`: Task 5（main 拼装 + 4 工具 + session JSONL）
- ✓ `edit` tool str_replace 语义: Task 4（精确匹配 + 唯一性校验）
- ✓ session 持久化: Task 5（append JSONL）
- ✓ 架构图 + 砍掉映射: design spec 文档

**2. Placeholder scan:** 无 TBD / TODO（除 TODO 注释标记实现位置，这是 TDD 的 step 占位）。Step 2/3 的代码块都是完整实现。

**3. Type consistency:**
- `StreamEvent`（llm）→ `runAgent` 消费 → `AgentEvent`（agent）转发
- `AgentTool`（agent 定义）→ `tools.ts` 实现 → `cli` 调 `builtinTools()`
- `Model` / `Context` / `Message`（llm 定义）→ agent / cli 消费
- `ContentBlock` / `tool_use_id` 命名跨模块一致
