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

// 记录已持久化的 message 数量，只 append 新增的。
// 这是 CLI 进程级状态（非 agent 状态——agent 本身无状态，context 就是状态）。
let persistedCount = 0

async function main() {
  const apiKey = process.env.NANOPI_API_KEY
  if (!apiKey) {
    console.error('请设置 NANOPI_API_KEY 环境变量')
    process.exit(1)
  }

  const model: Model = {
    apiKey,
    model: process.env.NANOPI_MODEL ?? 'glm-5.2',
    baseUrl: process.env.NANOPI_BASE_URL ?? 'https://api.openai.com/v1',
    maxTokens: 4096,
  }

  // 初始化 context：system prompt 用专用字段，messages 从 session 文件加载
  const context: Context = {
    systemPrompt: SYSTEM_PROMPT,
    messages: await loadSession(),
  }

  const tools = builtinTools()
  const tui = new Tui()

  // 每轮：用户输入 → runAgent → 事件转发到 TUI → 持久化
  tui.onPrompt(async (text) => {
    try {
      context.messages.push({ role: 'user', content: text })

      tui.setBusy(true)
      const ctrl = new AbortController()
      tui.onAbort(() => ctrl.abort())  // 每轮新建 AbortController，需重新注册回调指向新的 controller

      for await (const ev of runAgent(model, context, tools, ctrl.signal)) {
        switch (ev.type) {
          case 'assistant_text': tui.printText(ev.delta); break
          case 'tool_call': tui.printToolCall(ev.name, ev.args); break
          case 'tool_result': tui.printToolResult(ev.name, ev.result); break
          case 'turn_end':
            if (ev.stopReason === 'max_tokens') tui.printText('\n[output truncated by max_tokens]')
            if (ev.stopReason === 'error') tui.printText('\n[error occurred]')
            tui.printTurnEnd()
            break
        }
      }

      await persistSession(context.messages)
    } catch (e) {
      console.error(`\n[error] ${(e as Error).message}`)
    } finally {
      tui.setBusy(false)
    }
  })

  tui.start()

}

/** 启动时加载历史 messages，恢复上次对话（导出供测试） */
export async function loadSession(file: string = SESSION_FILE): Promise<Message[]> {
  try {
    const data = await fs.readFile(file, 'utf-8')
    const lines = data.trim().split('\n').filter(Boolean)
    // 逐行容错：跳过损坏行而非丢弃全部历史（进程崩溃可能写出半行 JSON）
    const messages = lines.flatMap(line => {
      try { return [JSON.parse(line) as Message] } catch { return [] }
    })
    persistedCount = messages.length  // 已加载的不重复写
    return messages
  } catch {
    return []  // 文件不存在，从空开始
  }
}

/** 持久化 messages 到 session 文件（导出供测试） */
export async function persistSession(messages: Message[], file: string = SESSION_FILE): Promise<void> {
  await fs.mkdir(path.dirname(file) || '.', { recursive: true })
  const newMessages = messages.slice(persistedCount)
  for (const msg of newMessages) {
    await fs.appendFile(file, JSON.stringify(msg) + '\n', 'utf-8')
  }
  persistedCount = messages.length
}

// 只在直接运行时启动（非 import 时）
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
