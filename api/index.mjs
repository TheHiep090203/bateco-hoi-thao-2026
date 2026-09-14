// Điểm vào Vercel Function. vercel.json rewrite mọi /api/* về đây kèm ?__path=
// chứa đường dẫn gốc, nên không phụ thuộc vào việc Vercel có giữ nguyên
// request.url sau rewrite hay không.
import { createClient } from '@libsql/client';
import { d1 } from '../server/db-libsql.mjs';
import worker from '../server/worker.mjs';

export const config = { runtime: 'nodejs' };

let db;
function database() {
  if (db) return db;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) return null;   // worker trả 503 khi thiếu DB, không bao giờ bịa dữ liệu
  db = d1(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }));
  return db;
}

export default {
  fetch(request) {
    const url = new URL(request.url);
    const original = url.searchParams.get('__path');
    const target = original ? new URL(original, url.origin) : url;
    const forwarded = new Request(target, {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      duplex: 'half',
    });
    return worker.fetch(forwarded, {
      DB: database(),
      ADMIN_USER: process.env.ADMIN_USER,
      ADMIN_PASS: process.env.ADMIN_PASS,
      SESSION_SECRET: process.env.SESSION_SECRET,
    });
  },
};
