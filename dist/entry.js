// Nhập kết quả: một modal dùng chung cho cả ba section. Bước đăng nhập chỉ hiện khi
// chưa có phiên hợp lệ; form nhập liệu đổi theo section đã mở modal.
const entryEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.body.insertAdjacentHTML('beforeend','<dialog id="entry-dialog" class="admin-shell" aria-labelledby="entry-title"><div class="dialog-header"><p class="eyebrow" id="entry-eyebrow">NHẬP KẾT QUẢ</p><button type="button" class="button" id="entry-logout" hidden>Đăng xuất</button><button type="button" class="close" id="entry-close" aria-label="Đóng">×</button></div><h2 id="entry-title">Nhập kết quả</h2><div id="entry-body"></div></dialog>');
const entryDialog=document.querySelector('#entry-dialog'),entryBody=document.querySelector('#entry-body'),entryTitle=document.querySelector('#entry-title');
let entryTrigger=null,entryKind='result',entryBusy=false;

async function entryApi(path,options){const response=await fetch(path,{cache:'no-store',...options,signal:AbortSignal.timeout(15000)});let value;try{value=await response.json()}catch{throw Error('Không tải được dữ liệu. Vui lòng thử lại.')}if(!response.ok){const e=Error(value.error||'Không thể xử lý yêu cầu.');e.status=response.status;throw e}return value}
function entryLock(on){entryBusy=on;document.querySelector('#entry-close').disabled=on;entryBody.querySelectorAll('input,select,textarea,button').forEach(c=>c.disabled=on)}

function renderLogin(message){entryTitle.textContent='Đăng nhập để nhập kết quả';document.querySelector('#entry-logout').hidden=true;
 entryBody.innerHTML=`<form id="entry-login"><label>Tài khoản<input name="user" autocomplete="username" required autofocus></label><label>Mật khẩu<input name="pass" type="password" autocomplete="current-password" required></label><p id="entry-login-status" role="status">${entryEsc(message||'')}</p><div class="actions"><button class="button orange" type="submit">Đăng nhập</button></div></form>`;
 entryBody.querySelector('#entry-login').onsubmit=async e=>{e.preventDefault();if(entryBusy)return;const form=e.target,status=entryBody.querySelector('#entry-login-status');entryLock(true);status.textContent='Đang kiểm tra…';
  try{await entryApi('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:form.elements.user.value,pass:form.elements.pass.value})});entryLock(false);renderStep()}
  catch(err){entryLock(false);status.textContent=err.name==='TimeoutError'?'Máy chủ chưa phản hồi. Vui lòng thử lại.':err.message;form.elements.pass.focus();form.elements.pass.select()}}}

function renderStep(){document.querySelector('#entry-logout').hidden=false;entryKind==='draw'?renderDrawForm():entryKind==='bracket'?renderPickleForm():entryKind==='medal'?renderMedalForm():entryKind==='rules'?renderRulesForm():entryKind==='schedule'?renderScheduleForm():renderResultForm()}

function renderResultForm(){entryTitle.textContent='Nhập kết quả thi đấu';
 entryBody.innerHTML=`<form id="entry-result"><label>Môn thi đấu<select name="sport_id" required></select></label><label>Trận/Phần thi<input name="event" required maxlength="160" autocomplete="off"></label><label>Đội/VĐV<textarea name="participants" required maxlength="1000" rows="2"></textarea></label><label>Kết quả<textarea name="score" required maxlength="1000" rows="2"></textarea></label><div class="actions"><button class="button orange" type="submit" id="entry-save">Lưu kết quả</button><button class="button" type="button" id="entry-new">Nhập kết quả mới</button></div><p id="entry-status" role="status"></p></form><div class="admin-list-head"><h3>Kết quả đã nhập</h3></div><div id="entry-list"></div>`;
 const form=entryBody.querySelector('#entry-result');
 form.elements.sport_id.innerHTML=liveData.sports.map(s=>`<option value="${s.id}">${entryEsc(s.name)} – ${entryEsc(s.discipline)}</option>`).join('');
 const activeTab=document.querySelector('#ket-qua [data-result][aria-selected="true"]');
 if(activeTab)form.elements.sport_id.value=String(Number(activeTab.dataset.result)+1);
 let recordId=crypto.randomUUID(),revision=0;
 const fresh=()=>{recordId=crypto.randomUUID();revision=0;for(const k of ['event','participants','score'])form.elements[k].value='';entryBody.querySelector('#entry-save').textContent='Lưu kết quả';entryBody.querySelector('#entry-status').textContent=''};
 entryBody.querySelector('#entry-new').onclick=()=>{if(!entryBusy)fresh()};
 function renderList(){const rows=liveData.results;entryBody.querySelector('#entry-list').innerHTML=rows.length?rows.map(r=>{const sport=liveData.sports.find(s=>s.id===r.sport_id);return `<article class="admin-record"><div class="record-details"><h4>${entryEsc(r.event)}</h4><dl><dt>Môn thi đấu</dt><dd>${entryEsc(sport?.name)} – ${entryEsc(sport?.discipline)}</dd><dt>Đội/VĐV</dt><dd>${entryEsc(r.participants)}</dd><dt>Kết quả</dt><dd>${entryEsc(r.score)}</dd></dl></div><div class="record-actions"><button type="button" class="button" data-entry-edit="${entryEsc(r.id)}">Sửa</button><button type="button" class="button delete-result" data-entry-del="${entryEsc(r.id)}">Xóa</button></div></article>`}).join(''):'<p class="muted">Chưa có kết quả nào được nhập.</p>';
  entryBody.querySelectorAll('[data-entry-edit]').forEach(b=>b.onclick=()=>{if(entryBusy)return;const r=liveData.results.find(r=>r.id===b.dataset.entryEdit);recordId=r.id;revision=r.revision;for(const k of ['sport_id','event','participants','score'])form.elements[k].value=r[k]??'';entryBody.querySelector('#entry-save').textContent='Cập nhật kết quả';entryBody.querySelector('#entry-status').textContent='Đang sửa kết quả đã lưu.';form.elements.event.focus()});
  entryBody.querySelectorAll('[data-entry-del]').forEach(b=>b.onclick=async()=>{if(entryBusy)return;const r=liveData.results.find(r=>r.id===b.dataset.entryDel);if(!await confirmDialog(`Xóa kết quả “${r.event}”? Thao tác không thể hoàn tác.`,'Xóa'))return;const status=entryBody.querySelector('#entry-status');entryLock(true);status.textContent='Đang xóa…';
   try{await entryApi('/api/admin/results',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:r.id,revision:r.revision})});await sync(true);entryLock(false);if(recordId===r.id)fresh();renderList();status.textContent='Đã xóa kết quả.'}
   catch(err){entryLock(false);status.textContent=err.message}})}
 renderList();
 form.onsubmit=async e=>{e.preventDefault();if(entryBusy||!form.reportValidity())return;const status=entryBody.querySelector('#entry-status');
  const payload={id:recordId,revision,sport_id:Number(form.elements.sport_id.value)};
  for(const k of ['event','participants','score'])payload[k]=form.elements[k].value;
  entryLock(true);status.textContent='Đang lưu…';
  try{await entryApi('/api/admin/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});await sync(true);entryLock(false);fresh();renderList();status.textContent='Đã lưu. Bảng kết quả đã cập nhật.'}
  catch(err){entryLock(false);status.textContent=err.name==='TimeoutError'?'Chưa xác nhận được. Giữ nguyên nội dung và bấm lưu lại để kiểm tra.':err.message}}}

const RULE_DOCS=[['tug','Kéo co'],['men','Điền kinh – Nam 1.500m'],['women','Điền kinh – Nữ 1.500m'],['relay','Điền kinh – Chạy tiếp sức'],['pickle','Pickleball'],['aoe','AOE'],['football','Bóng đá Nam']];
function renderRulesForm(){entryTitle.textContent='Nhập luật thi đấu';
 let key=RULE_DOCS[0][0],dirty=false;
 entryBody.innerHTML=`<label>Tài liệu luật<select id="rule-doc">${RULE_DOCS.map(([k,l])=>`<option value="${k}">${entryEsc(l)}</option>`).join('')}</select></label><p class="muted">Mỗi dòng là một mục. Dòng dạng “cột 1 | cột 2” tạo một dòng bảng; các dòng bảng liền nhau gộp thành một bảng, dòng đầu là tiêu đề. Dòng trống kết thúc bảng.</p><form id="entry-rules"><label>Tên luật<input name="title" maxlength="120" required autocomplete="off"></label><label>Thông tin nhanh<textarea name="quick" rows="5" maxlength="4000"></textarea></label><label>Lưu ý quan trọng<textarea name="notes" rows="4" maxlength="4000"></textarea></label><label>Toàn văn luật<textarea name="full" rows="14" maxlength="16000"></textarea></label><div class="actions"><button class="button orange" type="submit" id="rules-save">Lưu luật</button><button class="button" type="button" id="rules-reset">Khôi phục mặc định</button></div><p id="entry-status" role="status"></p></form>`;
 const select=entryBody.querySelector('#rule-doc'),form=entryBody.querySelector('#entry-rules'),status=entryBody.querySelector('#entry-status');
 const load=()=>{const raw=ruleRawText(key);for(const k of ['title','quick','notes','full'])form.elements[k].value=raw[k]??'';dirty=false};
 load();
 loadRules().then(()=>{if(!dirty)load()});
 form.oninput=()=>{dirty=true};
 select.onchange=async()=>{if(entryBusy)return;
  if(dirty&&!await confirmDialog('Bỏ các thay đổi chưa lưu của tài liệu trước?','Bỏ thay đổi')){select.value=key;return}
  key=select.value;load();status.textContent=''};
 entryBody.querySelector('#rules-reset').onclick=async()=>{if(entryBusy)return;
  if(!await confirmDialog('Khôi phục tài liệu này về nội dung mặc định? Nội dung đã nhập sẽ bị xóa.','Khôi phục'))return;
  entryLock(true);status.textContent='Đang khôi phục…';
  try{await entryApi('/api/admin/rules',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});await loadRules();refreshRulesPanel();entryLock(false);load();status.textContent='Đã khôi phục nội dung mặc định.'}
  catch(err){entryLock(false);status.textContent=err.message}};
 form.onsubmit=async e=>{e.preventDefault();if(entryBusy||!form.reportValidity())return;
  const payload={key};for(const k of ['title','quick','notes','full'])payload[k]=form.elements[k].value;
  entryLock(true);status.textContent='Đang lưu…';
  try{await entryApi('/api/admin/rules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});await loadRules();refreshRulesPanel();entryLock(false);load();status.textContent='Đã lưu. Mục Luật Thi Đấu đã cập nhật.'}
  catch(err){entryLock(false);status.textContent=err.name==='TimeoutError'?'Chưa xác nhận được. Bấm lưu lại để kiểm tra.':err.message}}}
function renderMedalForm(){entryTitle.textContent='Nhập tổng huy chương';
 entryBody.innerHTML=`<p class="muted">Nhập tổng số huy chương mỗi liên minh đã giành. Lưu sẽ thay cả ba con số của liên minh đang chọn.</p><form id="entry-medal"><label>Liên minh<select name="alliance_id" required></select></label><div class="medal-inputs"><label>Tổng HCV<input name="gold" type="number" min="0" max="999" step="1" required></label><label>Tổng HCB<input name="silver" type="number" min="0" max="999" step="1" required></label><label>Tổng HCĐ<input name="bronze" type="number" min="0" max="999" step="1" required></label></div><div class="actions"><button class="button orange" type="submit" id="medal-save">Lưu huy chương</button></div><p id="entry-status" role="status"></p></form>`;
 const form=entryBody.querySelector('#entry-medal'),status=entryBody.querySelector('#entry-status');
 form.elements.alliance_id.innerHTML=liveData.alliances.map(a=>`<option value="${a.id}">LIÊN MINH ${entryEsc(a.name)}</option>`).join('');
 let prev={gold:0,silver:0,bronze:0};
 const load=()=>{const a=liveData.alliances.find(a=>a.id===Number(form.elements.alliance_id.value));prev={gold:a?.gold??0,silver:a?.silver??0,bronze:a?.bronze??0};for(const k of ['gold','silver','bronze'])form.elements[k].value=String(prev[k])};
 load();
 form.elements.alliance_id.onchange=()=>{if(entryBusy)return;load();status.textContent=''};
 form.onsubmit=async e=>{e.preventDefault();if(entryBusy||!form.reportValidity())return;
  const payload={alliance_id:Number(form.elements.alliance_id.value),prev};
  for(const k of ['gold','silver','bronze'])payload[k]=Number(form.elements[k].value);
  entryLock(true);status.textContent='Đang lưu…';
  try{await entryApi('/api/admin/medals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});await sync(true);entryLock(false);load();status.textContent='Đã lưu. Bảng tổng sắp đã cập nhật.'}
  catch(err){if(err.status===409){await sync(true);load()}entryLock(false);status.textContent=err.name==='TimeoutError'?'Chưa xác nhận được. Bấm lưu lại để kiểm tra.':err.message}}}
function renderScheduleForm(){entryTitle.textContent='Nhập lịch trình ngày hội thao';
 let dirty=false;
 entryBody.innerHTML=`<p class="muted">Mỗi dòng là một mục, dạng “giờ | hoạt động”. Thêm “| nhãn” ở cuối nếu muốn gắn nhãn cho mục đó. Dòng trống được bỏ qua.</p><form id="entry-schedule"><label>Lịch trình<textarea name="text" rows="12" maxlength="4000" required></textarea></label><div class="actions"><button class="button orange" type="submit" id="schedule-save">Lưu lịch trình</button><button class="button" type="button" id="schedule-reset">Khôi phục mặc định</button></div><p id="entry-status" role="status"></p></form>`;
 const form=entryBody.querySelector('#entry-schedule'),status=entryBody.querySelector('#entry-status');
 const load=()=>{form.elements.text.value=scheduleRawText();dirty=false};
 load();
 loadSchedule().then(()=>{if(!dirty)load()});
 form.oninput=()=>{dirty=true};
 entryBody.querySelector('#schedule-reset').onclick=async()=>{if(entryBusy)return;
  if(!await confirmDialog('Khôi phục lịch trình về nội dung mặc định? Nội dung đã nhập sẽ bị xóa.','Khôi phục'))return;
  entryLock(true);status.textContent='Đang khôi phục…';
  try{await entryApi('/api/admin/schedule',{method:'DELETE',headers:{'Content-Type':'application/json'},body:'{}'});await loadSchedule();renderSchedule();entryLock(false);load();status.textContent='Đã khôi phục nội dung mặc định.'}
  catch(err){entryLock(false);status.textContent=err.message}};
 form.onsubmit=async e=>{e.preventDefault();if(entryBusy||!form.reportValidity())return;
  entryLock(true);status.textContent='Đang lưu…';
  try{await entryApi('/api/admin/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:form.elements.text.value})});await loadSchedule();renderSchedule();entryLock(false);load();status.textContent='Đã lưu. Mục Lịch trình đã cập nhật.'}
  catch(err){entryLock(false);status.textContent=err.name==='TimeoutError'?'Chưa xác nhận được. Bấm lưu lại để kiểm tra.':err.message}}}
function renderDrawForm(){entryTitle.textContent='Nhập bảng đấu';
 const active=document.querySelector('#bang-dau [data-draw][aria-selected="true"]');
 let sport=active&&Number(active.dataset.draw)!==2?Number(active.dataset.draw):0,dirty=false;
 entryBody.innerHTML=`<label>Môn thi đấu<select id="draw-sport">${competitionViews.map((v,i)=>i===2?'':`<option value="${i}">${entryEsc(v.label)}</option>`).join('')}</select></label><p class="muted">Lưu sẽ thay thế toàn bộ bảng đấu của môn này.</p><div id="draw-rows"></div><div class="actions"><button class="button" type="button" id="draw-add">Thêm dòng</button><button class="button orange" type="button" id="draw-save">Lưu bảng đấu</button></div><p id="entry-status" role="status"></p>`;
 const select=entryBody.querySelector('#draw-sport'),host=entryBody.querySelector('#draw-rows'),status=entryBody.querySelector('#entry-status');
 select.value=String(sport);
 const stored=()=>(liveData.draws||[]).filter(d=>d.sport_id===sport+1).map(d=>[d.c1,d.c2,d.c3,d.c4]);
 let rows=stored();
 function draw(){const cols=competitionViews[sport].columns;
  host.innerHTML=rows.length?rows.map((row,i)=>`<article class="admin-record"><div class="record-details">${cols.map((c,k)=>`<label>${entryEsc(c)}<input data-row="${i}" data-col="${k}" maxlength="200" value="${entryEsc(row[k])}"></label>`).join('')}</div><div class="record-actions"><button type="button" class="button delete-result" data-drop="${i}">Xóa dòng</button></div></article>`).join(''):'<p class="muted">Chưa có dòng nào. Bấm “Thêm dòng” để bắt đầu.</p>';
  host.querySelectorAll('[data-row]').forEach(inp=>inp.oninput=()=>{rows[+inp.dataset.row][+inp.dataset.col]=inp.value;dirty=true});
  host.querySelectorAll('[data-drop]').forEach(b=>b.onclick=()=>{if(entryBusy)return;rows.splice(+b.dataset.drop,1);dirty=true;draw()})}
 draw();
 entryBody.querySelector('#draw-add').onclick=()=>{if(entryBusy)return;rows.push(['','','','']);dirty=true;draw();host.querySelector('[data-row="'+(rows.length-1)+'"]')?.focus()};
 select.onchange=async()=>{if(dirty&&!await confirmDialog('Bỏ các thay đổi chưa lưu của môn trước?','Bỏ thay đổi')){select.value=String(sport);return}sport=Number(select.value);rows=stored();dirty=false;status.textContent='';draw()};
 entryBody.querySelector('#draw-save').onclick=async()=>{if(entryBusy)return;entryLock(true);status.textContent='Đang lưu…';
  try{await entryApi('/api/admin/draws',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sport_id:sport+1,rows})});await sync(true);entryLock(false);rows=stored();dirty=false;draw();status.textContent='Đã lưu bảng đấu. Trang đã cập nhật.'}
  catch(err){entryLock(false);status.textContent=err.name==='TimeoutError'?'Chưa xác nhận được. Bấm lưu lại để kiểm tra.':err.message}}}

async function openEntry(button){entryTrigger=button;entryKind=button.dataset.entry;
 document.querySelector('#entry-eyebrow').textContent=entryKind==='draw'?'BẢNG ĐẤU':entryKind==='bracket'?'VÒNG BẢNG PICKLEBALL':entryKind==='medal'?'HUY CHƯƠNG':entryKind==='rules'?'LUẬT THI ĐẤU':entryKind==='schedule'?'LỊCH TRÌNH':'KẾT QUẢ THI ĐẤU';
 entryTitle.textContent='Đang kiểm tra phiên đăng nhập…';entryBody.innerHTML='';
 entryDialog.showModal();document.body.style.overflow='hidden';
 if(!liveData){entryBody.innerHTML='<p class="muted">Chưa tải được dữ liệu. Vui lòng đóng và thử lại.</p>';return}
 try{await entryApi('/api/admin/session');renderStep()}catch(err){renderLogin(err.message==='Vui lòng đăng nhập.'?'':err.message)}}

document.querySelectorAll('[data-entry]').forEach(b=>b.onclick=()=>openEntry(b));
document.querySelector('#entry-close').onclick=()=>entryDialog.close();
entryDialog.addEventListener('cancel',e=>{if(entryBusy)e.preventDefault()});
entryDialog.addEventListener('click',e=>{if(entryBusy||e.target!==entryDialog)return;const r=entryDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)entryDialog.close()});
entryDialog.addEventListener('close',()=>{document.body.style.overflow='';entryBody.innerHTML='';if(entryTrigger?.isConnected)entryTrigger.focus()});

const pickleSeatOptions=(g,selected)=>['<option value="">Chưa xác định</option>',...pickleGroups[g].map(([name],i)=>`<option value="${i}"${selected===i?' selected':''}>${entryEsc(name)}</option>`)].join('');
function renderPickleForm(){entryTitle.textContent='Nhập vòng bảng Pickleball';
 const state=pickleState();
 entryBody.innerHTML=`<p class="muted">Lưu sẽ thay thế toàn bộ tỉ số và kết quả vòng bảng của Pickleball. Hai đôi vào mỗi trận chung kết được suy ra từ Nhất/Nhì bảng và đội thắng bán kết, không nhập tay.</p><div id="bracket-form"></div><div class="actions"><button class="button orange" type="button" id="bracket-save">Lưu vòng bảng</button></div><p id="entry-status" role="status"></p>`;
 const host=entryBody.querySelector('#bracket-form'),status=entryBody.querySelector('#entry-status');
 const draw=()=>{const sides=pickleSides(state);
  host.innerHTML='<h3>Tỉ số vòng bảng</h3>'
   +pickleRounds.map((round,r)=>`<div class="admin-record"><div class="record-details"><h4>Lượt ${r+1}</h4>${round.map(([g,i,j],c)=>{const code=`R${r+1}C${c+1}`;
    return `<label>Sân ${c+1} · ${entryEsc(pickleGroups[g][i][0])} vs ${entryEsc(pickleGroups[g][j][0])}<input data-score="${code}" maxlength="40" autocomplete="off" placeholder="ví dụ 11-7" value="${entryEsc(state.scores[code])}"></label>`}).join('')}</div></div>`).join('')
   +'<h3>Nhất và Nhì mỗi bảng</h3>'
   +['A','B'].map(g=>`<div class="admin-record"><div class="record-details"><h4>Bảng ${g}</h4><label>Nhất bảng<select data-seat="${g}.first">${pickleSeatOptions(g,state.groups[g].first)}</select></label><label>Nhì bảng<select data-seat="${g}.second">${pickleSeatOptions(g,state.groups[g].second)}</select></label></div></div>`).join('')
   +'<h3>Vòng chung kết</h3>'
   +pickleFinalCodes.map(code=>{const m=state.finals[code],pair=sides[code],names=pickleFinalSlots[code];
    return `<div class="admin-record"><div class="record-details"><h4>${entryEsc(pickleFinalLabels[code])}</h4><label>Tỉ số<input data-score="${code}" maxlength="40" autocomplete="off" placeholder="ví dụ 11-9" value="${entryEsc(m.score)}"></label><label>Đội thắng<select data-winner="${code}"><option value=""${m.winner?'':' selected'}>Chưa đấu</option><option value="1"${m.winner===1?' selected':''}>${entryEsc(pair[0]||names[0])}</option><option value="2"${m.winner===2?' selected':''}>${entryEsc(pair[1]||names[1])}</option></select></label></div></div>`}).join('');
  host.querySelectorAll('[data-score]').forEach(inp=>inp.oninput=()=>{const code=inp.dataset.score;
   if(code in state.scores)state.scores[code]=inp.value;else state.finals[code].score=inp.value});
  host.querySelectorAll('[data-seat]').forEach(sel=>sel.onchange=()=>{const [g,key]=sel.dataset.seat.split('.');
   state.groups[g][key]=sel.value===''?null:Number(sel.value);draw()});
  host.querySelectorAll('[data-winner]').forEach(sel=>sel.onchange=()=>{state.finals[sel.dataset.winner].winner=sel.value?Number(sel.value):null;draw()})};
 draw();
 entryBody.querySelector('#bracket-save').onclick=async()=>{if(entryBusy)return;
  for(const g of ['A','B'])if(state.groups[g].first!==null&&state.groups[g].first===state.groups[g].second){status.textContent=`Bảng ${g}: Nhất bảng và Nhì bảng không thể là cùng một đôi.`;return}
  for(const g of ['A','B'])if(state.groups[g].first===null&&state.groups[g].second!==null){status.textContent=`Bảng ${g}: chọn Nhì bảng thì phải chọn cả Nhất bảng.`;return}
  entryLock(true);status.textContent='Đang lưu…';
  try{await entryApi('/api/admin/bracket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sport_id:3,scores:state.scores,groups:state.groups,finals:state.finals})});await sync(true);entryLock(false);
   Object.assign(state,pickleState());draw();status.textContent='Đã lưu vòng bảng. Trang đã cập nhật.'}
  catch(err){entryLock(false);status.textContent=err.name==='TimeoutError'?'Chưa xác nhận được. Bấm lưu lại để kiểm tra.':err.message}}}

// Modal xác nhận dùng chung, thay hộp thoại mặc định của trình duyệt. Truyền showCancel=false
// để dùng như hộp thông báo một nút.
document.body.insertAdjacentHTML('beforeend','<dialog id="confirm-dialog" class="admin-shell" aria-labelledby="confirm-title"><h2 id="confirm-title">Xác nhận</h2><p id="confirm-message"></p><div class="actions"><button type="button" class="button orange" id="confirm-yes">Có</button><button type="button" class="button" id="confirm-no">Không</button></div></dialog>');
const confirmDialogEl=document.querySelector('#confirm-dialog');
confirmDialogEl.addEventListener('click',e=>{if(e.target!==confirmDialogEl)return;const r=confirmDialogEl.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)confirmDialogEl.close()});
function confirmDialog(message,yesLabel='Có',showCancel=true){return new Promise(resolve=>{
 const yes=confirmDialogEl.querySelector('#confirm-yes'),no=confirmDialogEl.querySelector('#confirm-no');
 confirmDialogEl.querySelector('#confirm-message').textContent=message;
 confirmDialogEl.querySelector('#confirm-title').textContent=showCancel?'Xác nhận':'Không thể thực hiện';
 yes.textContent=yesLabel;no.hidden=!showCancel;
 let done=false;const finish=v=>{if(done)return;done=true;confirmDialogEl.close();resolve(v)};
 yes.onclick=()=>finish(true);no.onclick=()=>finish(false);
 confirmDialogEl.addEventListener('close',()=>finish(false),{once:true});
 confirmDialogEl.showModal();(showCancel?no:yes).focus()})}

document.querySelector('#entry-logout').onclick=async()=>{if(entryBusy)return;
 try{await entryApi('/api/admin/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})}catch{}
 await refreshAdminSession();entryDialog.close()};

// Xóa inline trên bảng công khai. Dùng uỷ quyền sự kiện vì live.js vẽ lại bảng mỗi 5 giây;
// gắn trực tiếp vào từng nút sẽ mất sau lần vẽ kế tiếp.
const postBracket=d=>entryApi('/api/admin/bracket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sport_id:3,scores:d.scores,groups:d.groups,finals:d.finals})});
async function inlineDelete(btn,run){btn.disabled=true;
 try{await run();await sync(true)}
 catch(err){await refreshAdminSession();await confirmDialog(err.name==='TimeoutError'?'Chưa xác nhận được. Tải lại trang rồi kiểm tra trước khi xóa lại.':err.message,'Đã hiểu',false)}
 finally{btn.disabled=false}}
document.addEventListener('click',async e=>{
 const btn=e.target.closest('[data-del-result],[data-del-draw],[data-del-match]');
 if(!btn||btn.disabled||entryBusy||!liveData)return;
 const d=btn.dataset;
 if(d.delResult){const r=liveData.results.find(x=>x.id===d.delResult);if(!r)return;
  if(!await confirmDialog(`Xóa kết quả “${r.event}”? Thao tác không thể hoàn tác.`,'Xóa'))return;
  return inlineDelete(btn,()=>entryApi('/api/admin/results',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:r.id,revision:r.revision})}))}
 if(d.delDraw!==undefined){const sport=Number(d.delSport),index=Number(d.delDraw);
  const rows=(liveData.draws||[]).filter(x=>x.sport_id===sport+1).map(x=>[x.c1,x.c2,x.c3,x.c4]);
  if(!rows[index])return;
  if(!await confirmDialog('Xóa dòng này khỏi bảng đấu? Thao tác không thể hoàn tác.','Xóa'))return;
  rows.splice(index,1);
  return inlineDelete(btn,()=>entryApi('/api/admin/draws',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sport_id:sport+1,rows})}))}
 if(d.delMatch){const code=d.delMatch,next=pickleState(),group=code in next.scores;
  if(!group&&!next.finals[code])return;
  const label=group?pickleMatchLabel(code):pickleFinalLabels[code];
  const warn=group?'':' Các vòng sau phụ thuộc vào kết quả này sẽ trống theo.';
  if(!await confirmDialog(`Xóa kết quả ${label}?${warn}`,'Xóa'))return;
  if(group)next.scores[code]='';else next.finals[code]={score:'',winner:null};
  return inlineDelete(btn,()=>postBracket(next))}});