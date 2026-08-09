# PI from Scratch
"What I cannot create, I do not understand." Richard Feynman 去世时，黑板上留着这句话。

[pi](https://github.com/earendil-works/pi) 是一个上万行的生产级 AI coding agent。nanopi 是它的教学版，600 行代码。

这篇文章的食用方式很简单。我们写的时候采用的方案是跟着数据流走、需要什么就写什么，每个模块的出现都是直觉的。右侧有一个编辑器，你读到哪一块，那一块的代码就会浮现出来。读完整篇文章，nanopi 的源码就全都完整了。

> 如果你不想编辑器随着文章滚动动来动去，编辑器右上角有个锁，打开它。

放轻松，这是一篇文章，不是一本书，而且是给初学者写的，你会很容易看懂。同时，我们有一个“语法扫盲块“，不用担心TS的语法看不懂。

> BTW，现在是一篇文章，后续可能会变成很多篇。pi 里还有不少 nano-pi 没覆盖的东西值得单独写，比如精确的 token 估算和 compaction 切割策略、TypeScript 扩展系统（extensions / skills）、多 provider 适配和 model routing、session branching、以及 pi-tui 的 differential renderer【这些词是什么意思都不用管，只是预告一下】。方便的话，或许能给[github仓库](https://github.com/SaladDay/pi-from-scratch)点点star，这给我提供了继续更新下去的动力🤗。

## 让我们开始吧。

nanopi 整个项目就五个 TypeScript 文件。在开始跟着数据流造代码之前，先花两分钟记住这五个文件做什么、不做什么、对外暴露什么。

## llm.ts

跟 LLM API 通信。吃进去一个 Context（聊天记录，纯 JSON），吐出来一串流式事件（StreamEvent）。四种事件：`text_delta`（模型吐了一段文字）、`tool_call`（模型想调工具）、`done`（这轮结束了）、`error`（炸了）。HTTP 怎么发、SSE 怎么解析、tool_call 的分片参数怎么拼，全封在这个文件里，上层不用管。

Context 定义在这个文件里，因为 Context 本质上就是"喂给 LLM 的东西"，归 LLM 层管。pi 也是同样的做法。Context 的结构很简单，一个 `systemPrompt` 加一个 `messages` 数组，纯 JSON，可以直接 `JSON.stringify` 存到文件里，下次读回来继续聊。

对外暴露 `stream()` 函数，以及 Context、Message、StreamEvent 等类型定义。pi 里对应 `pi-ai` 包，pi-ai 要适配十几个 provider，nanopi 只支持 OpenAI 兼容格式。

> 最草履虫的理解，上游有很多模型，有各种乱七八糟的细节，llm.ts（也就是pi中pi-ai包）负责接收context，转化成乱七八糟的格式转交给供应商的模型，然后将乱七八糟的格式整理好，对外持续输出流式的事件。


## agent.ts

agent 的循环，整个项目的核心。调 `llm.ts` 的 `stream()` 问模型，模型说要调工具就调，调完把结果塞回 Context 再问，持续这个过程，直到模型说“好了好了，我要结束了“。

对外暴露 `runAgent()` 函数，往外吐 AgentEvent（assistant_text / tool_call / tool_result / turn_end）。AgentEvent 跟 llm 层的 StreamEvent 不是一套，语义更高级。这两层事件的分离是有意的，UI 层只需要认识 AgentEvent，不用关心底层 LLM 的响应格式长什么样。

pi 里对应 `pi-agent-core`。

> 最草履虫的理解又来了，这里是维护了agent最核心的循环：模型思考决策，环境反馈；持续循环，不停转转转。对外也输出一些流式的事件，为什么要输出事件？？因为外部可以消费这些事件，就知道模型现在的干嘛，也就是你能看到模型在“thinking“、“tool-calling“....


## tools.ts

四个工具：`read_file`、`write_file`、`edit`、`run_bash`。pi 的 agent-core 层也是这四个。

每个工具是一个纯函数，接收参数返回字符串结果。它们不碰 agent 状态，不知道 Context 的存在，甚至不知道自己是被 agent 调用的。这样设计的好处是工具可以独立测试、独立替换，加一个新工具也不需要改 agent 的任何代码。

对外暴露 `builtinTools()` 函数，返回四个工具的数组。


## tui.ts

终端界面。用 `readline` 读用户输入，用 `process.stdout.write` 流式打印模型回复，监听 Ctrl+C 触发 abort。

`tui.ts` 不知道 LLM 的存在，也不知道工具怎么执行。它只认识 AgentEvent，来什么事件就打印什么内容。换成 Web 前端或者别的什么东西，agent 代码一行不用动。这跟 Web 开发里的前后端分离一个道理：agent 是后端，UI 是前端，AgentEvent 是它们之间的协议（类似于前后端中的restAPI、RPC等等）。

对外暴露 `Tui` 类，提供 `onPrompt()`、`onAbort()`、`printText()`、`printToolCall()`、`printToolResult()` 等方法。

`runAgent()` 往外吐 AgentEvent。在nanopi 里由 CLI 接收这些事件，再给 Tui 、让他渲染出来；换成 Web 应用时，可以让 HTTP server 接收同一条事件流，再通过 SSE 发给浏览器、让浏览器渲染结果。nanopi 自带的是左边那个 tui，但你随时可以换成别的。

![同一个 AgentEvent 流可以被不同界面消费](/figures/event-consumers.png)


## cli.ts

胶水。读配置，造 Model，拿到工具和 Tui，监听输入，把 AgentEvent 转发给 Tui 显示。每轮结束把消息 append 到 `~/.nanopi/session.jsonl`。

pi 里对应 `pi-coding-agent`【碎碎念，在我们这可能比较简单，在pi中包括了各种前置后置检查hook等，还是有复杂度的】。


## 它们怎么协作

五个模块拼起来以后，数据流长这样。

用户输入从 tui 出发，cli 把它塞进 Context 交给 agent。agent 调 llm 的 `stream()` 问模型，模型回复（可能带着 tool_call）通过 agent 转发给 tui 显示。有 tool_call 就找 tools 执行，把结果放回到 Context，再问。没 tool_call 就等用户下一轮输入。每轮结束 cli 把新增的消息持久化到 `~/.nanopi/session.jsonl`。

![nanopi 一轮完整的数据流](/figures/full-roundtrip.png)

换个角度，看依赖关系。llm 不知道 agent 的存在，agent 不知道 tui 长什么样，tools 不知道自己被谁调用，tui 只认识 AgentEvent。cli 是唯一知道所有人的那个，它的工作就是把它们粘在一起。这种单向依赖让每个模块都可以独立替换，换掉 tui、换掉 tools、甚至换掉 llm 的 provider，上下游都不用改。

![nanopi 五模块依赖关系](/figures/module-architecture.png)


**好了，现在已经知道有哪些模块了，我已经迫不及待想开始写代码了！**
