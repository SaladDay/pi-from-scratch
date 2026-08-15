# PI from Scratch Web

交互式教学网站。正文来自根目录的 `docs/`，源码快照来自 `src/`，构建前会自动同步。

```bash
npm install
npm run dev
```

如果通过 `npm run dev` 输出的局域网 `Network` 地址访问开发站点，需要允许对应的 hostname，否则 Next.js 可能会阻止开发资源（包括 HMR），导致页面交互失效。例如：

```bash
NEXT_ALLOWED_DEV_ORIGINS=192.168.31.245 npm run dev
```

多个 hostname 可以用逗号分隔：

```bash
NEXT_ALLOWED_DEV_ORIGINS=192.168.31.245,my-dev-host.local npm run dev
```

修改配置后需要重启开发服务器。

生产构建：

```bash
npm run build
```

网站使用离线 trace，不需要 API Key。
