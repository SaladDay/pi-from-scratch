// test/tui.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Tui } from '../src/tui.js'

describe('Tui', () => {
  let writes: string[]
  let origWrite: typeof process.stdout.write

  beforeEach(() => {
    writes = []
    origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      writes.push(String(chunk))
      return true
    }) as typeof process.stdout.write
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
    const out = writes.join('')
    expect(out).toContain('[tool: read_file]')
    expect(out).toContain('a.txt')
  })

  it('printToolResult 格式化工具结果', () => {
    const tui = new Tui()
    tui.printToolResult('read_file', 'hello')
    const out = writes.join('')
    expect(out).toContain('[result: read_file]')
    expect(out).toContain('hello')
  })

  it('printTurnEnd 输出换行', () => {
    const tui = new Tui()
    tui.printTurnEnd()
    expect(writes).toEqual(['\n'])
  })
})
