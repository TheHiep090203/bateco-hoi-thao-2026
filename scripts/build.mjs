// Vercel phục vụ tĩnh từ public/ qua CDN, còn api/[...path].mjs chỉ xử lý /api.
// Build chỉ cần chép mã nguồn viết tay trong dist/ sang public/.
import fs from 'node:fs/promises';
const files = ['index.html', 'style.css', 'refinements.css', 'live.css', 'app.js', 'live.js', 'entry.js'];
await fs.rm('public', { recursive: true, force: true });
await fs.mkdir('public', { recursive: true });
for (const file of files) await fs.copyFile('dist/' + file, 'public/' + file);
console.log(`Đã chép ${files.length} file từ dist/ sang public/ cho Vercel.`);
