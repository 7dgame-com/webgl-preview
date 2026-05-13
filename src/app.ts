import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { createPluginRouter } from './plugin/routes';
import { PUBLIC_DIR } from './config';
import { ok } from './common/response';
import { requestLogger } from './middleware/requestLogger';
import {
  setUnityStaticHeaders,
  unityGzipHeaders,
} from './middleware/unityStaticHeaders';
import { getRuntimeStatus } from './plugin/helpers';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use(requestLogger);

app.get('/api/health', (_req, res) => {
  ok(res, getRuntimeStatus(PUBLIC_DIR));
});

app.use('/plugin', createPluginRouter());

app.use(unityGzipHeaders);

app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    setHeaders: setUnityStaticHeaders,
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
