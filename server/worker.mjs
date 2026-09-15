import { allianceData, sportData, standings, validateResult, validateDraws, validateBracket, validateMedals, parseRuleDoc, validateRules, RULE_KEYS, safeEqual, signSession, verifySession } from './domain.mjs';
const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; frame-src https://www.google.com; connect-src 'self'; base-uri 'none'; form-action 'self'"};
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{...security,'Content-Type':'application/json; charset=utf-8'}})}
function cookie(request,name){const raw=request.headers.get('Cookie');if(!raw)return '';for(const part of raw.split(';')){const t=part.trim();if(t.startsWith(name+'='))return t.slice(name.length+1)}return ''}
function sessionCookie(url,value,maxAge){return `admin=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`+(url.protocol==='https:'?'; Secure':'')}
// Fails closed: without SESSION_SECRET no cookie can ever verify.
async function isAdmin(request,env){return verifySession(env.SESSION_SECRET,cookie(request,'admin'),Date.now())}
async function seed(env){await env.DB.batch([...allianceData.map(a=>env.DB.prepare('INSERT OR IGNORE INTO alliances (id,name,members) VALUES (?,?,?)').bind(a.id,a.name,a.members)),...sportData.map(s=>env.DB.prepare('INSERT OR IGNORE INTO sports (id,name,discipline) VALUES (?,?,?)').bind(s.id,s.name,s.discipline))])}
async function snapshot(env){const [a,s,r,d]=await env.DB.batch([env.DB.prepare('SELECT * FROM alliances ORDER BY id'),env.DB.prepare('SELECT * FROM sports ORDER BY id'),env.DB.prepare('SELECT id,sport_id,event,participants,score,revision,updated_at FROM results ORDER BY updated_at DESC,id'),env.DB.prepare('SELECT id,sport_id,ord,c1,c2,c3,c4 FROM draws ORDER BY sport_id,ord')]);return {alliances:a.results,sports:s.results,results:r.results,draws:d.results,brackets:await bracketRows(env),standings:standings(a.results)}}
// Đọc riêng, ngoài batch chính: bảng điểm là chức năng quan trọng nhất ngày thi đấu và
// không được phụ thuộc vào sơ đồ. Hỏng ở đây chỉ làm mất sơ đồ, không sập cả trang.
async function bracketRows(env){try{const b=await env.DB.prepare('SELECT sport_id,data FROM brackets ORDER BY sport_id').all();
 const rows=[];for(const row of b.results){try{rows.push({sport_id:row.sport_id,data:JSON.parse(row.data)})}catch{console.error('Bỏ qua sơ đồ hỏng, sport_id',row.sport_id)}}return rows}
 catch(e){console.error('Không đọc được sơ đồ, trang vẫn phục vụ phần còn lại',e.message);return []}}
async function ruleRows(env){try{const b=await env.DB.prepare('SELECT rule_key,data FROM rules ORDER BY rule_key').all();
 const rows=[];for(const row of b.results){try{const raw=JSON.parse(row.data);rows.push({key:row.rule_key,...parseRuleDoc(raw),raw})}catch{console.error('Bỏ qua luật hỏng, khoá',row.rule_key)}}return rows}
 catch(e){console.error('Không đọc được luật, trang vẫn phục vụ phần còn lại',e.message);return []}}
export default {async fetch(request,env){const url=new URL(request.url),path=url.pathname;try{
if(path.startsWith('/api/')){
 if(!env.DB)return json({error:'Chưa kết nối cơ sở dữ liệu. Vui lòng thử lại sau.'},503);
 if(path==='/api/admin/login'){if(request.method!=='POST')return json({error:'Phương thức không được hỗ trợ.'},405);
  if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Yêu cầu không hợp lệ.'},403);
  const raw=await request.text();if(raw.length>1000)return json({error:'Nội dung quá dài.'},413);
  let body;try{body=JSON.parse(raw)}catch{return json({error:'Dữ liệu không hợp lệ.'},400)}
  const missing=['ADMIN_USER','ADMIN_PASS','SESSION_SECRET'].filter(k=>!env[k]);
  // Names only, never values: a silent config gap otherwise reads as a wrong password.
  if(missing.length){console.error('Thiếu biến môi trường đăng nhập:',missing.join(', '));return json({error:'Máy chủ chưa được cấu hình đăng nhập. Vui lòng báo quản trị viên.'},503)}
  const ok=safeEqual(body?.user,env.ADMIN_USER)&&safeEqual(body?.pass,env.ADMIN_PASS);
  // Same message and same delay for every failure, so nothing leaks which field was wrong.
  if(!ok){await new Promise(r=>setTimeout(r,500));return json({error:'Tài khoản hoặc mật khẩu không đúng.'},401)}
  const exp=Date.now()+28800000;const token=await signSession(env.SESSION_SECRET,exp);
  return new Response(JSON.stringify({admin:true}),{status:200,headers:{...security,'Content-Type':'application/json; charset=utf-8','Set-Cookie':sessionCookie(url,token,28800)}});
 }
 if(path==='/api/admin/logout'){if(request.method!=='POST')return json({error:'Phương thức không được hỗ trợ.'},405);
  if(request.headers.get('Origin')!==url.origin)return json({error:'Yêu cầu không hợp lệ.'},403);
  return new Response(JSON.stringify({ok:true}),{status:200,headers:{...security,'Content-Type':'application/json; charset=utf-8','Set-Cookie':sessionCookie(url,'',0)}});
 }
 if(path==='/api/admin/session'){if(request.method!=='GET')return json({error:'Phương thức không được hỗ trợ.'},405);if(!await isAdmin(request,env))return json({error:'Vui lòng đăng nhập.'},401);await seed(env);return json({admin:true})}
 if(path==='/api/scoreboard'&&request.method==='GET'){await seed(env);return json(await snapshot(env))}
 if(path==='/api/admin/results'&&request.method==='DELETE'){
  if(!await isAdmin(request,env))return json({error:'Vui lòng đăng nhập.'},401);
  if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Yêu cầu không hợp lệ.'},403);
  const raw=await request.text();if(raw.length>1000)return json({error:'Nội dung quá dài.'},413);
  let r;try{r=JSON.parse(raw)}catch{return json({error:'Dữ liệu không hợp lệ.'},400)}
  if(!r||typeof r.id!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(r.id)||!Number.isInteger(r.revision)||r.revision<1)return json({error:'Kết quả cần xóa không hợp lệ.'},400);
  const removed=await env.DB.prepare('DELETE FROM results WHERE id=? AND revision=?').bind(r.id,r.revision).run();
  if(!removed.meta.changes){const existing=await env.DB.prepare('SELECT id FROM results WHERE id=?').bind(r.id).first();if(existing)return json({error:'Kết quả đã được sửa ở nơi khác. Tải lại danh sách và kiểm tra trước khi xóa.'},409)}
  return json({ok:true,id:r.id});
 }
 if(path==='/api/admin/results'&&request.method==='POST'){
  if(!await isAdmin(request,env))return json({error:'Vui lòng đăng nhập.'},401);
  if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Yêu cầu không hợp lệ.'},403);
  if(Number(request.headers.get('Content-Length'))>12000)return json({error:'Nội dung quá dài.'},413);const raw=await request.text();if(raw.length>12000)return json({error:'Nội dung quá dài.'},413);
  let r;try{r=validateResult(JSON.parse(raw))}catch(e){return json({error:e.message},400)}await seed(env);
  const previous=await env.DB.prepare('SELECT * FROM results WHERE id = ?').bind(r.id).first();
  if(previous&&['sport_id','event','participants','score'].every(k=>previous[k]===r[k])&&r.revision===previous.revision-1)return json({ok:true,id:r.id,revision:previous.revision});
  if(previous?r.revision!==previous.revision:r.revision!==0)return json({error:'Kết quả đã được cập nhật ở nơi khác. Hãy tải lại danh sách rồi mở lại kết quả để sửa.'},409);
  const now=new Date().toISOString(),uid='admin';let saved;
  try{saved=previous?await env.DB.prepare('UPDATE results SET sport_id=?,event=?,participants=?,score=?,updated_at=?,updated_by=?,revision=revision+1 WHERE id=? AND revision=?').bind(r.sport_id,r.event,r.participants,r.score,now,uid,r.id,r.revision).run():await env.DB.prepare('INSERT INTO results (id,sport_id,event,participants,score,revision,updated_at,updated_by) VALUES (?,?,?,?,?,1,?,?)').bind(r.id,r.sport_id,r.event,r.participants,r.score,now,uid).run()}catch(e){if(String(e).includes('UNIQUE'))return json({error:'Trận/Phần thi này đã tồn tại. Hãy chọn Sửa kết quả trong danh sách.'},409);throw e}
  if(!saved.meta.changes)return json({error:'Kết quả vừa được sửa ở nơi khác. Hãy tải lại danh sách.'},409);return json({ok:true,id:r.id,revision:r.revision+1});
 }
 if(path==='/api/rules'&&request.method==='GET')return json({rules:await ruleRows(env)});
 if(path==='/api/admin/rules'&&request.method==='DELETE'){
  if(!await isAdmin(request,env))return json({error:'Vui lòng đăng nhập.'},401);
  if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Yêu cầu không hợp lệ.'},403);
  const raw=await request.text();if(raw.length>1000)return json({error:'Nội dung quá dài.'},413);
  let key;try{key=JSON.parse(raw)?.key}catch{return json({error:'Dữ liệu không hợp lệ.'},400)}
  if(!RULE_KEYS.includes(key))return json({error:'Tài liệu luật không hợp lệ.'},400);
  await env.DB.prepare('DELETE FROM rules WHERE rule_key=?').bind(key).run();
  return json({ok:true,key});
 }
 if(path==='/api/admin/rules'&&request.method==='POST'){
  if(!await isAdmin(request,env))return json({error:'Vui lòng đăng nhập.'},401);
  if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Yêu cầu không hợp lệ.'},403);
  if(Number(request.headers.get('Content-Length'))>26000)return json({error:'Nội dung quá dài.'},413);const raw=await request.text();if(raw.length>26000)return json({error:'Nội dung quá dài.'},413);
  let d;try{d=validateRules(JSON.parse(raw))}catch(e){return json({error:e.message},400)}
  await env.DB.prepare('INSERT INTO rules (rule_key,data,updated_at) VALUES (?,?,?) ON CONFLICT(rule_key) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').bind(d.key,JSON.stringify({title:d.title,quick:d.quick,notes:d.notes,full:d.full}),new Date().toISOString()).run();
  return json({ok:true,key:d.key});
 }
 if(path==='/api/admin/medals'&&request.method==='POST'){
  if(!await isAdmin(request,env))return json({error:'Vui lòng đăng nhập.'},401);
  if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Yêu cầu không hợp lệ.'},403);
  const raw=await request.text();if(raw.length>1000)return json({error:'Nội dung quá dài.'},413);
  let m;try{m=validateMedals(JSON.parse(raw))}catch(e){return json({error:e.message},400)}
  await seed(env);
  await env.DB.prepare('UPDATE alliances SET gold=?,silver=?,bronze=? WHERE id=?').bind(m.gold,m.silver,m.bronze,m.alliance_id).run();
  return json({ok:true,alliance_id:m.alliance_id});
 }
 if(path==='/api/admin/draws'&&request.method==='POST'){
  if(!await isAdmin(request,env))return json({error:'Vui lòng đăng nhập.'},401);
  if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Yêu cầu không hợp lệ.'},403);
  if(Number(request.headers.get('Content-Length'))>24000)return json({error:'Nội dung quá dài.'},413);const raw=await request.text();if(raw.length>24000)return json({error:'Nội dung quá dài.'},413);
  let d;try{d=validateDraws(JSON.parse(raw))}catch(e){return json({error:e.message},400)}
  // draws.sport_id references sports(id); seed first or a fresh database rejects the insert.
  await seed(env);
  await env.DB.batch([env.DB.prepare('DELETE FROM draws WHERE sport_id = ?').bind(d.sport_id),...d.rows.map((row,i)=>env.DB.prepare('INSERT INTO draws (id,sport_id,ord,c1,c2,c3,c4) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),d.sport_id,i,row[0],row[1],row[2],row[3]))]);
  return json({ok:true,sport_id:d.sport_id,rows:d.rows.length});
 }
 if(path==='/api/admin/bracket'&&request.method==='POST'){
  if(!await isAdmin(request,env))return json({error:'Vui lòng đăng nhập.'},401);
  if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Yêu cầu không hợp lệ.'},403);
  if(Number(request.headers.get('Content-Length'))>8000)return json({error:'Nội dung quá dài.'},413);const raw=await request.text();if(raw.length>8000)return json({error:'Nội dung quá dài.'},413);
  let b;try{b=validateBracket(JSON.parse(raw))}catch(e){return json({error:e.message},400)}
  // brackets.sport_id references sports(id); seed first or a fresh database rejects the insert.
  await seed(env);
  await env.DB.prepare('INSERT INTO brackets (sport_id,data,updated_at) VALUES (?,?,?) ON CONFLICT(sport_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').bind(b.sport_id,JSON.stringify({teams:b.teams,matches:b.matches}),new Date().toISOString()).run();
  return json({ok:true,sport_id:b.sport_id});
 }
 return json({error:'Không tìm thấy thao tác.'},404);
}
return json({error:'Không tìm thấy thao tác.'},404);
}catch(e){console.error('Scoreboard request failed',e);return json({error:'Không thể kết nối dữ liệu. Vui lòng thử lại; nội dung đang nhập vẫn được giữ.'},503)}}};
