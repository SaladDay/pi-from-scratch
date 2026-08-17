第一章看了地图，知道五个文件各管什么。右侧现在已经有五个空文件。这一章跟着数据流一步步把它们填起来，需要什么，就写什么。


## agent 到底是什么

一个普通的 LLM 聊天程序，你问一句它答一句。agent 多了一个能力：LLM 可以调工具。它读到你的问题，觉得需要先看看某个文件，发出一个 tool_call，程序帮它执行完，把结果喂回去，它再接着想。反复这个过程，直到它觉得事情做完了，直接回复你。

<!-- checkpoint: pseudo-loop -->

先不管细节，只把循环的几个位置摆出来。右侧的 `src/agent.ts` 现在只有一副骨架：准备本轮数据、问 LLM、判断要不要停、执行工具、把结果放回 Context。循环内部还是空的，后面会一段一段填上。

<details class="syntax-block">
<summary class="syntax-toggle">语法速查</summary>
<div class="syntax-body">

**`export`** — 标记"这个函数可以被其他文件引用"。不写 `export` 的东西只在当前文件内部可见。

**`async`** — 函数里需要等待异步操作（比如网络请求），程序不会卡住。

**`: Context`** — 冒号后面是参数的类型。这里先写下 `Context` 这个名字，稍后在 `llm.ts` 里定义它的具体形状。

</div>
</details>

这副骨架暂时还不能运行，`Model`、`Context`、`AgentTool` 和 `AgentEvent` 也都还没定义。注释编号暂时不连续，空着的 0、3、6 是后面才会插入的小细节。现在只需要记住数据流的顺序，后面每一轮出现的代码都会回填这些位置。


## 怎么跟 LLM 说话

骨架里的第一件事是"问 LLM"。怎么问？LLM 的 API 就是一个 HTTP 接口，你 POST 一段聊天记录过去，它返回模型的回复。但发 HTTP 请求、处理网络错误这些脏活不该散落在代码各处，集中封一个函数比较好。

> 如果你正在寻找稳定可靠、模型选择丰富的 AI API，可以试试 [OpenModel](https://www.openmodel.ai?ref=JGDNqZl8)。一个接口即可调用 50+ 主流模型，并提供生产级 SLA 保障，省去频繁切换平台的麻烦。

这时候聪明的读者想起了第一章中的llm.ts，他就是做这个的。

<!-- checkpoint: llm-types -->

造这个函数之前先定义几种数据形状。函数需要知道往哪发（Model 配置）、发什么（Context），它吐出来的东西也得有个统一格式（StreamEvent）。回复里可能同时包含文本和 tool_call，所以单条消息还得拆成更细的 ContentBlock。这些类型全部放在 `llm.ts` 的最前面。

Context 的结构很简单，一个 `systemPrompt` 加一个 `messages` 数组，纯 JSON。

```json
{
  "systemPrompt": "你是一个编码助手。",
  "messages": [
    { "role": "user", "content": "读一下 hello.txt" },
    { "role": "assistant", "content": [
      { "type": "text", "text": "我来读取这个文件。" },
      { "type": "tool_use", "id": "call_1", "name": "read_file", "input": {"path": "hello.txt"} }
    ]},
    { "role": "user", "content": [
      { "type": "tool_result", "tool_use_id": "call_1", "content": "hello world" }
    ]}
  ]
}
```

`tool_result` 嵌在 user message 里作为 content 的一部分，整个数组可以直接 `JSON.stringify` 保存。

最后一个 `ToolDef` 是交给 LLM API 的精简工具描述，只保留 name、description 和 parameters，不包含真正执行代码的 execute。

<details class="syntax-block">
<summary class="syntax-toggle">语法速查</summary>
<div class="syntax-body">

**`type`** — 可以理解成class、结构体等。`type Model = { apiKey: string; model: string }` 说的是"Model 对象里必须有 apiKey 和 model 两个字符串字段"。

**`|`（联合类型）** — `A | B | C` 表示"这个变量可能是 A，也可能是 B，也可能是 C"。

**`?`（可选属性）** — `baseUrl?: string` 的 `?` 表示这个字段可以不填。

</div>
</details>

<!-- checkpoint: llm-stream -->

类型定义好以后，`stream()` 的签名就很自然了。右侧的 `src/llm.ts` 里现在有了这些类型加上一个函数骨架。

```typescript
async function* stream(model, context, opts): AsyncGenerator<StreamEvent>
```

它是个异步生成器，调用方用 `for await` 一个一个收事件。

<details class="syntax-block">
<summary class="syntax-toggle">语法速查</summary>
<div class="syntax-body">

**`async function*`** — 异步生成器。比普通 `async function` 多一个 `*`，调用方用 `for await...of` 一个个收。

</div>
</details>

LLM 的回复是流式的，用的是 SSE 协议。服务器不是一口气返回全部内容，而是一行一行往回推数据，每行以 `data: ` 开头，LLM 的"打字机效果"就靠这个。

比如问模型"1+1等于几"，收到的 SSE 流大概长这样：

```
data: {"choices":[{"delta":{"content":"1"},"finish_reason":null}]}
data: {"choices":[{"delta":{"content":"+"},"finish_reason":null}]}
data: {"choices":[{"delta":{"content":"1"},"finish_reason":null}]}
data: {"choices":[{"delta":{"content":"="},"finish_reason":null}]}
data: {"choices":[{"delta":{"content":"2"},"finish_reason":null}]}
data: {"choices":[{"delta":{},"finish_reason":"stop"}]}
data: [DONE]
```

每行一个 chunk，`delta.content` 是模型这一步生成的文本片段，最后一个 `finish_reason: "stop"` 表示模型说完了。

<!-- checkpoint: llm-request -->

### 先把请求发出去

`stream()` 先把 Model 和 Context 组装成 OpenAI 兼容的请求。地址来自 `model.baseUrl`，聊天记录由 `contextToOpenAIMessages()` 转成 API 需要的格式；如果这一轮允许调用工具，再把 tools 一起放进 body。

然后调用 `fetch()`。请求被用户中断时发出 `aborted`，其他网络错误发出 `error`。HTTP 状态码不成功，或者响应里没有 body，也统一变成 `error` 事件。右侧这一轮只补请求部分，还没有开始读 SSE。

<!-- checkpoint: llm-sse-parse -->

### API响应后，先翻译一个 chunk

一行 SSE 去掉 `data: ` 以后就是一个 JSON chunk。`handleSSELine()` 负责翻译这一行：有 `delta.content` 就取出文本，有 tool_call 分片就按 index 累积 name 和 arguments。

tool_call 的参数也是 JSON，但分片到达时不一定刚好是完整的键值对，所以暂时存在 `toolCallBuffers` 里。整个流读完后，`flushToolCalls()` 再把这些分片拼成完整参数。

`finish_reason` 也在这里做第一次转换：`tool_calls` 变成 `tool_use`，`length` 变成 `max_tokens`。

<!-- checkpoint: llm-stream-read -->

### chunk 翻译完了，再把整条流读完

现在把单行解析接回 `stream()`。`reader.read()` 不断拿网络数据，`TextDecoder` 把字节变成文字，`buf` 留住末尾还没凑成完整一行的部分。每找到一个换行，就取出一条 `data: ` 交给 `handleSSELine()`。

文本片段立即 `yield text_delta`。流结束以后，再把缓存的 tool_calls 逐个发出，最后发一个 `done`。到这里，一条原始 SSE 响应就被翻译成了 `text_delta`、`tool_call`、`done` 或 `error`。

<!-- checkpoint: llm-helpers -->

nanopi 内部的消息格式跟 OpenAI API 要求的格式有差异。比如 tool_result 在 nano-pi 里嵌在 user message 内部，OpenAI 要求拆成独立的 `role: "tool"` 消息。`contextToOpenAIMessages()` 在发请求前逐条转换：普通文本保留 user 或 assistant，tool_use 变成 `tool_calls`，tool_result 变成 `role: "tool"`。不过这都是一些小细节，我们为什么不保持和openai api格式一样呢？其实很好理解，因为我们要兼容很多provider，无论和谁的格式一样，最后都会和另一家有所差异，那不然就用我们最顺手的数据结构。

<!-- checkpoint: llm-message-builders -->

API 回复也要装回 nanopi 自己的 Context。`buildAssistantMessage()` 把本轮文本和 tool_calls 合成一条 assistant message；`buildToolResultMessage()` 把执行结果合成一条带 tool_result blocks 的 user message。

下一节写 agent loop 时会直接调用这两个函数。


## LLM 要调工具，工具哪来

骨架里还有一个"执行工具"的位置。工具得有人定义。

nanopi 定义了四个工具，都在 `tools.ts` 里。第一章说过，读文件、写文件、改文件、跑命令，这四个构成了一个 coding agent 能干活的最小集。pi 的 agent-core 层也是这四个。

<!-- checkpoint: agent-tool-type -->

runAgent 接收的是一组工具，所以先在 `agent.ts` 里定义共同的形状。每个工具都是一个 `AgentTool` 对象。

```typescript
type AgentTool = {
  name: string
  description: string
  parameters: object    // JSON Schema，告诉模型这个工具需要什么参数
  execute: (args: unknown, signal?: AbortSignal) => Promise<string>
}
```

`name` 和 `description` 是给模型看的，模型根据这些信息决定要不要调这个工具。`parameters` 是一份 JSON Schema，告诉模型参数长什么样。`execute` 是真正干活的函数，接收模型传来的参数，返回一个字符串结果。

<!-- checkpoint: tools-structure -->

现在切到 `tools.ts`，先拿 `read_file` 写出一个具体工具的外壳。

右侧现在只写了 `readFile` 的 name、description、parameters 和一个空的 execute。先看清每个字段放在哪里，下一轮再让它真的去读文件。

<!-- checkpoint: tools-read -->

### read_file：读文件

`execute` 从参数里取出 path，调用 `fs.readFile()` 读取文本，然后交给 `truncateOutput()`。如果输出不超过 200 行就原样返回；超过时只把最后 200 行交给模型，完整内容存进临时文件【同时把路径告诉LLM，agnet想读的话可以自己去读】。

尾部优先是因为命令和编译器的错误信息通常出现在最后。截断发生在工具内部，agent loop 不需要知道。

<!-- checkpoint: tools-write -->

### write_file：写文件

`write_file` 接收 path 和 content。它先用 `fs.mkdir(..., { recursive: true })` 补齐父目录，再用 `fs.writeFile()` 覆盖文件，最后返回写入了哪个路径和多少字符。

<!-- checkpoint: tools-edit -->

### edit：改一小段

`edit` 不接收行号，而是接收 `old_string` 和 `new_string`。它先检查 old_string 在文件里恰好出现一次：找不到就报错，出现多次也报错，只有唯一匹配才执行替换。

不用行号是因为连续编辑后行号会漂移。精确字符串还能让一次修改的范围保持清楚。

替换时传入 `() => new_string`，是为了避免 new_string 里的 `$&`、`$1` 等字符被 `String.replace()` 当成特殊指令。

<!-- checkpoint: tools-bash -->

### run_bash：执行命令

最后一个工具用 `execAsync()` 执行命令，收集 stdout 和 stderr，并复用 `truncateOutput()` 控制输出长度。AbortSignal 会一路传进命令执行；用户中断时返回 `aborted`。

命令本身失败时不向外抛异常，而是把 exit code、stderr 和 stdout 拼成字符串返回。对 agent 来说，成功和失败都是可以继续读的一条 tool_result。

文件末尾的 `builtinTools()` 把 read、write、edit 和 run_bash 放进同一个数组。cli 只要调用这个函数，就能拿到完整的工具注册表。


## 把循环补完整

循环骨架有了，`stream()` 能跟 LLM 说话了，四个工具也准备好了。现在回到那个 while 循环，把它写成真正能跑的代码。

<!-- checkpoint: agent-types -->

工具的输入形状已经有了。正式填循环之前，再定义它向外吐出的四种 `AgentEvent`：模型文字、工具调用、工具结果和本轮结束。

```typescript
type AgentEvent =
  | { type: 'assistant_text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: string }
  | { type: 'turn_end'; stopReason: 'end_turn' | 'max_tokens' | 'aborted' | 'error' }
```

TUI 不需要认识 LLM 的原始事件，也不需要知道工具怎么执行。它只消费这四种 AgentEvent。

<!-- checkpoint: agent-loop -->

`agent.ts` 里的 `runAgent()` 就是这个循环。它是一个 async generator，每产生一个事件就 `yield` 出去，外层可以一个一个接收。

<details class="syntax-block">
<summary class="syntax-toggle">语法速查</summary>
<div class="syntax-body">

**`yield`** — 生成器函数里往外吐值。`yield { type: 'assistant_text', delta: 'hello' }` 往外丢一个事件，函数暂停在这里等调用方处理完。

**`for await...of`** — 遍历异步可迭代对象。`for await (const ev of runAgent(...))` 的意思是 runAgent 每吐一个事件就拿 ev 接住，执行循环体，再等下一个。

</div>
</details>

```typescript
async function* runAgent(model, context, tools, signal): AsyncGenerator<AgentEvent>
```

现在右侧的循环代码已经补全了，来看循环：

先调 `stream()` 拿到这一轮的 LLM 回复。一边消费 StreamEvent，一边把 `text_delta` 转成 `assistant_text` yield 出去（让 UI 实时显示），同时把 `tool_call` 事件收集起来。

等这轮 stream 结束，需要把模型的回复塞回 context。怎么塞？`llm.ts` 导出了 `buildAssistantMessage()`，把这一轮收集到的文本和 tool_calls 打包成一条 assistant message 就行。

然后看 tool_calls 数组。空的，循环结束。不为空，挨个执行，每执行完一个就 yield 一个 `tool_result` 事件出去。工具名不存在，或者 execute 抛出异常，都转换成 `error: ...` 字符串，仍然作为一条工具结果放回到 Context【错误也是一种值得被LLM读的信息，也是重要的上下文】。

全部执行完，结果也要塞回 context，用的是 `llm.ts` 的另一个辅助函数 `buildToolResultMessage()`，把结果打包成一条带 tool_result 的 user message。塞完，进入下一轮循环。API 偶尔会给出 `tool_use` stopReason 却没有任何 tool_call，这种畸形回复按普通的 `end_turn` 结束。

```typescript
while (true) {
  // 流式调用 LLM
  let text = ''
  const toolCalls = []
  for await (const ev of stream(model, context, { tools: toolDefs, signal })) {
    if (ev.type === 'text_delta') {
      text += ev.delta
      yield { type: 'assistant_text', delta: ev.delta }
    } else if (ev.type === 'tool_call') {
      toolCalls.push(ev)
      yield { type: 'tool_call', id: ev.id, name: ev.name, args: ev.args }
    }
    // aborted 和 error 的处理先省略
  }

  // assistant 回复塞回 context
  context.messages.push(buildAssistantMessage(text, toolCalls))

  // 没有 tool_call，循环结束
  if (toolCalls.length === 0) {
    yield { type: 'turn_end', stopReason: 'end_turn' }
    return
  }

  // 执行 tool_calls，把结果放回到 Context
  const results = []
  for (const tc of toolCalls) {
    const tool = toolMap.get(tc.name)
    const result = tool ? await tool.execute(tc.args, signal) : `error: tool "${tc.name}" not found`
    results.push({ tool_use_id: tc.id, content: result })
    yield { type: 'tool_result', id: tc.id, name: tc.name, result }
  }
  context.messages.push(buildToolResultMessage(results))
}
```

这就是 agent loop 的核心。和开头那段伪代码对照一下，结构一模一样，只是多了事件 yield 和 context 管理。

跑一遍具体的例子看看 context 怎么变化。假设用户说"读一下 hello.txt"。

循环开始前，context.messages 只有一条：

```json
[
  { "role": "user", "content": "读一下 hello.txt" }
]
```

第一轮 stream 结束，模型回了一段文本和一个 tool_call。`buildAssistantMessage()` 把它们打包塞回 context，现在 messages 有两条：

```json
[
  { "role": "user", "content": "读一下 hello.txt" },
  { "role": "assistant", "content": [
    { "type": "text", "text": "我来读取这个文件。" },
    { "type": "tool_use", "id": "call_1", "name": "read_file", "input": {"path": "hello.txt"} }
  ]}
]
```

有 tool_call，不退出循环。执行 `read_file`，拿到 `"hello world"`。`buildToolResultMessage()` 把结果打包塞回 context，现在三条：

```json
[
  { "role": "user", "content": "读一下 hello.txt" },
  { "role": "assistant", "content": [
    { "type": "text", "text": "我来读取这个文件。" },
    { "type": "tool_use", "id": "call_1", "name": "read_file", "input": {"path": "hello.txt"} }
  ]},
  { "role": "user", "content": [
    { "type": "tool_result", "tool_use_id": "call_1", "content": "hello world" }
  ]}
]
```

进入第二轮 stream。模型看到 tool_result，回了一段纯文本"文件内容是 hello world。"，没有 tool_call。塞回 context，现在四条。tool_calls 数组为空，循环结束。

context 就是这么一条一条长起来的。每轮 stream 加一条 assistant message，有 tool 执行就再加一条 tool_result message，然后进入下一轮。这就是第一章说的"context 就是纯数据"的含义，整个对话历史、包括工具调用和结果，全在这个 JSON 数组里。

<details class="syntax-block">
<summary class="syntax-toggle">语法速查</summary>
<div class="syntax-body">

**`Map`** — 键值对容器。`toolMap.get(tc.name)` 根据键拿值，`new Map(tools.map(t => [t.name, t]))` 把数组转成 `[键, 值]` 对再塞进 Map。

**`??`（空值合并）** — `a ?? b`：如果 a 是 `null` 或 `undefined` 就用 b。

**`=>`（箭头函数）** — 函数简写。`(args) => result` 等价于 `function(args) { return result }`。

</div>
</details>

把这段过程画成数据流，就是下面这张图。实线是会更新 Context 的主循环：Context 先进入 `stream()`，agent 收到 StreamEvent 后，把 assistant message 和可能出现的 tool_result 写回 Context。虚线是 agent 发给 UI 的 AgentEvent，它只负责把过程展示出来，不会改变下一轮输入。

![一轮 Agent Loop 的内部数据流](/figures/agent-data-flow.png)

数据闭环在 Context、stream、agent 和 tool。UI 挂在循环外面，换成终端、网页或者日志记录器，都不会改动 agent loop。

图里画的是一轮顺利跑完的情况。真实 API 也会在半路停下来，agent 必须先判断手里的数据是否完整，再决定能不能继续执行工具。


先看最常见的一种：回复撞上了长度上限。


<!-- checkpoint: agent-max-tokens -->

### 边界情况一：max_tokens 截断

模型的输出有长度上限（由 `model.maxTokens` 控制）。如果模型的回复太长，会被 API 强制截断，`finish_reason` 返回 `length`（nanopi 映射成 `max_tokens`）。

截断本身不可怕，文本截了就截了，读者能看到已输出的部分。可怕的是 tool_call 被截断。tool_call 的参数是 JSON，截了以后变成半截 JSON，解析出来的参数是残缺的。拿这个残缺参数去执行工具，轻则报错，重则写坏文件。

nanopi 的处理很保守。如果 `stopReason === 'max_tokens'` 且有 tool_calls，不执行，而是把一条错误消息放回到 Context，告诉模型"你的输出被截断了，参数可能不完整，请重新发"。

```typescript
if (stopReason === 'max_tokens' && toolCalls.length > 0) {
  const results = toolCalls.map(tc => ({
    tool_use_id: tc.id,
    content: `error: output truncated by max_tokens, tool "${tc.name}" args may be incomplete.`,
  }))
  context.messages.push(buildToolResultMessage(results))
  continue  // 进入下一轮，让模型重试
}
```

模型收到这条错误后通常会重新发一遍完整的 tool_call。


<!-- checkpoint: agent-abort -->

### 边界情况二：abort

`AbortController` 是 JavaScript 内置的取消开关。controller 负责触发中断，signal 负责把中断状态沿着调用链传下去。每轮开始时，CLI 创建一个 `AbortController`，把 `ctrl.signal` 交给 `runAgent()`。TUI 捕获 Ctrl+C 后调用的是 `ctrl.abort()`，signal 自己没有 `abort()` 方法。

`Ctrl+C → tui.onAbort() → ctrl.abort() → ctrl.signal → runAgent() → stream() / tool.execute()`

`runAgent()` 把同一个 signal 继续传给 `stream()` 和 `tool.execute()`。`stream()` 再把它传给 `fetch()`；执行 `run_bash` 时，signal 还会传给正在运行的子进程。abort 可能发生在任何时刻，正在等 LLM 回复、正在执行工具，都有可能。signal 只负责通知这些任务停下来，不会替 agent 清理 Context，下面两种处理讲的就是中断以后怎样收尾。

如果 abort 发生在等待 LLM 回复时，`fetch()` 会停止，`stream()` 发出一个 `stopReason: 'aborted'` 的 done 事件。agent 保存已经收到的文本；如果模型已经发出了 tool_call 但还没执行，就丢掉这些 tool_calls，不把它们塞进 Context。OpenAI 的 API 要求每个 tool_call 都有对应的 tool_result。如果 Context 里留着一个没有结果的 tool_call，下次恢复 session 发请求时 API 会报错。

```typescript
if (ev.stopReason === 'aborted') {
  // 只保存文本，丢掉 tool_calls
  context.messages.push(buildAssistantMessage(text, []))
  yield { type: 'turn_end', stopReason: 'aborted' }
  return
}
```

如果 abort 发生在工具执行过程中（已经执行了一部分 tool_calls），剩下没执行的需要补上 `error: aborted` 作为 tool_result，保持 tool_call 和 tool_result 的配对。

```typescript
// 为被 abort 跳过的 tool_call 补上错误结果
for (const tc of toolCalls.slice(results.length)) {
  results.push({ tool_use_id: tc.id, content: 'error: aborted' })
}
```

<!-- checkpoint: agent-error -->

### 边界情况三：请求失败

abort 是用户主动停止，`error` 则是请求失败。收到 error 事件时，先把已经生成的文本放回 context，再把错误信息作为 `assistant_text` 发给界面，最后用 `turn_end` 结束这一轮。这里不能继续 while，否则失败的请求会立刻重试，循环可能一直报同一个错。


## context 会撑爆的

agent 循环跑得越久，context 里的消息越多。每一轮对话至少加两条消息（assistant + user/tool_result），调工具多的时候一轮能加好几条。

> **context window**：模型一次能看到的文本总量上限。比如一个 8K 的模型，system prompt 加所有历史消息加当前回复，总量不能超过 8K token。超了 API 就报错。

消息攒到一定程度，context 就装不下了。必须有办法压缩。

<!-- checkpoint: agent-compaction -->

nanopi 的 compaction 非常粗暴，但概念完整。消息数超过 50 条时触发，把较早的消息拿出来让 LLM 做一次总结，用总结替换掉那些旧消息，最近 20 条保持原样。

```typescript
const COMPACT_THRESHOLD = 50
const KEEP_RECENT = 20

async function compactContext(model, context, signal) {
  if (context.messages.length < COMPACT_THRESHOLD) return

  const oldMessages = context.messages.slice(0, -KEEP_RECENT)
  const recentMessages = context.messages.slice(-KEEP_RECENT)

  // 让 LLM 总结旧消息
  const summaryContext = {
    systemPrompt: '请将以下对话总结为简洁的上下文摘要...',
    messages: [{ role: 'user', content: 序列化旧消息 }],
  }
  let summary = ''
  for await (const ev of stream(model, summaryContext, { signal })) {
    if (ev.type === 'text_delta') summary += ev.delta
  }

  // 用摘要替换旧消息
  context.messages = [
    { role: 'user', content: `[context summary]\n${summary}` },
    ...recentMessages,
  ]
}
```

这个函数在每轮循环的开头调用，先压缩再问 LLM。

看一下压缩前后 context 的变化。压缩前 messages 有 55 条，各种 user、assistant、tool_result 交错排列：

```
messages[0]   user: "帮我建一个项目"
messages[1]   assistant: "好的，我先看看目录结构..."  + tool_call(run_bash)
messages[2]   user: tool_result("src/ package.json ...")
...
messages[34]  assistant: "测试跑通了..."
messages[35]  user: "再加个 README"
...
messages[54]  assistant: "README 写好了。"
```

压缩后变成 21 条。前 35 条被一条摘要替换，最近 20 条原样保留：

```
messages[0]   user: "[context summary]\n用户要求建一个项目，已完成目录结构、package.json、核心模块和测试..."
messages[1]   user: "再加个 README"     ← 第 36 条，最近 20 条的起点
...
messages[20]  assistant: "README 写好了。"
```

模型下一轮看到的是摘要加上最近的对话，足以理解当前工作状态，而 context 的体积缩了一大截。

pi 在这件事上花了近千行代码，做精确的 token 数估算、最优切割点计算、跨消息边界的 split turn 处理。nanopi 用消息条数代替 token 数，50 条一刀切。估算粗糙，但核心概念是一样的，context 有上限，满了要压，压缩靠让 LLM 总结旧消息。

有一个细节值得注意。如果 abort 被触发了（用户按了 Ctrl+C），compaction 会直接跳过。因为 abort 状态下 LLM 总结请求也会被中断，得到的可能是空摘要或半截摘要。用空摘要替换掉原始消息，比不压缩更危险。


## 得有个界面

到这里，循环能跑了，LLM 能说话了，工具能执行了，context 也能压缩了。但用户怎么输入？agent 吐出来的事件往哪里显示？

<!-- checkpoint: tui -->

`tui.ts` 处理这些事。它是一个 88 行的类，用 Node.js 的 `readline` 读一行用户输入，用 `process.stdout.write` 把文本逐字打印出来。

```typescript
class Tui {
  onPrompt(cb: (text: string) => void)   // 用户敲回车时调用
  onAbort(cb: () => void)                // Ctrl+C 时调用
  setBusy(busy: boolean)                 // agent 运行时阻止新输入
  printText(delta: string)               // 流式打印文本
  printToolCall(name: string, args: unknown)
  printToolResult(name: string, result: string)
  printTurnEnd()
  start()
  stop()
}
```

实际跑起来，终端里看到的大概是这样：

```
> 把 hello.txt 改成大写
我来读取文件内容。
[tool: read_file] {"path":"hello.txt"}
[result: read_file] hello world
好的，我把内容改成大写。
[tool: edit] {"path":"hello.txt","old_string":"hello world","new_string":"HELLO WORLD"}
[result: edit] edited hello.txt: replaced 11 chars
已完成，文件内容已改为大写。

>
```

`>` 是提示符，流式打印的文字一个字一个字冒出来，`[tool: ...]` 和 `[result: ...]` 是工具调用和结果。非常朴素。

`setBusy()` 这个方法值得提一嘴。agent 在跑的时候用户不能输入新的 prompt（否则会启动两个并发的 agent 循环），所以 agent 开始前 `setBusy(true)`，结束后 `setBusy(false)`。Ctrl+C 也只在 busy 状态下才拦截，空闲时 Ctrl+C 交给系统默认行为（退出程序）。

tui 最重要的特点是它完全不知道 LLM 和 tool 的存在。它只认识 AgentEvent。外面给它什么事件，它就按类型打印对应的内容。这层解耦是设计上刻意做的。


### 换个"前端"

为了让这层解耦变得直观，我们可以写一个小实验。不动 agent 的任何代码，把 tui 换成一个 HTTP server，让浏览器来消费 AgentEvent。

```typescript
import { createServer } from 'node:http'
import { runAgent } from './agent.js'

// 假设 model, context, tools 已经准备好

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/chat') {
    // 读取用户输入
    const body = await readBody(req)
    context.messages.push({ role: 'user', content: body })

    // 用 SSE 推送 AgentEvent
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    for await (const ev of runAgent(model, context, tools)) {
      res.write(`data: ${JSON.stringify(ev)}\n\n`)
    }
    res.end()
  }
}).listen(3000)
```

二十来行。`runAgent()` 和四个工具完全没变，只是消费事件的方式从 `process.stdout.write` 变成了 SSE 推送。浏览器端收到这些事件，想怎么渲染就怎么渲染。

这就是第一章说的"前后端分离"。agent 是后端，UI 是前端，AgentEvent 是它们之间的协议。tui、Web 页面、手机 APP、甚至一个写日志的脚本，都可以是消费端。pi 的架构也是这样，pi-agent-core 对 pi-tui 零依赖。


## 粘起来

<!-- checkpoint: cli-main -->

五个模块各自做完了，最后需要一个入口把它们粘在一起。`cli.ts` 就是这个胶水。

```typescript
async function main() {
  // 1. 读配置
  const model = { apiKey: process.env.NANOPI_API_KEY, model: 'glm-5.2', ... }

  // 2. 准备 context，从 session 文件加载历史
  const context = { systemPrompt: '你是一个编码助手...', messages: await loadSession() }

  // 3. 拿到四个工具
  const tools = builtinTools()

  // 4. 创建 TUI
  const tui = new Tui()

  // 5. 监听用户输入，启动 agent，转发事件
  tui.onPrompt(async (text) => {
    context.messages.push({ role: 'user', content: text })
    tui.setBusy(true)
    const ctrl = new AbortController()
    tui.onAbort(() => ctrl.abort())

    for await (const ev of runAgent(model, context, tools, ctrl.signal)) {
      switch (ev.type) {
        case 'assistant_text': tui.printText(ev.delta); break
        case 'tool_call':      tui.printToolCall(ev.name, ev.args); break
        case 'tool_result':    tui.printToolResult(ev.name, ev.result); break
        case 'turn_end':       tui.printTurnEnd(); break
      }
    }

    await persistSession(context.messages)
    tui.setBusy(false)
  })

  tui.start()
}
```

中间那个 `for await` + `switch` 就是全部的事件转发逻辑。agent 吐出什么事件，switch 到对应的 tui 方法，一行一行打印出来。这段代码把第一章说的所有模块都串起来了。

外层的 `try/catch/finally` 负责兜底：异常打印到终端，无论成功还是失败，finally 都会把 busy 状态恢复，让用户能继续输入。

每轮新建一个 `AbortController` 是有原因的。AbortController 用过一次（abort 过一次）就废了，不能复用。所以每轮开始时创建新的，同时重新注册 `tui.onAbort` 回调指向新的 controller。

<!-- checkpoint: cli-session -->

每轮结束后调 `persistSession()`，把 context 里新增的消息 append 到 `~/.nanopi/session.jsonl`。下次启动时 `loadSession()` 把它们读回来，context 就恢复了。JSONL 格式是每行一个 JSON 对象，写起来简单（直接 appendFile），读起来也容错（某一行 JSON 坏了跳过，不影响其他行）。


一个能读能写能改代码能跑命令的 coding agent 就做好了。模块地图

这时候你可以自己去跑跑看src下面的代码，我相信运行起来对你来说不是难事。

**我们还为大家准备了几个典型的case，做了一个交互式的断点调试界面，快去第三章体验吧！**
