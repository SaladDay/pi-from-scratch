// test/e2e.ts — 端到端真实测试
// 用 GLM-5.2 验证 nanopi 的 stream + runAgent + tools 跨模块集成。
// 用法: npx tsx test/e2e.ts

import { promises as fs } from 'node:fs'
import { runAgent } from '../src/agent.js'
import { builtinTools } from '../src/tools.js'
import type { Model, Context } from '../src/llm.js'

const MODEL = process.env.NANOPI_MODEL ?? 'glm-5.2'
const BASE_URL = process.env.NANOPI_BASE_URL ?? 'https://api.openai.com/v1'
const API_KEY = process.env.NANOPI_API_KEY
if (!API_KEY) { console.error('请设置 NANOPI_API_KEY 环境变量'); process.exit(1) }

async function main() {
  const model: Model = { apiKey: API_KEY, model: MODEL, baseUrl: BASE_URL, maxTokens: 4096 }
  const tools = builtinTools()
  const context: Context = {
    systemPrompt: '你是一个编码助手。用提供的工具读写文件和执行命令来完成任务。',
    messages: [{ role: 'user', content: '请在 /tmp/nanopi-e2e-test.txt 写入 "Hello from nanopi!"，然后用 read_file 读取它确认内容。' }],
  }

  console.log('=== nanopi E2E 测试 (GLM-5.2) ===\n')

  let eventCount = 0
  for await (const ev of runAgent(model, context, tools)) {
    eventCount++
    switch (ev.type) {
      case 'assistant_text': process.stdout.write(ev.delta); break
      case 'tool_call': console.log(`\n  [tool_call] ${ev.name} ${JSON.stringify(ev.args)}`); break
      case 'tool_result': console.log(`  [tool_result] ${ev.result.slice(0, 200)}`); break
      case 'turn_end': console.log(`\n  [turn_end] stopReason=${ev.stopReason}`); break
    }
  }

  console.log(`\n=== 完成：${eventCount} 个事件，${context.messages.length} 条消息 ===`)

  try {
    const content = await fs.readFile('/tmp/nanopi-e2e-test.txt', 'utf-8')
    console.log(content === 'Hello from nanopi!' ? '✅ 文件内容正确' : `❌ 文件内容不符: "${content}"`)
    await fs.unlink('/tmp/nanopi-e2e-test.txt')
  } catch {
    console.log('❌ 文件未创建')
  }
}

main().catch(console.error)
