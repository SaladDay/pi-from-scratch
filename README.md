<img src="web/app/icon.svg" width="48" alt="PI from Scratch 图标">

# PI from Scratch

600 行 TypeScript 写成的超级迷你版 pi。顺着数据流往下走，你可以从 0 写出一个能读文件、改代码、执行命令的 pi-agent。

它保留了 pi 最关键的东西：Context、流式 LLM、tool call、Agent Loop、session 和中断处理，只是把它们压缩到了五个文件里。配套网站把文章和代码编辑器放在一起；往下读，右边的代码会一点点长出来，整篇读完，nano-pi 也就写完了。

[在线阅读](https://pi-from-scratch.vercel.app) · [直接看源码](src/) · [从模块地图开始](docs/ch01-modules.md)

## 怎么读

| 章节 | 你会看到什么 |
| --- | --- |
| 模块地图 | 先认清 `llm`、`agent`、`tools`、`tui`、`cli` 各管什么 |
| nano-pi | 沿着数据流，把五个文件一步步补完整 |
| trace 跟踪 | 像在 VS Code 里调试一样，单步回放六种典型路径，随时看核心数据 |

正文也可以直接在仓库里读：

- [第一章：五个模块](docs/ch01-modules.md)
- [第二章：nano-pi](docs/ch02-loop.md)

## 五个文件

| 文件 | 管什么 |
| --- | --- |
| [`src/llm.ts`](src/llm.ts) | 请求 OpenAI 兼容 API，把 SSE 解析成统一事件流 |
| [`src/agent.ts`](src/agent.ts) | 维护 Agent Loop、Context、工具执行和终止条件 |
| [`src/tools.ts`](src/tools.ts) | 提供 `read_file`、`write_file`、`edit`、`run_bash` |
| [`src/tui.ts`](src/tui.ts) | 读取输入、打印流式输出、处理 Ctrl+C |
| [`src/cli.ts`](src/cli.ts) | 把前面四个模块接起来，再把 session 存下来 |

项目结构也很简单：

```text
pi-from-scratch/
├── src/       nano-pi 的完整源码
├── docs/      两章教学文章
├── scripts/   离线 trace 生成脚本
├── test/      nano-pi 测试
└── web/       交互式阅读网站
```

## 跑起来

需要 Node.js 22 或更高版本，以及一个 OpenAI 兼容 API。

```bash
npm install
export NANOPI_API_KEY=your-api-key
npm run dev
```

默认模型是 `glm-5.2`。如果你用别的模型或接口，可以再设置：

```bash
export NANOPI_MODEL=your-model
export NANOPI_BASE_URL=https://your-api.example/v1
```

API Key 只会从环境变量读取，不会写进源码。网站里的六组 trace 是提前生成的离线数据，打开网页不会偷偷请求模型。

## 在本地打开教学网站

```bash
cd web
npm install
npm run dev
```

然后打开 [http://localhost:3000](http://localhost:3000)。

## 测试

```bash
npm test
cd web && npm test
```

这个项目从 [pi](https://github.com/earendil-works/pi) 出发。如果你已经用过 pi，可以把 nano-pi 当成一张摊开的结构图；如果还没用过，也没关系，从模块地图开始就行。

## Thanks

- [LINUX DO](https://linux.do/) 社区
- [pi-book](https://github.com/antinomie-lab/pi-book)
