# PI from Scratch

从零手写一个能读文件、改代码、执行命令的 TypeScript coding agent。

项目沿着 [pi](https://github.com/earendil-works/pi) 的数据流拆解：用户输入进入 Context，LLM 返回文本或 tool call，Agent Loop 执行工具并把结果放回 Context，直到这一轮结束。教学实现叫 `nano-pi`，核心只有五个 TypeScript 文件。

网站把文章和源码放在一起。阅读推进时，右侧编辑器会逐步补全代码；最后一章提供六组离线 trace，可以像调试普通程序一样逐行执行、设置断点并查看核心状态。

[在线阅读 PI from Scratch](https://nanopi-from-scratch.garden-grove-1110.chatgpt.site)

## 从哪里开始

1. **模块地图**：先认清 `llm`、`agent`、`tools`、`tui`、`cli` 的边界。
2. **nano-pi**：沿数据流从类型定义写到完整 Agent Loop。
3. **trace 跟踪**：单步回放真实模型产生的典型路径。

教学正文在 [`docs/ch01-modules.md`](docs/ch01-modules.md) 和 [`docs/ch02-loop.md`](docs/ch02-loop.md)，网站源码在 [`web/`](web/)。

## 运行 nano-pi

需要 Node.js 22 或更高版本，以及一个 OpenAI 兼容 API。

```bash
npm install
export NANOPI_API_KEY=your-api-key
npm run dev
```

可选环境变量：

- `NANOPI_MODEL`：模型名，默认 `glm-5.2`
- `NANOPI_BASE_URL`：OpenAI 兼容接口地址，默认 `https://api.openai.com/v1`

API Key 只从环境变量读取，不会写进源码或网站。线上 trace 是预先生成的静态数据，浏览网站不会发起模型请求。

## 五个文件

| 文件 | 职责 |
| --- | --- |
| `src/llm.ts` | 请求 OpenAI 兼容 API，把 SSE 转成统一事件流 |
| `src/agent.ts` | 维护 Agent Loop、Context、工具执行与终止条件 |
| `src/tools.ts` | `read_file`、`write_file`、`edit`、`run_bash` |
| `src/tui.ts` | 读取输入、打印流式输出、处理 Ctrl+C |
| `src/cli.ts` | 组装模块并持久化 session |

## 本地运行教学网站

```bash
cd web
npm install
npm run dev
```

## 测试

```bash
npm test
cd web && npm test
```

## License

[MIT](LICENSE)
