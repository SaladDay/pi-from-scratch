// test/cli.test.ts
// 测试 session 持久化的核心 round-trip。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { loadSession, persistSession } from '../src/cli.js'
import type { Message } from '../src/llm.js'

let tmpFile: string

beforeEach(() => { tmpFile = path.join(os.tmpdir(), `nanopi-session-${Date.now()}.jsonl`) })
afterEach(async () => { await fs.rm(tmpFile, { force: true }) })

describe('session persistence', () => {
  it('persist → load round-trip', async () => {
    const messages: Message[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]
    await persistSession(messages, tmpFile)
    expect(await loadSession(tmpFile)).toEqual(messages)
  })
})
