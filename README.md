# WebGL Preview

Unity WebGL 运行预览插件，结构参考 `plugins/apk-rebuilder`：使用
`Node.js + Express + TypeScript` 提供插件 manifest 和静态 WebGL 入口。

## 启动

```bash
npm install
npm run build
npm start
```

默认访问：

- 插件入口：`http://127.0.0.1:3006/embed.html`
- 健康检查：`http://127.0.0.1:3006/api/health`
- 插件 manifest：`http://127.0.0.1:3006/plugin/manifest`

## Docker

```bash
docker compose up -d --build
```

## 宿主插件配置参考

```json
{
  "id": "webgl-preview",
  "name": "WebGL Preview",
  "url": "http://127.0.0.1:3006/embed.html",
  "allowedOrigin": "http://127.0.0.1:3006",
  "group": "tools",
  "enabled": true,
  "version": "1.0.0"
}
```

> Unity WebGL 的 `.gz` 资源需要正确的 `Content-Encoding` 和 `Content-Type`，
> 本插件服务已在 Express 中针对 `.data.gz`、`.framework.js.gz`、
> `.wasm.gz` 做了响应头处理。
