import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import worker from '../server/worker.mjs';import {standings,allianceData,validateResult,validateDraws,validateBracket,safeEqual,signSession} from '../server/domain.mjs';
function database(){const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));const binding={prepare(sql){return {args:[],bind(...args){this.args=args;return this},async first(){return db.prepare(sql).get(...this.args)||null},async run(){const r=db.prepare(sql).run(...this.args);return {success:true,meta:{changes:r.changes}}},async all(){return {results:db.prepare(sql).all(...this.args)}}}},async batch(statements){db.exec('BEGIN');try{const r=[];for(const s of statements){try{r.push(await s.all())}catch{r.push(await s.run())}}db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};return {db,binding}}
const origin='https://scoreboard.test';const SECRET='test-session-secret';
const creds={ADMIN_USER:'bateco',ADMIN_PASS:'123',SESSION_SECRET:SECRET};
const admin={Cookie:'admin='+await signSession(SECRET,Date.now()+3600000)};
function call(env,path,method='GET',body,headers={}){return worker.fetch(new Request(origin+path,{method,headers:{...(body?{'Origin':origin,'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined}),env)}
const result=(overrides={})=>({id:'00000000-0000-4000-8000-000000000001',sport_id:1,event:'Nội dung kiểm thử',participants:'Đội kiểm thử',score:'2–1',gold:1,silver:2,bronze:3,revision:0,...overrides});
test('Ranking uses gold, silver, bronze in priority order and equal totals tie',()=>{const rows=standings(allianceData,[{gold:1,silver:2,bronze:3},{gold:2,silver:2,bronze:3}]);assert.deepEqual(rows.map(r=>r.id),[2,1,3]);assert.deepEqual(standings(allianceData,[]).map(r=>r.rank),[1,1,1]);assert.equal(standings(allianceData,Array.from({length:10},()=>({silver:2}))).find(r=>r.id===2).silver,10)});
test('Input validation rejects unknown sport, oversized text and invalid medal',()=>{assert.throws(()=>validateResult(result({sport_id:6})));assert.throws(()=>validateResult(result({event:'x'.repeat(161)})));assert.throws(()=>validateResult(result({gold:4})));assert.throws(()=>validateResult(result({revision:-1})));assert.equal(validateResult(result({gold:null})).gold,null)});
test('D1-compatible full flow: viewer protection, update, retry, conflicts and authoritative totals',async()=>{const {db,binding}=database();const env={DB:binding,...creds};let response=await call(env,'/api/scoreboard');let snapshot=await response.json();assert.equal(snapshot.alliances.length,3);assert.equal(snapshot.sports.length,5);assert.equal(snapshot.results.length,0);assert.equal((await call(env,'/api/admin/results','POST',result())).status,401);assert.equal((await call(env,'/api/admin/results','POST',result(),{Cookie:'admin=999999999999.badsig'})).status,401);assert.equal((await call(env,'/api/admin/results','POST',result(),{...admin,Origin:'https://other.test'})).status,403);
response=await call(env,'/api/admin/results','POST',result(),admin);assert.equal(response.status,200);assert.equal((await response.json()).revision,1);assert.equal((await call(env,'/api/admin/results','POST',result(),admin)).status,200);snapshot=await (await call(env,'/api/scoreboard')).json();assert.equal(snapshot.results.length,1);assert.equal(snapshot.standings[0].gold,1);
assert.equal((await call(env,'/api/admin/results','POST',result({id:'00000000-0000-4000-8000-000000000002'}),admin)).status,409);const update=result({revision:1,gold:3,silver:null,bronze:null});assert.equal((await call(env,'/api/admin/results','POST',update,admin)).status,200);assert.equal((await call(env,'/api/admin/results','POST',update,admin)).status,200);assert.equal((await call(env,'/api/admin/results','POST',result({revision:1,gold:2}),admin)).status,409);snapshot=await (await call(env,'/api/scoreboard')).json();assert.equal(snapshot.standings[0].id,3);assert.equal(snapshot.standings.find(r=>r.id===1).gold,0);assert.equal(snapshot.standings.find(r=>r.id===2).silver,0);assert.equal(snapshot.results[0].revision,2);assert.equal((await call(env,'/api/admin/results','POST',result({revision:2,gold:null,silver:null,bronze:null}),admin)).status,200);snapshot=await (await call(env,'/api/scoreboard')).json();assert.ok(snapshot.standings.every(r=>r.gold+r.silver+r.bronze===0));assert.equal((await call(env,'/api/admin/results','POST',result(),{Cookie:'admin='+await signSession('wrong-secret',Date.now()+3600000)})).status,401);db.close()});
test('Storage outage returns unavailable instead of fabricated zero scores',async()=>{const r=await call({},'/api/scoreboard');assert.equal(r.status,503);assert.ok((await r.json()).error)});
test('Delete requires admin and current revision; removes medals once and preserves other results',async()=>{const {db,binding}=database();const env={DB:binding,...creds};await call(env,'/api/admin/results','POST',result(),admin);await call(env,'/api/admin/results','POST',result({id:'00000000-0000-4000-8000-000000000002',event:'Other event',gold:2,silver:null,bronze:null}),admin);const deletion={id:result().id,revision:1};assert.equal((await call(env,'/api/admin/results','DELETE',deletion)).status,401);assert.equal((await call(env,'/api/admin/results','DELETE',deletion,{Cookie:'admin=not-a-token'})).status,401);assert.equal((await call(env,'/api/admin/results','DELETE',deletion,{...admin,Origin:'https://other.test'})).status,403);assert.equal((await call(env,'/api/admin/results','DELETE',{...deletion,revision:2},admin)).status,409);assert.equal((await call(env,'/api/admin/results','DELETE',deletion,admin)).status,200);assert.equal((await call(env,'/api/admin/results','DELETE',deletion,admin)).status,200);const snapshot=await (await call(env,'/api/scoreboard')).json();assert.equal(snapshot.results.length,1);assert.equal(snapshot.standings[0].id,2);assert.equal(snapshot.standings[0].gold,1);assert.equal(snapshot.standings.find(a=>a.id===1).gold,0);assert.equal(snapshot.standings.find(a=>a.id===3).bronze,0);assert.equal((await call(env,'/api/admin/results','POST',result({revision:1}),admin)).status,409);db.close()});
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
 assert.equal(snapshot.standings[0].gold,1);
 db.close()});
