# PI from Scratch

<p align="center">
  <a href="https://pi-from-scratch.vercel.app">
    <img src="./web/public/og.png" alt="PI from Scratch：从零手撕一个 Coding Agent" width="80%">
  </a>
</p>

从零手写一个能读文件、改代码、执行命令的 TypeScript coding agent。

项目沿着 [pi](https://github.com/earendil-works/pi) 的数据流拆解，需要什么、我们造什么，所有组件都是符合直觉的。

删除 pi 的工程细节，留下 pi 的核心思想。

放轻松，这是一篇文章，不是一本书，你会很容易看懂。

网站把文章和源码放在一起。阅读推进时，右侧编辑器会逐步补全代码，当你看完的时候，nano-pi 的代码也会全部呈现在编辑器中。

同时设计了一个 Trace 跟踪，可以打断点逐行过代码，希望能帮助大家理解代码执行流。

[在线阅读 PI from Scratch](https://pi-from-scratch.vercel.app)

> 文章保留古法手敲，尽可能没有ai味，希望大家读的开心。

## 运行 nano-pi

需要 Node.js 22 或更高版本，以及一个 OpenAI 兼容 API。

```bash
npm install
export NANOPI_API_KEY=your-api-key
npm run dev
```

可选环境变量：

- `NANOPI_MODEL`：模型名
- `NANOPI_BASE_URL`：OpenAI 兼容接口地址，默认 `https://api.openai.com/v1`

线上 trace 是预先生成的静态数据，浏览网站不会发起模型请求。

## 本地运行教学网站

```bash
cd web
npm install
npm run dev
```

## Thanks

- 感谢 [OpenModel](https://www.openmodel.ai?ref=JGDNqZl8) 为本项目提供 API 测试支持。OpenModel 提供稳定可靠的 AI API 和生产级 SLA 保障，一个接口即可调用 50+ 主流模型，并可直接用于 Claude Code、Codex，以及你刚刚亲手做好的 nano-pi 😈。
- 感谢 [Cubence](https://cubence.com/signup?code=SC3M1CAH&source=ccscli) 对本项目的赞助。Cubence 自 2025 年 9 月起提供稳定高效的 API 中转服务，兼容 OpenAI 与 Anthropic 协议，可直接接入 Codex、Claude Code、pi 和 oh-my-pi 等主流编程工具。
- 感谢 [pi-book](https://books.antinomie.org/pi/) 带来的启发，为本项目从零实现 nano-pi 提供了不少思路和参考。如果你想在完成 nano-pi 后继续深入理解 pi，这本书很值得读。

## Star History

<p align="center">
  <a href="https://www.star-history.com/#SaladDay/pi-from-scratch&amp;Date">
    <img src="https://api.star-history.com/chart?repos=SaladDay%2Fpi-from-scratch&amp;type=date&amp;legend=top-left&amp;sealed_token=zEX_hDx767RuvD8h02AAC8PQvRcc5HyRIrKXaM5IoysJtPVPUhY8x-JjF6a1XFnUN1acFyB111JWBmLFh6yzfhmk6sbPo3EXlz2VPf6UXxM7iUtALO3wYvU3zj9u3Xmj8CleWffL6e7wzGJ7k7K2kOHcAzc8gOTwZqmrxObgmuKUJC2aEV1vygRPnnwP" width="560" alt="Star History Chart">
  </a>
</p>

## License

[MIT](LICENSE)
