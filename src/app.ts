import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { createPluginRouter } from './plugin/routes';
import { PUBLIC_DIR } from './config';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use((req, _res, next) => {
  console.info(`request method=${req.method} path=${req.path}`);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      plugin: 'webgl-preview',
      publicDirExists: fs.existsSync(PUBLIC_DIR),
    },
  });
});

app.use('/plugin', createPluginRouter());

app.use((req, res, next) => {
  if (!req.path.endsWith('.gz')) {
    next();
    return;
  }

  res.setHeader('Content-Encoding', 'gzip');
  if (req.path.endsWith('.wasm.gz')) {
    res.setHeader('Content-Type', 'application/wasm');
  } else if (req.path.endsWith('.js.gz')) {
    res.setHeader('Content-Type', 'application/javascript');
  } else if (req.path.endsWith('.data.gz')) {
    res.setHeader('Content-Type', 'application/octet-stream');
  }
  next();
});

app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    },
  })
);

app.get('*', (req, res) => {
  const requested = req.path === '/' ? 'embed.html' : req.path.replace(/^\/+/, '');
  const target = path.resolve(PUBLIC_DIR, requested);
  const publicRoot = path.resolve(PUBLIC_DIR);
  const fileExists =
    target.startsWith(publicRoot) &&
    fs.existsSync(target) &&
    fs.statSync(target).isFile();

  if (fileExists) {
    res.sendFile(target);
    return;
  }

  res.sendFile(path.join(PUBLIC_DIR, 'embed.html'));
});

export default app;
