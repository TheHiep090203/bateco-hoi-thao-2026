import { allianceData, sportData, standings, validateResult } from './domain.mjs';
const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'"};
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{...security,'Content-Type':'application/json; charset=utf-8'}})}
function page(body,status=200){return new Response(body,{status,headers:{...security,'Content-Type':'text/html; charset=utf-8'}})}
function message(title,text,status=403){return page(`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/live.css"><main class="admin-shell"><h1 class="admin-title">${title}</h1><p>${text}</p><a class="button orange" href="/">Về website hội thao</a></main></html>`,status)}
async function isAdmin(request,env){const id=request.headers.get('oai-authenticated-user-id');if(!id)return false;const existing=await env.DB.prepare('SELECT id FROM admins WHERE slot = ?').bind('owner').first();if(existing)return existing.id===id;const email=request.headers.get('oai-authenticated-user-email');if(!env.ADMIN_BOOTSTRAP_EMAIL||email?.toLowerCase()!==env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase())return false;await env.DB.prepare('INSERT OR IGNORE INTO admins (id, slot) VALUES (?, ?)').bind(id,'owner').run();const row=await env.DB.prepare('SELECT id FROM admins WHERE slot = ?').bind('owner').first();return row?.id===id}
async function seed(env){await env.DB.batch([...allianceData.map(a=>env.DB.prepare('INSERT OR IGNORE INTO alliances (id,name,members) VALUES (?,?,?)').bind(a.id,a.name,a.members)),...sportData.map(s=>env.DB.prepare('INSERT OR IGNORE INTO sports (id,name,discipline) VALUES (?,?,?)').bind(s.id,s.name,s.discipline))])}
async function snapshot(env){const [a,s,r]=await env.DB.batch([env.DB.prepare('SELECT * FROM alliances ORDER BY id'),env.DB.prepare('SELECT * FROM sports ORDER BY id'),env.DB.prepare('SELECT id,sport_id,event,participants,score,gold,silver,bronze,revision,updated_at FROM results ORDER BY updated_at DESC,id')]);return {alliances:a.results,sports:s.results,results:r.results,standings:standings(a.results,r.results)}}
export default {async fetch(request,env){const url=new URL(request.url),path=url.pathname;try{
if(path==='/admin'||path==='/admin/'||path==='/admin.html'){
 if(!request.headers.get('oai-authenticated-user-id'))return message('Đăng nhập quản trị','<a class="button orange" href="/signin-with-chatgpt?return_to=%2Fadmin" target="_top">Đăng nhập bằng ChatGPT</a>',401);
 if(!env.DB)return message('Chưa kết nối dữ liệu','Vui lòng thử lại sau.',503);
 if(!await isAdmin(request,env))return message('Không có quyền quản trị','Tài khoản này chỉ được xem kết quả hội thao.');return page(assets['/admin.html']);}
if(path.startsWith('/api/')){
 if(!env.DB)return json({error:'Chưa kết nối cơ sở dữ liệu. Vui lòng thử lại sau.'},503);
 if(path==='/api/admin/session'){if(request.method!=='GET')return json({error:'Phương thức không được hỗ trợ.'},405);if(!await isAdmin(request,env))return json({error:'Bạn không có quyền cập nhật kết quả.'},403);await seed(env);return json({admin:true})}
 if(path==='/api/scoreboard'&&request.method==='GET'){await seed(env);return json(await snapshot(env))}
 if(path==='/api/admin/results'&&request.method==='DELETE'){
  if(!request.headers.get('oai-authenticated-user-id'))return json({error:'Vui lòng đăng nhập.'},401);
  if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Yêu cầu không hợp lệ.'},403);
  if(!await isAdmin(request,env))return json({error:'Bạn không có quyền xóa kết quả.'},403);
  const raw=await request.text();if(raw.length>1000)return json({error:'Nội dung quá dài.'},413);
  let r;try{r=JSON.parse(raw)}catch{return json({error:'Dữ liệu không hợp lệ.'},400)}
  if(!r||typeof r.id!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(r.id)||!Number.isInteger(r.revision)||r.revision<1)return json({error:'Kết quả cần xóa không hợp lệ.'},400);
  const removed=await env.DB.prepare('DELETE FROM results WHERE id=? AND revision=?').bind(r.id,r.revision).run();
  if(!removed.meta.changes){const existing=await env.DB.prepare('SELECT id FROM results WHERE id=?').bind(r.id).first();if(existing)return json({error:'Kết quả đã được sửa ở nơi khác. Tải lại danh sách và kiểm tra trước khi xóa.'},409)}
  return json({ok:true,id:r.id});
 }
 if(path==='/api/admin/results'&&request.method==='POST'){
  if(!request.headers.get('oai-authenticated-user-id'))return json({error:'Vui lòng đăng nhập.'},401);
  if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Yêu cầu không hợp lệ.'},403);
  if(!await isAdmin(request,env))return json({error:'Bạn không có quyền cập nhật kết quả.'},403);
  if(Number(request.headers.get('Content-Length'))>12000)return json({error:'Nội dung quá dài.'},413);const raw=await request.text();if(raw.length>12000)return json({error:'Nội dung quá dài.'},413);
  let r;try{r=validateResult(JSON.parse(raw))}catch(e){return json({error:e.message},400)}await seed(env);
  const previous=await env.DB.prepare('SELECT * FROM results WHERE id = ?').bind(r.id).first();
  if(previous&&['sport_id','event','participants','score','gold','silver','bronze'].every(k=>previous[k]===r[k])&&r.revision===previous.revision-1)return json({ok:true,id:r.id,revision:previous.revision});
  if(previous?r.revision!==previous.revision:r.revision!==0)return json({error:'Kết quả đã được cập nhật ở nơi khác. Hãy tải lại danh sách rồi mở lại kết quả để sửa.'},409);
  const now=new Date().toISOString(),uid=request.headers.get('oai-authenticated-user-id');let saved;
  try{saved=previous?await env.DB.prepare('UPDATE results SET sport_id=?,event=?,participants=?,score=?,gold=?,silver=?,bronze=?,updated_at=?,updated_by=?,revision=revision+1 WHERE id=? AND revision=?').bind(r.sport_id,r.event,r.participants,r.score,r.gold,r.silver,r.bronze,now,uid,r.id,r.revision).run():await env.DB.prepare('INSERT INTO results (id,sport_id,event,participants,score,gold,silver,bronze,revision,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,1,?,?)').bind(r.id,r.sport_id,r.event,r.participants,r.score,r.gold,r.silver,r.bronze,now,uid).run()}catch(e){if(String(e).includes('UNIQUE'))return json({error:'Trận/Phần thi này đã tồn tại. Hãy chọn Sửa kết quả trong danh sách.'},409);throw e}
  if(!saved.meta.changes)return json({error:'Kết quả vừa được sửa ở nơi khác. Hãy tải lại danh sách.'},409);return json({ok:true,id:r.id,revision:r.revision+1});
 }
 return json({error:'Không tìm thấy thao tác.'},404);
}
if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'Chỉ hỗ trợ xem trang.'},405);
const key=path==='/'?'/index.html':path;const body=assets[key];if(body===undefined)return message('Không tìm thấy trang','Vui lòng quay lại website hội thao.',404);const type=key.endsWith('.css')?'text/css':key.endsWith('.js')?'text/javascript':'text/html';return new Response(request.method==='HEAD'?null:body,{headers:{...security,'Content-Type':type+'; charset=utf-8'}});
}catch(e){console.error('Scoreboard request failed',e);return path.startsWith('/api/')?json({error:'Không thể kết nối dữ liệu. Vui lòng thử lại; nội dung đang nhập vẫn được giữ.'},503):message('Tạm thời chưa thể tải trang','Vui lòng thử lại sau.',503)}}};
