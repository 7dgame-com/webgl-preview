#!/usr/bin/env node

const http = require('node:http');
const { main: runContainerSmoke } = require('./container-smoke');

const DEFAULT_PREFIX = '/webgl-preview';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function parseLocalHttpUpstream(value) {
  let upstream;
  try {
    upstream = new URL(String(value || 'http://127.0.0.1:3006'));
  } catch {
    throw new Error('Smoke upstream must be a valid local HTTP URL');
  }

  const hostname = upstream.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    upstream.protocol !== 'http:' ||
    !LOCAL_HOSTS.has(hostname) ||
    upstream.username ||
    upstream.password ||
    upstream.pathname !== '/' ||
    upstream.search ||
    upstream.hash
  ) {
    throw new Error(
      'Smoke upstream must be a credential-free loopback HTTP origin'
    );
  }
  return upstream;
}

function normalizePrefix(value) {
  const prefix = String(value || DEFAULT_PREFIX).replace(/\/+$/g, '');
  if (!/^\/[a-z0-9][a-z0-9._/-]*$/i.test(prefix) || prefix.includes('..')) {
    throw new Error('Strip-prefix path must be an absolute safe URL path');
  }
  return prefix;
}

function createStripPrefixProxy(upstreamValue, options = {}) {
  const upstream = parseLocalHttpUpstream(upstreamValue);
  const prefix = normalizePrefix(options.prefix);
  return http.createServer((incoming, outgoing) => {
    let incomingUrl;
    try {
      incomingUrl = new URL(incoming.url || '/', 'http://127.0.0.1');
    } catch {
      outgoing.writeHead(400);
      outgoing.end();
      return;
    }

    if (
      incomingUrl.pathname !== prefix &&
      !incomingUrl.pathname.startsWith(`${prefix}/`)
    ) {
      outgoing.writeHead(404);
      outgoing.end();
      return;
    }

    const strippedPath = incomingUrl.pathname.slice(prefix.length) || '/';
    const upstreamRequest = http.request(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname.replace(/^\[|\]$/g, ''),
        port: upstream.port || 80,
        method: incoming.method,
        path: `${strippedPath}${incomingUrl.search}`,
        headers: {
          ...incoming.headers,
          host: upstream.host,
          connection: 'close',
        },
      },
      (upstreamResponse) => {
        const headers = { ...upstreamResponse.headers };
        delete headers.connection;
        delete headers['keep-alive'];
        delete headers['transfer-encoding'];
        outgoing.writeHead(upstreamResponse.statusCode || 502, headers);
        upstreamResponse.pipe(outgoing);
      }
    );
    upstreamRequest.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    outgoing.on('close', () => {
      if (!upstreamRequest.destroyed) upstreamRequest.destroy();
    });
    incoming.pipe(upstreamRequest);
  });
}

async function closeServer(server, timeoutMs = 2000) {
  if (!server || !server.listening) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      finish();
    }, timeoutMs);
    timer.unref();
    server.close(finish);
    if (typeof server.closeIdleConnections === 'function') {
      server.closeIdleConnections();
    }
  });
}

async function startStripPrefixProxy(upstreamValue, options = {}) {
  const prefix = normalizePrefix(options.prefix);
  const server = createStripPrefixProxy(upstreamValue, { prefix });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Subpath smoke proxy did not expose a TCP address');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}${prefix}/`,
    close: () => closeServer(server),
    prefix,
    server,
  };
}

async function main(upstreamValue = process.argv[2] || 'http://127.0.0.1:3006') {
  const proxy = await startStripPrefixProxy(upstreamValue);
  try {
    await runContainerSmoke(proxy.baseUrl);
    console.log('webgl-preview strip-prefix smoke passed');
  } finally {
    await proxy.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  createStripPrefixProxy,
  main,
  parseLocalHttpUpstream,
  startStripPrefixProxy,
};
