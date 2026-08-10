# PI from Scratch

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

## 测试

```bash
npm test
cd web && npm test
```

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=SaladDay/pi-from-scratch&type=Date)](https://www.star-history.com/#SaladDay/pi-from-scratch&Date)

## Thanks

- [LINUX DO](https://linux.do/) 社区
- [pi-book](https://github.com/antinomie-lab/pi-book)

## License

[MIT](LICENSE)
