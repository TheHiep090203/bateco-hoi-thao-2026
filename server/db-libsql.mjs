// Adapter trình bày libSQL (Turso) theo đúng hình dạng API của Cloudflare D1.
// Nhờ vậy server/worker.mjs và toàn bộ test giữ nguyên không phải sửa: cả hai
// đều là SQLite nên câu lệnh SQL giống hệt, chỉ khác lớp client.
const plain = rows => rows.map(r => ({ ...r }));

export function d1(client) {
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...a) => statement(sql, a),
    async first() { return plain((await client.execute({ sql, args })).rows)[0] ?? null },
    async run() { const r = await client.execute({ sql, args }); return { success: true, meta: { changes: r.rowsAffected } } },
    async all() { const r = await client.execute({ sql, args }); return { results: plain(r.rows) } },
  });
  return {
    prepare: sql => statement(sql),
    // libSQL batch chạy trong một transaction, giống D1 batch.
    async batch(statements) {
      const out = await client.batch(statements.map(s => ({ sql: s.sql, args: s.args })), 'write');
      return out.map(r => ({ success: true, results: plain(r.rows), meta: { changes: r.rowsAffected } }));
    },
  };
}
