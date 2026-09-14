// Áp dụng các migration trong drizzle/ theo thứ tự lên libSQL (Turso hoặc file local).
// Bảng _migrations ghi lại tên đã chạy nên chạy lại nhiều lần vẫn an toàn.
import fs from 'node:fs/promises';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw Error('Thiếu TURSO_DATABASE_URL. Local dùng: TURSO_DATABASE_URL=file:local.db');
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

await client.execute('CREATE TABLE IF NOT EXISTS _migrations (tag TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
const done = new Set((await client.execute('SELECT tag FROM _migrations')).rows.map(r => r.tag));

for (const file of (await fs.readdir('drizzle')).filter(f => f.endsWith('.sql')).sort()) {
  if (done.has(file)) { console.log('bỏ qua (đã chạy):', file); continue; }
  const sql = await fs.readFile('drizzle/' + file, 'utf8');
  const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
  await client.batch(statements, 'write');
  await client.execute({ sql: 'INSERT INTO _migrations (tag, applied_at) VALUES (?, ?)', args: [file, new Date().toISOString()] });
  console.log('đã áp dụng:', file);
}
console.log('Migration hoàn tất.');
