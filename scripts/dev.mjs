// Máy chủ dev local mô phỏng cách Vercel phục vụ: file tĩnh từ public/, còn
// /api/* uỷ quyền cho server/worker.mjs. Không phụ thuộc Vercel CLI nên kiểm
// thử tự động chạy được ở mọi nơi.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { d1 } from '../server/db-libsql.mjs';
import worker from '../server/worker.mjs';

for (const line of (await fs.readFile('.env.local', 'utf8').catch(() => '')).split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const PORT = Number(process.env.PORT || 8787);
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const env = {
  DB: process.env.TURSO_DATABASE_URL
    ? d1(createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }))
    : null,
  ADMIN_USER: process.env.ADMIN_USER,
  ADMIN_PASS: process.env.ADMIN_PASS,
  SESSION_SECRET: process.env.SESSION_SECRET,
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise(r => {
      let d = ''; req.on('data', c => d += c); req.on('end', () => r(d));
    });
    const response = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body }), env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    return res.end(await response.text());
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  try {
    const data = await fs.readFile(path.join('public', file));
    res.writeHead(200, { 'Content-Type': (TYPES[path.extname(file)] || 'text/plain') + '; charset=utf-8' });
    res.end(data);
  } catch { res.writeHead(404).end('Không tìm thấy trang'); }
}).listen(PORT, '0.0.0.0', () => console.log(`Dev server: http://127.0.0.1:${PORT}`));
