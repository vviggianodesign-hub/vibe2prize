#!/usr/bin/env node

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const DIST_DIR = path.join(ROOT, 'dist');
const DEFAULT_PORT = 4173;
const port = Number(process.env.STATIC_PORT || process.env.PORT) || DEFAULT_PORT;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function startBuilderWatch() {
  const builder = spawn('node', ['builder/build-slides.js', '--watch'], {
    stdio: 'inherit',
    cwd: ROOT,
  });

  builder.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      return;
    }
    console.error(`builder/watch process exited with code ${code ?? 'null'}`);
  });

  return builder;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function resolveRequestPath(urlPath) {
  const normalized = decodeURIComponent(urlPath.split('?')[0]);
  if (normalized === '/' || normalized === '') {
    return path.join(ROOT, 'index.html');
  }

  const relative = normalized.replace(/^\/+/, '');
  const absolutePath = path.join(ROOT, relative);
  if (!absolutePath.startsWith(ROOT)) {
    return null;
  }
  return absolutePath;
}

function serveFile(filePath, res) {
  const stream = fs.createReadStream(filePath);
  const mimeType = getMimeType(filePath);
  res.writeHead(200, { 'Content-Type': mimeType });
  stream.pipe(res);
  stream.on('error', (err) => {
    console.error('Stream error', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end('Internal server error');
  });
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  let targetPath = resolveRequestPath(req.url);
  if (!targetPath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(targetPath, (err, stats) => {
    if (err || !stats.isFile()) {
      const relative = targetPath.replace(ROOT, '').replace(/^\//, '');
      const distFallback = path.join(DIST_DIR, relative);

      if (
        distFallback.startsWith(DIST_DIR) &&
        fs.existsSync(distFallback) &&
        fs.statSync(distFallback).isFile()
      ) {
        serveFile(distFallback, res);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    serveFile(targetPath, res);
  });
});

const builderProcess = startBuilderWatch();

server.listen(port, () => {
  console.log(`\n🚀 Static dev server running at http://localhost:${port}`);
  console.log('Watching slides → dist/slides.html (builder/build-slides.js --watch)');
  console.log('Press Ctrl+C to stop both processes.\n');
});

function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down...`);
  server.close(() => {
    process.exit(0);
  });
  if (builderProcess && !builderProcess.killed) {
    builderProcess.kill(signal);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
