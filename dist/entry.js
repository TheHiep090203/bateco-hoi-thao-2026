// Nhập kết quả: một modal dùng chung cho cả ba section. Bước đăng nhập chỉ hiện khi
// chưa có phiên hợp lệ; form nhập liệu đổi theo section đã mở modal.
const ENTRY_MEDALS={gold:'HCV',silver:'HCB',bronze:'HCĐ'};
const entryEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.body.insertAdjacentHTML('beforeend','<dialog id="entry-dialog" class="admin-shell" aria-labelledby="entry-title"><div class="dialog-header"><p class="eyebrow" id="entry-eyebrow">NHẬP KẾT QUẢ</p><button type="button" class="close" id="entry-close" aria-label="Đóng">×</button></div><h2 id="entry-title">Nhập kết quả</h2><div id="entry-body"></div></dialog>');
const entryDialog=document.querySelector('#entry-dialog'),entryBody=document.querySelector('#entry-body'),entryTitle=document.querySelector('#entry-title');
let entryTrigger=null,entryKind='result',entrySection='',entryBusy=false;

async function entryApi(path,options){const response=await fetch(path,{cache:'no-store',...options,signal:AbortSignal.timeout(15000)});let value;try{value=await response.json()}catch{throw Error('Không tải được dữ liệu. Vui lòng thử lại.')}if(!response.ok)throw Error(value.error||'Không thể xử lý yêu cầu.');return value}
function entryLock(on){entryBusy=on;document.querySelector('#entry-close').disabled=on;entryBody.querySelectorAll('input,select,textarea,button').forEach(c=>c.disabled=on)}

function renderLogin(message){entryTitle.textContent='Đăng nhập để nhập kết quả';
 entryBody.innerHTML=`<form id="entry-login"><label>Tài khoản<input name="user" autocomplete="username" required autofocus></label><label>Mật khẩu<input name="pass" type="password" autocomplete="current-password" required></label><p id="entry-login-status" role="status">${entryEsc(message||'')}</p><div class="actions"><button class="button orange" type="submit">Đăng nhập</button></div></form>`;
 entryBody.querySelector('#entry-login').onsubmit=async e=>{e.preventDefault();if(entryBusy)return;const form=e.target,status=entryBody.querySelector('#entry-login-status');entryLock(true);status.textContent='Đang kiểm tra…';
  try{await entryApi('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:form.elements.user.value,pass:form.elements.pass.value})});entryLock(false);renderStep()}
  catch(err){entryLock(false);status.textContent=err.name==='TimeoutError'?'Máy chủ chưa phản hồi. Vui lòng thử lại.':err.message;form.elements.pass.focus();form.elements.pass.select()}}}

function renderStep(){entryKind==='draw'?renderDrawForm():renderResultForm()}

function renderResultForm(){entryTitle.textContent='Nhập kết quả thi đấu';
 const note=entrySection==='huy-chuong'?'<p class="muted">Huy chương được cộng tự động từ kết quả thi đấu. Chọn liên minh nhận HCV/HCB/HCĐ ngay trong từng kết quả bên dưới.</p>':'';
 entryBody.innerHTML=`${note}<form id="entry-result"><label>Môn thi đấu<select name="sport_id" required></select></label><label>Trận/Phần thi<input name="event" required maxlength="160" autocomplete="off"></label><label>Đội/VĐV<textarea name="participants" required maxlength="1000" rows="2"></textarea></label><label>Kết quả<textarea name="score" required maxlength="1000" rows="2"></textarea></label><div class="medal-inputs"><label>Liên minh giành HCV<select name="gold"></select></label><label>Liên minh giành HCB<select name="silver"></select></label><label>Liên minh giành HCĐ<select name="bronze"></select></label></div><div class="actions"><button class="button orange" type="submit" id="entry-save">Lưu kết quả</button><button class="button" type="button" id="entry-new">Nhập kết quả mới</button></div><p id="entry-status" role="status"></p></form><div class="admin-list-head"><h3>Kết quả đã nhập</h3></div><div id="entry-list"></div>`;
 const form=entryBody.querySelector('#entry-result');
 form.elements.sport_id.innerHTML=liveData.sports.map(s=>`<option value="${s.id}">${entryEsc(s.name)} – ${entryEsc(s.discipline)}</option>`).join('');
 for(const medal of ['gold','silver','bronze'])form.elements[medal].innerHTML='<option value="">Chưa trao</option>'+liveData.alliances.map(a=>`<option value="${a.id}">LIÊN MINH ${entryEsc(a.name)}</option>`).join('');
 const activeTab=document.querySelector('#ket-qua [data-result][aria-selected="true"]');
 if(activeTab)form.elements.sport_id.value=String(Number(activeTab.dataset.result)+1);
 let recordId=crypto.randomUUID(),revision=0;
 const fresh=()=>{recordId=crypto.randomUUID();revision=0;for(const k of ['event','participants','score','gold','silver','bronze'])form.elements[k].value='';entryBody.querySelector('#entry-save').textContent='Lưu kết quả';entryBody.querySelector('#entry-status').textContent=''};
 entryBody.querySelector('#entry-new').onclick=()=>{if(!entryBusy)fresh()};
 function renderList(){const rows=liveData.results;entryBody.querySelector('#entry-list').innerHTML=rows.length?rows.map(r=>{const sport=liveData.sports.find(s=>s.id===r.sport_id);return `<article class="admin-record"><div class="record-details"><h4>${entryEsc(r.event)}</h4><dl><dt>Môn thi đấu</dt><dd>${entryEsc(sport?.name)} – ${entryEsc(sport?.discipline)}</dd><dt>Đội/VĐV</dt><dd>${entryEsc(r.participants)}</dd><dt>Kết quả</dt><dd>${entryEsc(r.score)}</dd>${['gold','silver','bronze'].map(m=>`<dt>${ENTRY_MEDALS[m]}</dt><dd>${r[m]?entryEsc(liveData.alliances.find(a=>a.id===r[m])?.name):'Chưa trao'}</dd>`).join('')}</dl></div><div class="record-actions"><button type="button" class="button" data-entry-edit="${entryEsc(r.id)}">Sửa</button><button type="button" class="button delete-result" data-entry-del="${entryEsc(r.id)}">Xóa</button></div></article>`}).join(''):'<p class="muted">Chưa có kết quả nào được nhập.</p>';
  entryBody.querySelectorAll('[data-entry-edit]').forEach(b=>b.onclick=()=>{if(entryBusy)return;const r=liveData.results.find(r=>r.id===b.dataset.entryEdit);recordId=r.id;revision=r.revision;for(const k of ['sport_id','event','participants','score','gold','silver','bronze'])form.elements[k].value=r[k]??'';entryBody.querySelector('#entry-save').textContent='Cập nhật kết quả';entryBody.querySelector('#entry-status').textContent='Đang sửa kết quả đã lưu. Huy chương cũ sẽ được thay bằng lựa chọn mới.';form.elements.event.focus()});
  entryBody.querySelectorAll('[data-entry-del]').forEach(b=>b.onclick=async()=>{if(entryBusy)return;const r=liveData.results.find(r=>r.id===b.dataset.entryDel);if(!confirm(`Xóa kết quả “${r.event}”? Huy chương của kết quả này sẽ bị loại khỏi bảng tổng sắp. Thao tác không thể hoàn tác.`))return;const status=entryBody.querySelector('#entry-status');entryLock(true);status.textContent='Đang xóa…';
   try{await entryApi('/api/admin/results',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:r.id,revision:r.revision})});await sync(true);entryLock(false);if(recordId===r.id)fresh();renderList();status.textContent='Đã xóa kết quả. Bảng tổng sắp đã được tính lại.'}
   catch(err){entryLock(false);status.textContent=err.message}})}
 renderList();
 form.onsubmit=async e=>{e.preventDefault();if(entryBusy||!form.reportValidity())return;const status=entryBody.querySelector('#entry-status');
  const payload={id:recordId,revision,sport_id:Number(form.elements.sport_id.value)};
  for(const k of ['event','participants','score'])payload[k]=form.elements[k].value;
  for(const k of ['gold','silver','bronze'])payload[k]=form.elements[k].value?Number(form.elements[k].value):null;
  entryLock(true);status.textContent='Đang lưu…';
  try{await entryApi('/api/admin/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});await sync(true);entryLock(false);fresh();renderList();status.textContent='Đã lưu. Bảng kết quả và bảng tổng sắp đã cập nhật.'}
  catch(err){entryLock(false);status.textContent=err.name==='TimeoutError'?'Chưa xác nhận được. Giữ nguyên nội dung và bấm lưu lại để kiểm tra.':err.message}}}

function renderDrawForm(){entryTitle.textContent='Nhập bảng đấu';
 const active=document.querySelector('#bang-dau [data-draw][aria-selected="true"]');
 let sport=active?Number(active.dataset.draw):0,dirty=false;
 entryBody.innerHTML=`<label>Môn thi đấu<select id="draw-sport">${competitionViews.map((v,i)=>`<option value="${i}">${entryEsc(v.label)}</option>`).join('')}</select></label><p class="muted">Lưu sẽ thay thế toàn bộ bảng đấu của môn này.</p><div id="draw-rows"></div><div class="actions"><button class="button" type="button" id="draw-add">Thêm dòng</button><button class="button orange" type="button" id="draw-save">Lưu bảng đấu</button></div><p id="entry-status" role="status"></p>`;
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
 select.onchange=()=>{if(dirty&&!confirm('Bỏ các thay đổi chưa lưu của môn trước?')){select.value=String(sport);return}sport=Number(select.value);rows=stored();dirty=false;status.textContent='';draw()};
 entryBody.querySelector('#draw-save').onclick=async()=>{if(entryBusy)return;entryLock(true);status.textContent='Đang lưu…';
  try{await entryApi('/api/admin/draws',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sport_id:sport+1,rows})});await sync(true);entryLock(false);rows=stored();dirty=false;draw();status.textContent='Đã lưu bảng đấu. Trang đã cập nhật.'}
  catch(err){entryLock(false);status.textContent=err.name==='TimeoutError'?'Chưa xác nhận được. Bấm lưu lại để kiểm tra.':err.message}}}

async function openEntry(button){entryTrigger=button;entryKind=button.dataset.entry;entrySection=button.dataset.section;
 document.querySelector('#entry-eyebrow').textContent=entryKind==='draw'?'BẢNG ĐẤU':'KẾT QUẢ THI ĐẤU';
 entryTitle.textContent='Đang kiểm tra phiên đăng nhập…';entryBody.innerHTML='';
 entryDialog.showModal();document.body.style.overflow='hidden';
 if(!liveData){entryBody.innerHTML='<p class="muted">Chưa tải được dữ liệu. Vui lòng đóng và thử lại.</p>';return}
 try{await entryApi('/api/admin/session');renderStep()}catch(err){renderLogin(err.message==='Vui lòng đăng nhập.'?'':err.message)}}

document.querySelectorAll('[data-entry]').forEach(b=>b.onclick=()=>openEntry(b));
document.querySelector('#entry-close').onclick=()=>entryDialog.close();
entryDialog.addEventListener('cancel',e=>{if(entryBusy)e.preventDefault()});
entryDialog.addEventListener('close',()=>{document.body.style.overflow='';entryBody.innerHTML='';if(entryTrigger?.isConnected)entryTrigger.focus()});
