import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import worker from '../server/worker.mjs';import {standings,allianceData,validateResult,validateDraws,validateBracket,validateMedals,parseRuleDoc,validateRules,RULE_KEYS,safeEqual,signSession} from '../server/domain.mjs';
function database(){const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));const binding={prepare(sql){return {args:[],bind(...args){this.args=args;return this},async first(){return db.prepare(sql).get(...this.args)||null},async run(){const r=db.prepare(sql).run(...this.args);return {success:true,meta:{changes:r.changes}}},async all(){return {results:db.prepare(sql).all(...this.args)}}}},async batch(statements){db.exec('BEGIN');try{const r=[];for(const s of statements){try{r.push(await s.all())}catch{r.push(await s.run())}}db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};return {db,binding}}
const origin='https://scoreboard.test';const SECRET='test-session-secret';
const creds={ADMIN_USER:'bateco',ADMIN_PASS:'123',SESSION_SECRET:SECRET};
const admin={Cookie:'admin='+await signSession(SECRET,Date.now()+3600000)};
function call(env,path,method='GET',body,headers={}){return worker.fetch(new Request(origin+path,{method,headers:{...(body?{'Origin':origin,'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined}),env)}
const result=(overrides={})=>({id:'00000000-0000-4000-8000-000000000001',sport_id:1,event:'Nội dung kiểm thử',participants:'Đội kiểm thử',score:'2–1',revision:0,...overrides});
const alliance=(id,gold=0,silver=0,bronze=0)=>({...allianceData.find(a=>a.id===id),gold,silver,bronze});
const medalBody=(overrides={})=>({alliance_id:1,gold:0,silver:0,bronze:0,...overrides});
test('Ranking uses total medals first, then gold, silver, bronze',()=>{const rows=standings([alliance(1,1,0,0),alliance(2,1,2,0),alliance(3,0,0,2)]);assert.deepEqual(rows.map(r=>r.id),[2,3,1]);
 const heavy=standings([alliance(1,1,0,0),alliance(2,0,5,5),alliance(3)]);assert.deepEqual(heavy.map(r=>r.id),[2,1,3]);assert.deepEqual(heavy.map(r=>r.rank),[1,2,3]);
 const tieBreak=standings([alliance(1,1,0,0),alliance(2,0,1,0),alliance(3)]);assert.deepEqual(tieBreak.map(r=>r.id),[1,2,3]);assert.deepEqual(tieBreak.map(r=>r.rank),[1,2,3]);
 assert.deepEqual(standings([alliance(1),alliance(2),alliance(3)]).map(r=>r.rank),[1,1,1]);
 assert.equal(standings([alliance(1),alliance(2,0,10,0),alliance(3)]).find(r=>r.id===2).silver,10)});


test('Input validation rejects unknown sport and oversized text, and drops medal fields',()=>{assert.throws(()=>validateResult(result({sport_id:6})));assert.throws(()=>validateResult(result({event:'x'.repeat(161)})));assert.throws(()=>validateResult(result({revision:-1})));
 const legacy=validateResult(result({gold:1,silver:2,bronze:3}));
 for(const medal of ['gold','silver','bronze'])assert.equal(medal in legacy,false,medal+' khong con thuoc hop dong ket qua')});
test('D1-compatible full flow: viewer protection, update, retry and conflicts',async()=>{const {db,binding}=database();const env={DB:binding,...creds};let response=await call(env,'/api/scoreboard');let snapshot=await response.json();assert.equal(snapshot.alliances.length,3);assert.equal(snapshot.sports.length,5);assert.equal(snapshot.results.length,0);assert.ok(snapshot.standings.every(r=>r.gold+r.silver+r.bronze===0));assert.equal((await call(env,'/api/admin/results','POST',result())).status,401);assert.equal((await call(env,'/api/admin/results','POST',result(),{Cookie:'admin=999999999999.badsig'})).status,401);assert.equal((await call(env,'/api/admin/results','POST',result(),{...admin,Origin:'https://other.test'})).status,403);
response=await call(env,'/api/admin/results','POST',result(),admin);assert.equal(response.status,200);assert.equal((await response.json()).revision,1);assert.equal((await call(env,'/api/admin/results','POST',result(),admin)).status,200);snapshot=await (await call(env,'/api/scoreboard')).json();assert.equal(snapshot.results.length,1);
assert.ok(snapshot.standings.every(r=>r.gold+r.silver+r.bronze===0));for(const medal of ['gold','silver','bronze'])assert.equal(medal in snapshot.results[0],false,medal+' khong duoc lot ra ngoai qua /api/scoreboard');
assert.equal((await call(env,'/api/admin/results','POST',result({id:'00000000-0000-4000-8000-000000000002'}),admin)).status,409);const update=result({revision:1,score:'3-0'});assert.equal((await call(env,'/api/admin/results','POST',update,admin)).status,200);assert.equal((await call(env,'/api/admin/results','POST',update,admin)).status,200);assert.equal((await call(env,'/api/admin/results','POST',result({revision:1,score:'khac'}),admin)).status,409);snapshot=await (await call(env,'/api/scoreboard')).json();assert.equal(snapshot.results[0].revision,2);assert.equal(snapshot.results[0].score,'3-0');assert.equal((await call(env,'/api/admin/results','POST',result(),{Cookie:'admin='+await signSession('wrong-secret',Date.now()+3600000)})).status,401);db.close()});
test('Storage outage returns unavailable instead of fabricated zero scores',async()=>{const r=await call({},'/api/scoreboard');assert.equal(r.status,503);assert.ok((await r.json()).error)});
test('Delete requires admin and current revision; preserves other results',async()=>{const {db,binding}=database();const env={DB:binding,...creds};await call(env,'/api/admin/results','POST',result(),admin);await call(env,'/api/admin/results','POST',result({id:'00000000-0000-4000-8000-000000000002',event:'Other event'}),admin);const deletion={id:result().id,revision:1};assert.equal((await call(env,'/api/admin/results','DELETE',deletion)).status,401);assert.equal((await call(env,'/api/admin/results','DELETE',deletion,{Cookie:'admin=not-a-token'})).status,401);assert.equal((await call(env,'/api/admin/results','DELETE',deletion,{...admin,Origin:'https://other.test'})).status,403);assert.equal((await call(env,'/api/admin/results','DELETE',{...deletion,revision:2},admin)).status,409);assert.equal((await call(env,'/api/admin/results','DELETE',deletion,admin)).status,200);assert.equal((await call(env,'/api/admin/results','DELETE',deletion,admin)).status,200);const snapshot=await (await call(env,'/api/scoreboard')).json();assert.equal(snapshot.results.length,1);assert.equal(snapshot.results[0].event,'Other event');assert.equal((await call(env,'/api/admin/results','POST',result({revision:1}),admin)).status,409);db.close()});
test('Login issues an HttpOnly cookie only for the right credentials',async()=>{const {db,binding}=database();const env={DB:binding,...creds};
 const good=await call(env,'/api/admin/login','POST',{user:'bateco',pass:'123'});assert.equal(good.status,200);
 const setCookie=good.headers.get('Set-Cookie');assert.match(setCookie,/^admin=\d+\./);assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);
 const bad=await call(env,'/api/admin/login','POST',{user:'bateco',pass:'sai'});assert.equal(bad.status,401);assert.equal(bad.headers.get('Set-Cookie'),null);
 assert.equal((await call(env,'/api/admin/login','POST',{user:'khac',pass:'123'})).status,401);
 assert.equal((await call(env,'/api/admin/login','POST',{user:'bateco',pass:'123'},{Origin:'https://other.test'})).status,403);
 assert.equal((await call(env,'/api/admin/login','GET')).status,405);
 // The cookie just issued must actually authorise a write.
 assert.equal((await call(env,'/api/admin/results','POST',result(),{Cookie:setCookie.split(';')[0]})).status,200);
 assert.match((await call(env,'/api/admin/logout','POST',{},{Origin:origin})).headers.get('Set-Cookie'),/Max-Age=0/);
 assert.equal((await call(env,'/api/admin/logout','POST',{},{Origin:'https://other.test'})).status,403);db.close()});
test('Session cookies are rejected when expired, resigned or malformed',async()=>{const {db,binding}=database();const env={DB:binding,...creds};
 const expired='admin='+await signSession(SECRET,Date.now()-1);
 assert.equal((await call(env,'/api/admin/session','GET',undefined,{Cookie:expired})).status,401);
 const valid=await signSession(SECRET,Date.now()+3600000);
 const tampered='admin='+valid.slice(0,-1)+(valid.endsWith('A')?'B':'A');
 assert.equal((await call(env,'/api/admin/session','GET',undefined,{Cookie:tampered})).status,401);
 for(const raw of ['admin=','admin=abc','admin=.sig','admin=12x.sig','other=x'])
  assert.equal((await call(env,'/api/admin/session','GET',undefined,{Cookie:raw})).status,401);
 assert.equal((await call(env,'/api/admin/session','GET',undefined,admin)).status,200);
 // Missing secret must fail closed, never open.
 assert.equal((await call({DB:binding},'/api/admin/session','GET',undefined,admin)).status,401);db.close()});
test('safeEqual compares without leaking length or position',()=>{assert.equal(safeEqual('abc','abc'),true);assert.equal(safeEqual('abc','abd'),false);assert.equal(safeEqual('abc','abcd'),false);assert.equal(safeEqual('',''),true);assert.equal(safeEqual(undefined,'x'),false);assert.equal(safeEqual(null,null),true)});
test('Draw validation rejects bad sport, wrong column count, oversized cells and drops blank rows',()=>{
 assert.throws(()=>validateDraws({sport_id:6,rows:[]}));
 assert.throws(()=>validateDraws({sport_id:1,rows:[['a','b','c']]}));
 assert.throws(()=>validateDraws({sport_id:1,rows:[['a','b','c','d','e']]}));
 assert.throws(()=>validateDraws({sport_id:1,rows:[['x'.repeat(201),'','','']]}));
 assert.throws(()=>validateDraws({sport_id:1,rows:Array.from({length:61},()=>['a','','',''])}));
 assert.throws(()=>validateDraws({sport_id:1,rows:[[1,2,3,4]]}));
 assert.deepEqual(validateDraws({sport_id:1,rows:[['  A  ','B','',''],['','','','']]}).rows,[['A','B','','']]);
 assert.deepEqual(validateDraws({sport_id:2,rows:[]}),{sport_id:2,rows:[]})});
test('Draws require a session, replace the whole set per sport and leave other sports intact',async()=>{const {db,binding}=database();const env={DB:binding,...creds};
 const body={sport_id:1,rows:[['Bảng A','TP vs BP','Lượt 1','08:15']]};
 assert.equal((await call(env,'/api/admin/draws','POST',body)).status,401);
 assert.equal((await call(env,'/api/admin/draws','POST',body,{...admin,Origin:'https://other.test'})).status,403);
 assert.equal((await call(env,'/api/admin/draws','POST',{sport_id:9,rows:[]},admin)).status,400);
 // Writing on a database that has never been seeded must still satisfy the sports foreign key.
 assert.equal((await call(env,'/api/admin/draws','POST',{sport_id:1,rows:[['a','b','c','d'],['e','f','g','h'],['i','j','k','l']]},admin)).status,200);
 assert.equal((await call(env,'/api/admin/draws','POST',{sport_id:2,rows:[['Nữ 1.500m','Lan','Lượt 1','09:00']]},admin)).status,200);
 let snap=await (await call(env,'/api/scoreboard')).json();
 assert.equal(snap.draws.filter(d=>d.sport_id===1).length,3);
 assert.equal(snap.draws.filter(d=>d.sport_id===2).length,1);
 assert.deepEqual(snap.draws.filter(d=>d.sport_id===1).map(d=>d.ord),[0,1,2]);
 // Replacing sport 1 must not touch sport 2.
 assert.equal((await call(env,'/api/admin/draws','POST',{sport_id:1,rows:[['chi','con','mot','dong']]},admin)).status,200);
 snap=await (await call(env,'/api/scoreboard')).json();
 assert.equal(snap.draws.filter(d=>d.sport_id===1).length,1);
 assert.equal(snap.draws.filter(d=>d.sport_id===2).length,1);
 // Empty rows clears just that sport.
 assert.equal((await call(env,'/api/admin/draws','POST',{sport_id:1,rows:[]},admin)).status,200);
 snap=await (await call(env,'/api/scoreboard')).json();
 assert.equal(snap.draws.filter(d=>d.sport_id===1).length,0);
 assert.equal(snap.draws.filter(d=>d.sport_id===2).length,1);db.close()});
test('Missing deploy config is reported as a server problem, not a wrong password',async()=>{const {db,binding}=database();
 for(const absent of ['ADMIN_USER','ADMIN_PASS','SESSION_SECRET']){
  const env={DB:binding,...creds};delete env[absent];
  const r=await call(env,'/api/admin/login','POST',{user:'bateco',pass:'123'});
  assert.equal(r.status,503,absent+' phải trả 503 thay vì 401');
  assert.equal(r.headers.get('Set-Cookie'),null);
  assert.doesNotMatch((await r.json()).error,/mật khẩu không đúng/)}
 // Correct credentials with full config still work, so the guard did not over-trigger.
 assert.equal((await call({DB:binding,...creds},'/api/admin/login','POST',{user:'bateco',pass:'123'})).status,200);db.close()});
const bracket=(overrides={})=>({sport_id:3,teams:['A','B','C','D','E','F','G','H'],matches:Object.fromEntries(['QF1','QF2','QF3','QF4','SF1','SF2','F'].map(c=>[c,{score:'',winner:null}])),...overrides});
test('Bracket validation enforces 8 slots, the exact 7 match codes and a valid winner',()=>{
 assert.throws(()=>validateBracket(bracket({teams:['A']})));
 assert.throws(()=>validateBracket(bracket({teams:new Array(9).fill('A')})));
 assert.throws(()=>validateBracket(bracket({sport_id:6})));
 assert.throws(()=>validateBracket(bracket({teams:['x'.repeat(121),'B','C','D','E','F','G','H']})));
 const missing={...bracket().matches};delete missing.F;
 assert.throws(()=>validateBracket(bracket({matches:missing})));
 assert.throws(()=>validateBracket(bracket({matches:{...bracket().matches,QF5:{score:'',winner:null}}})));
 assert.throws(()=>validateBracket(bracket({matches:{...bracket().matches,F:{score:'',winner:3}}})));
 assert.throws(()=>validateBracket(bracket({matches:{...bracket().matches,F:{score:'x'.repeat(41),winner:null}}})));
 const ok=validateBracket(bracket({teams:[' A ','B','C','D','E','F','G','H'],matches:{...bracket().matches,QF1:{score:'2-1',winner:1}}}));
 assert.equal(ok.teams[0],'A');
 assert.equal(ok.matches.QF1.winner,1);
 assert.equal(ok.matches.F.winner,null)});
test('Bracket route requires admin and keeps exactly one row per sport',async()=>{const {db,binding}=database();const env={DB:binding,...creds};
 assert.equal((await call(env,'/api/admin/bracket','POST',bracket())).status,401);
 assert.equal((await call(env,'/api/admin/bracket','POST',bracket(),{Cookie:'admin=not-a-token'})).status,401);
 assert.equal((await call(env,'/api/admin/bracket','POST',bracket(),{...admin,Origin:'https://other.test'})).status,403);
 assert.equal((await call(env,'/api/admin/bracket','POST',bracket({teams:['A']}),admin)).status,400);
 assert.equal((await call(env,'/api/admin/bracket','POST',bracket(),admin)).status,200);
 let snapshot=await (await call(env,'/api/scoreboard')).json();
 assert.equal(snapshot.brackets.length,1);
 assert.equal(snapshot.brackets[0].sport_id,3);
 assert.deepEqual(snapshot.brackets[0].data.teams,['A','B','C','D','E','F','G','H']);
 // Ghi de phai thay ca dong, khong duoc de lai ban ghi thu hai cho cung mot mon.
 assert.equal((await call(env,'/api/admin/bracket','POST',bracket({teams:['Z','B','C','D','E','F','G','H'],matches:{...bracket().matches,QF1:{score:'2-0',winner:2}}}),admin)).status,200);
 snapshot=await (await call(env,'/api/scoreboard')).json();
 assert.equal(snapshot.brackets.length,1);
 assert.equal(snapshot.brackets[0].data.teams[0],'Z');
 assert.equal(snapshot.brackets[0].data.matches.QF1.winner,2);
 db.close()});
test('Scoreboard keeps serving standings when the bracket table cannot be read',async()=>{const {db,binding}=database();
 // Mô phỏng production chưa migrate: bảng brackets chưa tồn tại.
 db.exec('DROP TABLE brackets');
 const env={DB:binding,...creds};
 assert.equal((await call(env,'/api/admin/results','POST',result(),admin)).status,200);
 const response=await call(env,'/api/scoreboard');
 assert.equal(response.status,200);
 const snapshot=await response.json();
 assert.deepEqual(snapshot.brackets,[]);
 assert.equal(snapshot.results.length,1);
 assert.equal((await call(env,'/api/admin/medals','POST',medalBody({alliance_id:1,gold:1}),admin)).status,200);
 const after=await (await call(env,'/api/scoreboard')).json();
 assert.equal(after.standings[0].id,1);
 assert.equal(after.standings[0].gold,1);
 db.close()});
test('Medal validation rejects unknown alliance, negative, fractional and oversized totals',()=>{
 assert.throws(()=>validateMedals(medalBody({alliance_id:0})));
 assert.throws(()=>validateMedals(medalBody({alliance_id:4})));
 assert.throws(()=>validateMedals(medalBody({alliance_id:'1'})));
 assert.throws(()=>validateMedals(medalBody({gold:-1})));
 assert.throws(()=>validateMedals(medalBody({silver:1.5})));
 assert.throws(()=>validateMedals(medalBody({bronze:1000})));
 assert.throws(()=>validateMedals(medalBody({gold:null})));
 assert.throws(()=>validateMedals([]));
 assert.deepEqual(validateMedals(medalBody({alliance_id:3,gold:7,silver:0,bronze:12})),{alliance_id:3,gold:7,silver:0,bronze:12})});
test('Medals require a session, replace one alliance total and leave the others intact',async()=>{const {db,binding}=database();const env={DB:binding,...creds};
 const body=medalBody({alliance_id:2,gold:3,silver:1,bronze:0});
 assert.equal((await call(env,'/api/admin/medals','POST',body)).status,401);
 assert.equal((await call(env,'/api/admin/medals','POST',body,{Cookie:'admin=not-a-token'})).status,401);
 assert.equal((await call(env,'/api/admin/medals','POST',body,{...admin,Origin:'https://other.test'})).status,403);
 assert.equal((await call(env,'/api/admin/medals','POST',medalBody({alliance_id:9}),admin)).status,400);
 assert.equal((await call(env,'/api/admin/medals','POST',body,admin)).status,200);
 let snap=await (await call(env,'/api/scoreboard')).json();
 assert.equal(snap.standings.find(a=>a.id===2).gold,3);
 assert.equal(snap.standings.find(a=>a.id===2).silver,1);
 assert.ok(snap.standings.filter(a=>a.id!==2).every(a=>a.gold+a.silver+a.bronze===0),'ghi mot lien minh khong duoc dung hai lien minh con lai');
 assert.equal((await call(env,'/api/admin/medals','POST',medalBody({alliance_id:2,gold:0,silver:0,bronze:5}),admin)).status,200);
 snap=await (await call(env,'/api/scoreboard')).json();
 assert.equal(snap.standings.find(a=>a.id===2).gold,0,'ghi de phai thay ca ba loai, khong cong don');
 assert.equal(snap.standings.find(a=>a.id===2).bronze,5);db.close()});
test('Medals can be written on a database that has never been seeded',async()=>{const {db,binding}=database();const env={DB:binding,...creds};
 assert.equal((await call(env,'/api/admin/medals','POST',medalBody({alliance_id:1,gold:2}),admin)).status,200);
 const snap=await (await call(env,'/api/scoreboard')).json();
 assert.equal(snap.standings.find(a=>a.id===1).gold,2,'UPDATE tren DB chua seed se khop 0 dong neu thieu seed()');db.close()});
function clientConst(name){const L=fs.readFileSync('dist/app.js','utf8').split(/\r?\n/);const start=L.findIndex(l=>l.startsWith('const '+name+'='));
 if(start<0)throw Error('khong tim thay '+name+' trong dist/app.js');
 for(let end=start;end<L.length;end++){try{return new Function(L.slice(start,end+1).join('\n')+';return '+name)()}catch{}}
 throw Error('khong doc duoc '+name+' tu dist/app.js')}
const ruleDoc=(overrides={})=>({key:'tug',title:'Kéo co',quick:'Thành phần | 10 VĐV',notes:'Không thay người',full:'LUẬT THI ĐẤU KÉO CO',...overrides});
test('Rule text parsing keeps blocks in order and groups adjacent pipe rows into one table',()=>{
 const d=parseRuleDoc({title:' Kéo co ',quick:'Thành phần | 10 VĐV\n\nThể thức | Vòng tròn',notes:'Ý một\n\nÝ hai',full:'LUẬT THI ĐẤU KÉO CO\n1. Thành phần\nMỗi đội 10 VĐV.\nNội dung | Quy định\nSố hiệp | 01\n\nSau bảng'});
 assert.equal(d.title,'Kéo co');
 assert.deepEqual(d.quick,[['Thành phần','10 VĐV'],['Thể thức','Vòng tròn']]);
 assert.deepEqual(d.notes,['Ý một','Ý hai']);
 assert.deepEqual(d.blocks,[{type:'p',text:'LUẬT THI ĐẤU KÉO CO'},{type:'p',text:'1. Thành phần'},{type:'p',text:'Mỗi đội 10 VĐV.'},{type:'table',rows:[['Nội dung','Quy định'],['Số hiệp','01']]},{type:'p',text:'Sau bảng'}]);
 assert.deepEqual(parseRuleDoc({title:'x',quick:'',notes:'',full:'A | B\n\nC | D'}).blocks,[{type:'table',rows:[['A','B']]},{type:'table',rows:[['C','D']]}],'dòng trống phải cắt thành hai bảng riêng');
 assert.deepEqual(parseRuleDoc({title:'x',quick:'',notes:'',full:''}).blocks,[])});
test('Rule validation rejects unknown document, wrong types, oversized text and malformed table rows',()=>{
 assert.deepEqual(RULE_KEYS,['tug','men','women','relay','pickle','aoe','football']);
 assert.throws(()=>validateRules(ruleDoc({key:'khong-co'})));
 assert.throws(()=>validateRules(ruleDoc({key:undefined})));
 assert.throws(()=>validateRules(ruleDoc({title:''})));
 assert.throws(()=>validateRules(ruleDoc({title:'x'.repeat(121)})));
 assert.throws(()=>validateRules(ruleDoc({full:123})));
 assert.throws(()=>validateRules(ruleDoc({full:'x'.repeat(16001)})));
 assert.throws(()=>validateRules(ruleDoc({quick:'thiếu dấu gạch đứng'})),undefined,'Thông tin nhanh bắt buộc dạng nhãn | nội dung');
 assert.throws(()=>validateRules(ruleDoc({full:'A | B | C'})),undefined,'dòng bảng ba ô phải báo lỗi thay vì âm thầm cắt bớt');
 assert.throws(()=>validateRules([]));
 const ok=validateRules(ruleDoc());assert.equal(ok.key,'tug');assert.equal(ok.full,'LUẬT THI ĐẤU KÉO CO')});
test('Serialising the built-in rules and parsing them back reproduces every document',()=>{
 const fullRules=clientConst('fullRules'),ruleSummaries=clientConst('ruleSummaries');
 const blocksToText=clientConst('blocksToText'),pairsToText=clientConst('pairsToText');
 assert.equal(Object.keys(fullRules).length,6);
 assert.equal(Object.keys(ruleSummaries).length,6);
 for(const [k,base] of Object.entries(ruleSummaries)){
  const d=parseRuleDoc({title:base.title,quick:pairsToText(base.quick),notes:base.notes.join('\n'),full:blocksToText(fullRules[base.key])});
  assert.equal(d.title,base.title,k+': tên luật lệch');
  assert.deepEqual(d.quick,base.quick,k+': Thông tin nhanh không round-trip');
  assert.deepEqual(d.notes,base.notes,k+': Lưu ý quan trọng không round-trip');
  assert.deepEqual(d.blocks,fullRules[base.key],k+': toàn văn luật không round-trip')}});
test('Rules require a session and keep exactly one row per document',async()=>{const {db,binding}=database();const env={DB:binding,...creds};
 assert.equal((await call(env,'/api/admin/rules','POST',ruleDoc())).status,401);
 assert.equal((await call(env,'/api/admin/rules','POST',ruleDoc(),{Cookie:'admin=not-a-token'})).status,401);
 assert.equal((await call(env,'/api/admin/rules','POST',ruleDoc(),{...admin,Origin:'https://other.test'})).status,403);
 assert.equal((await call(env,'/api/admin/rules','POST',ruleDoc({key:'khong-co'}),admin)).status,400);
 assert.deepEqual(await (await call(env,'/api/rules')).json(),{rules:[]},'chưa nhập gì thì không có dòng nào để phủ lên mặc định');
 assert.equal((await call(env,'/api/admin/rules','POST',ruleDoc({full:'1. Mục\nNội dung | Quy định\nSố hiệp | 01'}),admin)).status,200);
 let r=(await (await call(env,'/api/rules')).json()).rules;
 assert.equal(r.length,1);assert.equal(r[0].key,'tug');
 assert.deepEqual(r[0].blocks,[{type:'p',text:'1. Mục'},{type:'table',rows:[['Nội dung','Quy định'],['Số hiệp','01']]}]);
 assert.equal(r[0].raw.full,'1. Mục\nNội dung | Quy định\nSố hiệp | 01','văn bản thô phải trả về nguyên vẹn để form nạp lại');
 assert.equal((await call(env,'/api/admin/rules','POST',ruleDoc({title:'Kéo co sửa lần hai'}),admin)).status,200);
 r=(await (await call(env,'/api/rules')).json()).rules;
 assert.equal(r.length,1,'ghi đè phải thay cả dòng, không để lại bản ghi thứ hai');
 assert.equal(r[0].title,'Kéo co sửa lần hai');
 assert.equal((await call(env,'/api/admin/rules','POST',ruleDoc({key:'football',title:'Bóng đá Nam'}),admin)).status,200);
 assert.equal((await (await call(env,'/api/rules')).json()).rules.length,2);db.close()});
test('Deleting a rule document restores the built-in default instead of leaving a permanent override',async()=>{const {db,binding}=database();const env={DB:binding,...creds};
 assert.equal((await call(env,'/api/admin/rules','POST',ruleDoc(),admin)).status,200);
 assert.equal((await call(env,'/api/admin/rules','DELETE',{key:'tug'})).status,401);
 assert.equal((await call(env,'/api/admin/rules','DELETE',{key:'tug'},{...admin,Origin:'https://other.test'})).status,403);
 assert.equal((await call(env,'/api/admin/rules','DELETE',{key:'khong-co'},admin)).status,400);
 assert.equal((await (await call(env,'/api/rules')).json()).rules.length,1);
 assert.equal((await call(env,'/api/admin/rules','DELETE',{key:'tug'},admin)).status,200);
 assert.deepEqual(await (await call(env,'/api/rules')).json(),{rules:[]},'xóa xong phải không còn dòng nào để trang lùi về nội dung nướng sẵn');
 assert.equal((await call(env,'/api/admin/rules','DELETE',{key:'tug'},admin)).status,200,'xóa lại lần nữa vẫn phải thành công');db.close()});
test('A missing rules table never takes the scoreboard down',async()=>{const {db,binding}=database();
 db.exec('DROP TABLE rules');
 const env={DB:binding,...creds};
 assert.equal((await call(env,'/api/admin/medals','POST',medalBody({alliance_id:2,gold:3}),admin)).status,200);
 const response=await call(env,'/api/scoreboard');
 assert.equal(response.status,200);
 const snapshot=await response.json();
 assert.equal(snapshot.standings[0].id,2);
 assert.equal(snapshot.standings[0].gold,3);
 const rules=await call(env,'/api/rules');
 assert.equal(rules.status,200,'luật hỏng phải trả danh sách rỗng, không phải 500');
 assert.deepEqual(await rules.json(),{rules:[]});db.close()});
