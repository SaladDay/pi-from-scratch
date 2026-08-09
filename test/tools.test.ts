// test/tools.test.ts
// 测试 4 个内置工具的核心功能。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { builtinTools } from '../src/tools.js'
import type { AgentTool } from '../src/agent.js'

let tmpDir: string

beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nanopi-test-')) })
afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }) })

function findTool(tools: AgentTool[], name: string): AgentTool {
  return tools.find(t => t.name === name)!
}

describe('builtinTools', () => {
  it('返回 4 个工具', () => {
    expect(builtinTools().map(t => t.name).sort()).toEqual(['edit', 'read_file', 'run_bash', 'write_file'])
  })

  it('read_file 读取文件', async () => {
    const read = findTool(builtinTools(), 'read_file')
    await fs.writeFile(path.join(tmpDir, 'a.txt'), 'hello')
    expect(await read.execute({ path: path.join(tmpDir, 'a.txt') })).toBe('hello')
  })

  it('write_file 写入文件', async () => {
    const write = findTool(builtinTools(), 'write_file')
    await write.execute({ path: path.join(tmpDir, 'b.txt'), content: 'world' })
    expect(await fs.readFile(path.join(tmpDir, 'b.txt'), 'utf-8')).toBe('world')
  })

  it('edit 唯一匹配时替换成功', async () => {
    const edit = findTool(builtinTools(), 'edit')
    const filePath = path.join(tmpDir, 'e.txt')
    await fs.writeFile(filePath, 'foo bar baz')
    await edit.execute({ path: filePath, old_string: 'bar', new_string: 'BAR' })
    expect(await fs.readFile(filePath, 'utf-8')).toBe('foo BAR baz')
  })

  it('edit 匹配 0 处时报错', async () => {
    const edit = findTool(builtinTools(), 'edit')
    const filePath = path.join(tmpDir, 'e2.txt')
    await fs.writeFile(filePath, 'hello')
    await expect(edit.execute({ path: filePath, old_string: 'xyz', new_string: 'XYZ' })).rejects.toThrow('not found')
  })

  it('edit 匹配多处时报错', async () => {
    const edit = findTool(builtinTools(), 'edit')
    const filePath = path.join(tmpDir, 'e3.txt')
    await fs.writeFile(filePath, 'dup dup')
    await expect(edit.execute({ path: filePath, old_string: 'dup', new_string: 'X' })).rejects.toThrow('unique')
  })

  it('run_bash 执行命令', async () => {
    const bash = findTool(builtinTools(), 'run_bash')
    expect((await bash.execute({ command: 'echo hello' })).trim()).toBe('hello')
  })
})
