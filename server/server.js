/**
 * Minimal static server for the built game (dist/).
 * Uses only Node built-ins so the runtime image needs no dependencies.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    return;
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    send(res, 400, 'Bad Request');
    return;
  }

  if (urlPath === '/healthz') {
    send(res, 200, 'ok');
    return;
  }

  const rel = urlPath.replace(/^\/+/, '');
  let filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        // single page app fallback
        fs.readFile(path.join(ROOT, 'index.html'), (indexErr, indexData) => {
          if (indexErr) {
            send(res, 404, 'Not Found');
            return;
          }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(req.method === 'HEAD' ? '' : indexData);
        });
        return;
      }
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      const cache = filePath.includes(`${path.sep}assets${path.sep}`)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
      res.end(req.method === 'HEAD' ? '' : data);
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`ASHFALL serving ${ROOT} on http://${HOST}:${PORT}`);
});
