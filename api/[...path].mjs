// Điểm vào Vercel Function. Vercel hỗ trợ export `fetch` chuẩn Web, đúng hình
// dạng handler mà server/worker.mjs đang dùng, nên chỉ cần dựng `env` rồi uỷ
// quyền toàn bộ định tuyến cho worker.
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
    return worker.fetch(request, {
      DB: database(),
      ADMIN_USER: process.env.ADMIN_USER,
      ADMIN_PASS: process.env.ADMIN_PASS,
      SESSION_SECRET: process.env.SESSION_SECRET,
    });
  },
};
