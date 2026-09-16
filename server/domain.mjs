export const allianceData=[{id:1,name:'TIÊN PHONG',members:'CN1 + Cung ứng Đấu thầu + VP + Khối KHCTY'},{id:2,name:'BỨT PHÁ',members:'CN2 + BTC Quốc An + HO (Nhân sự + Kế toán + KSNB + Tài chính)'},{id:3,name:'CHINH PHỤC',members:'CN3 + BESIP + CNTT + Distributor + BTC Lai Châu + MJChem'}];
export const sportData=[{id:1,name:'Đoàn kết',discipline:'Kéo co 10v10'},{id:2,name:'Tốc độ',discipline:'Điền kinh'},{id:3,name:'Phối hợp',discipline:'Pickleball'},{id:4,name:'Esport',discipline:'PC'},{id:5,name:'Bóng đá Nam',discipline:'BATECO CUP'}];
export function standings(alliances){const rows=alliances.map(a=>({...a,gold:a.gold||0,silver:a.silver||0,bronze:a.bronze||0}));rows.sort((a,b)=>(b.gold+b.silver+b.bronze)-(a.gold+a.silver+a.bronze)||b.gold-a.gold||b.silver-a.silver||b.bronze-a.bronze||a.id-b.id);let rank=1;return rows.map((a,i)=>{if(i&&['gold','silver','bronze'].some(k=>a[k]!==rows[i-1][k]))rank=i+1;return {...a,rank,tied:rows.some(b=>b.id!==a.id&&['gold','silver','bronze'].every(k=>b[k]===a[k]))}})}
export function validateResult(body){if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Dữ liệu không hợp lệ.');const r={};if(typeof body.id!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(body.id))throw Error('Mã kết quả không hợp lệ.');r.id=body.id;if(!Number.isInteger(body.sport_id)||body.sport_id<1||body.sport_id>5)throw Error('Vui lòng chọn môn thi đấu.');r.sport_id=body.sport_id;for(const [field,label,max] of [['event','Trận/Phần thi',160],['participants','Đội/VĐV',1000],['score','Kết quả',1000]]){if(typeof body[field]!=='string'||!body[field].trim()||body[field].trim().length>max)throw Error(`${label}: cần nhập từ 1 đến ${max} ký tự.`);r[field]=body[field].trim()}if(!Number.isInteger(body.revision)||body.revision<0)throw Error('Phiên bản kết quả không hợp lệ.');r.revision=body.revision;return r}
export function validateMedals(body){if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Dữ liệu không hợp lệ.');if(!Number.isInteger(body.alliance_id)||body.alliance_id<1||body.alliance_id>3)throw Error('Vui lòng chọn liên minh.');const m={alliance_id:body.alliance_id};for(const [field,label] of [['gold','HCV'],['silver','HCB'],['bronze','HCĐ']]){const v=body[field];if(!Number.isInteger(v)||v<0||v>999)throw Error(`Tổng ${label}: cần nhập số nguyên từ 0 đến 999.`);m[field]=v}
 const prev=body.prev;if(!prev||typeof prev!=='object'||Array.isArray(prev))throw Error('Thiếu số liệu huy chương đang hiển thị trên form.');
 m.prev={};for(const field of ['gold','silver','bronze']){const v=prev[field];if(!Number.isInteger(v)||v<0||v>999)throw Error('Số liệu huy chương đang hiển thị trên form không hợp lệ.');m.prev[field]=v}
 return m}
export const RULE_KEYS=['tug','men','women','relay','pickle','aoe','football'];
function ruleCells(line,label,n){const cells=line.split('|').map(c=>c.trim());if(cells.length!==2||!cells[0])throw Error(`${label} (dòng ${n}): cần đúng dạng “cột 1 | cột 2”.`);return cells}
export function parseRuleDoc(doc){const blocks=[];let table=null;const split=t=>String(t??'').split(/\r?\n/);
 split(doc.full).forEach((raw,i)=>{const line=raw.trim();
  if(!line){table=null;return}
  if(line.includes('|')){const cells=ruleCells(line,'Toàn văn luật',i+1);if(!table){table={type:'table',rows:[]};blocks.push(table)}table.rows.push(cells)}
  else{table=null;blocks.push({type:'p',text:line})}});
 const quick=[];split(doc.quick).forEach((raw,i)=>{const line=raw.trim();if(line)quick.push(ruleCells(line,'Thông tin nhanh',i+1))});
 return {title:String(doc.title??'').trim(),quick,notes:split(doc.notes).map(l=>l.trim()).filter(Boolean),blocks}}
export function parseSchedule(text){const rows=[];
 String(text??'').split(/\r?\n/).forEach((raw,i)=>{const line=raw.trim();if(!line)return;
  const cells=line.split('|').map(c=>c.trim());
  if(cells.length<2||cells.length>3||!cells[0]||!cells[1])throw Error(`Lịch trình (dòng ${i+1}): cần đúng dạng “giờ | hoạt động”, thêm “| nhãn” nếu muốn gắn nhãn.`);
  rows.push(cells.length===3&&cells[2]?cells:[cells[0],cells[1]])});
 return rows}
export function validateSchedule(body){if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Dữ liệu không hợp lệ.');
 const text=body.text;if(typeof text!=='string')throw Error('Lịch trình: cần nhập văn bản.');
 if(text.length>4000)throw Error('Lịch trình: tối đa 4000 ký tự.');
 const rows=parseSchedule(text);
 if(!rows.length)throw Error('Lịch trình: cần ít nhất 01 dòng.');
 if(rows.length>40)throw Error('Lịch trình: tối đa 40 dòng.');
 return {text,rows}}
export function validateRules(body){if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Dữ liệu không hợp lệ.');
 if(!RULE_KEYS.includes(body.key))throw Error('Tài liệu luật không hợp lệ.');const doc={key:body.key};
 for(const [field,label,max] of [['title','Tên luật',120],['quick','Thông tin nhanh',4000],['notes','Lưu ý quan trọng',4000],['full','Toàn văn luật',16000]]){
  const v=body[field];if(typeof v!=='string')throw Error(`${label}: cần nhập văn bản.`);if(v.length>max)throw Error(`${label}: tối đa ${max} ký tự.`);doc[field]=v}
 if(!doc.title.trim())throw Error('Tên luật: cần nhập từ 1 đến 120 ký tự.');
 parseRuleDoc(doc);return doc}
export function safeEqual(a,b){a=String(a??'');b=String(b??'');if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
function base64url(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function sign(secret,payload){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return base64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))))}
export async function signSession(secret,exp){return exp+'.'+await sign(secret,String(exp))}
export async function verifySession(secret,token,nowMs){if(!secret||typeof token!=='string')return false;const dot=token.indexOf('.');if(dot<1)return false;const exp=token.slice(0,dot),sig=token.slice(dot+1);if(!/^\d{1,15}$/.test(exp)||Number(exp)<=nowMs||!sig)return false;return safeEqual(sig,await sign(secret,exp))}
export function validateDraws(body){if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Dữ liệu không hợp lệ.');if(!Number.isInteger(body.sport_id)||body.sport_id<1||body.sport_id>5)throw Error('Vui lòng chọn môn thi đấu.');if(!Array.isArray(body.rows))throw Error('Danh sách bảng đấu không hợp lệ.');if(body.rows.length>60)throw Error('Bảng đấu tối đa 60 dòng.');const rows=[];for(const row of body.rows){if(!Array.isArray(row)||row.length!==4)throw Error('Mỗi dòng bảng đấu cần đúng 4 ô.');const cells=row.map(c=>{if(typeof c!=='string')throw Error('Nội dung bảng đấu không hợp lệ.');const v=c.trim();if(v.length>200)throw Error('Mỗi ô bảng đấu tối đa 200 ký tự.');return v});if(cells.some(c=>c))rows.push(cells)}return {sport_id:body.sport_id,rows}}
export const pickleScoreCodes=Array.from({length:5},(_,r)=>Array.from({length:4},(_,c)=>`R${r+1}C${c+1}`)).flat();
export const pickleFinalCodes=['SF1','SF2','GOLD','BRONZE'];
export function validatePickleball(body){if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Dữ liệu không hợp lệ.');
 if(!Number.isInteger(body.sport_id)||body.sport_id<1||body.sport_id>5)throw Error('Vui lòng chọn môn thi đấu.');
 const readScore=(v,label)=>{if(typeof v!=='string')throw Error(`${label}: tỉ số không hợp lệ.`);const s=v.trim();if(s.length>40)throw Error(`${label}: tỉ số tối đa 40 ký tự.`);return s};
 const src=body.scores;if(!src||typeof src!=='object'||Array.isArray(src))throw Error('Danh sách tỉ số vòng bảng không hợp lệ.');
 const scoreKeys=Object.keys(src);if(scoreKeys.length!==pickleScoreCodes.length||pickleScoreCodes.some(c=>!scoreKeys.includes(c)))throw Error('Danh sách tỉ số vòng bảng cần đúng 20 trận.');
 const scores={};for(const code of pickleScoreCodes)scores[code]=readScore(src[code],'Trận '+code);
 const src2=body.groups;if(!src2||typeof src2!=='object'||Array.isArray(src2))throw Error('Kết quả xếp hạng hai bảng không hợp lệ.');
 const groupKeys=Object.keys(src2);if(groupKeys.length!==2||!groupKeys.includes('A')||!groupKeys.includes('B'))throw Error('Kết quả xếp hạng cần đúng hai bảng A và B.');
 const groups={};for(const name of ['A','B']){const row=src2[name];
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error(`Bảng ${name}: kết quả xếp hạng không hợp lệ.`);
  const seat=key=>{const v=row[key];if(v===null)return null;if(!Number.isInteger(v)||v<0||v>4)throw Error(`Bảng ${name}: ${key==='first'?'Nhất':'Nhì'} bảng không hợp lệ.`);return v};
  const first=seat('first'),second=seat('second');
  if(first!==null&&first===second)throw Error(`Bảng ${name}: Nhất bảng và Nhì bảng không thể là cùng một đôi.`);
  if(first===null&&second!==null)throw Error(`Bảng ${name}: chọn Nhì bảng thì phải chọn cả Nhất bảng.`);
  groups[name]={first,second}}
 const src3=body.finals;if(!src3||typeof src3!=='object'||Array.isArray(src3))throw Error('Kết quả vòng chung kết không hợp lệ.');
 const finalKeys=Object.keys(src3);if(finalKeys.length!==pickleFinalCodes.length||pickleFinalCodes.some(c=>!finalKeys.includes(c)))throw Error('Vòng chung kết cần đúng 04 trận.');
 const finals={};for(const code of pickleFinalCodes){const m=src3[code];
  if(!m||typeof m!=='object'||Array.isArray(m))throw Error(`Trận ${code}: kết quả không hợp lệ.`);
  if(m.winner!==null&&m.winner!==1&&m.winner!==2)throw Error(`Trận ${code}: đội thắng không hợp lệ.`);
  finals[code]={score:readScore(m.score,'Trận '+code),winner:m.winner}}
 return {sport_id:body.sport_id,scores,groups,finals}}