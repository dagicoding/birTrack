(function(){
"use strict";

/* ============================================================================
   APP STATE
   ============================================================================ */
const SOURCES = ["Salary","Freelance","Business","Gift","Investment","Commission","Bonus","Allowance","Other"];

const State = {
  records: [],
  filter: { type:'last30', from:null, to:null },
  search: '',
  sort: 'newest',
  balanceHidden: false,
  editingId: null,
  pendingDeleteId: null,
  formSourceValue: null
};

/* ============================================================================
   DOM SHORTCUTS
   ============================================================================ */
const $ = (sel)=>document.querySelector(sel);
const $$ = (sel)=>Array.from(document.querySelectorAll(sel));

/* ============================================================================
   TOASTS
   ============================================================================ */
function toast(message, type){
  const el = document.createElement('div');
  el.className = 'toast' + (type==='err' ? ' err' : '');
  el.innerHTML = '<span class="material-icons">'+(type==='err'?'error':'check_circle')+'</span><span>'+message+'</span>';
  $('#toast-stack').appendChild(el);
  setTimeout(()=>el.remove(), 3300);
}

/* ============================================================================
   OVERLAY / SHEET / MODAL HELPERS
   ============================================================================ */
let openStack = [];
function showOverlay(){ $('#overlay').classList.add('show'); }
function hideOverlayIfEmpty(){ if(openStack.length===0) $('#overlay').classList.remove('show'); }

function openSheet(id){
  const el = document.getElementById(id);
  showOverlay();
  requestAnimationFrame(()=>el.classList.add('show'));
  openStack.push(id);
}
function closeSheet(id){
  const el = document.getElementById(id);
  el.classList.remove('show');
  openStack = openStack.filter(x=>x!==id);
  hideOverlayIfEmpty();
}
function openModal(id){
  const el = document.getElementById(id);
  showOverlay();
  requestAnimationFrame(()=>el.classList.add('show'));
  openStack.push(id);
}
function closeModal(id){
  const el = document.getElementById(id);
  el.classList.remove('show');
  openStack = openStack.filter(x=>x!==id);
  hideOverlayIfEmpty();
}
function closeTop(){
  if(openStack.length===0) return;
  const id = openStack[openStack.length-1];
  const el = document.getElementById(id);
  el.classList.remove('show');
  openStack.pop();
  hideOverlayIfEmpty();
}
$('#overlay').addEventListener('click', closeTop);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeTop(); });

/* swipe-down-to-close for sheets */
function enableSwipeDown(sheetEl){
  let startY = null, currentY = null, dragging = false;
  const handle = sheetEl.querySelector('.sheet-handle');
  const dragTarget = handle || sheetEl;
  dragTarget.addEventListener('touchstart', (e)=>{
    startY = e.touches[0].clientY; dragging = true; sheetEl.style.transition='none';
  }, {passive:true});
  dragTarget.addEventListener('touchmove', (e)=>{
    if(!dragging) return;
    currentY = e.touches[0].clientY;
    const delta = Math.max(0, currentY - startY);
    sheetEl.style.transform = `translate(-50%, ${delta}px)`;
  }, {passive:true});
  dragTarget.addEventListener('touchend', ()=>{
    sheetEl.style.transition = '';
    const delta = currentY && startY ? currentY - startY : 0;
    sheetEl.style.transform = '';
    if(delta > 100){
      const id = sheetEl.id;
      closeSheet(id);
    }
    startY=null; currentY=null; dragging=false;
  });
}
['sheet-form','sheet-filter','sheet-settings'].forEach(id=>enableSwipeDown(document.getElementById(id)));

/* ============================================================================
   RENDER: SOURCE GRID (used inside the add/edit form)
   ============================================================================ */
function buildSourceGrid(){
  const grid = $('#source-grid');
  grid.innerHTML = SOURCES.map(s=>(
    `<div class="source-opt" data-source="${s}" tabindex="0" role="button">
      <span class="material-icons">${Utils.sourceIcon(s)}</span>
      <span class="lbl">${s}</span>
    </div>`
  )).join('');
  grid.addEventListener('click', (e)=>{
    const opt = e.target.closest('.source-opt');
    if(!opt) return;
    selectSource(opt.dataset.source);
  });
}
function selectSource(source){
  State.formSourceValue = source;
  $('#f-source').value = source;
  $$('.source-opt').forEach(o=>o.classList.toggle('active', o.dataset.source===source));
  $('#field-source').classList.remove('invalid');
}

/* ============================================================================
   RENDER: DATE SELECT TRIOS (form + custom filter range)
   ============================================================================ */
function populateDateSelects(daySel, monthSel, yearSel, ey, em, ed){
  monthSel.innerHTML = Calendar.ET_MONTHS.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('');
  const yearNow = Calendar.todayEthiopian().year;
  let yearOpts = '';
  for(let y = yearNow+2; y >= yearNow-100; y--){ yearOpts += `<option value="${y}">${y}</option>`; }
  yearSel.innerHTML = yearOpts;

  function fillDays(){
    const y = parseInt(yearSel.value,10), m = parseInt(monthSel.value,10);
    const len = Calendar.monthLength(y,m);
    const cur = parseInt(daySel.value,10) || 1;
    let opts = '';
    for(let d=1; d<=len; d++){ opts += `<option value="${d}">${d}</option>`; }
    daySel.innerHTML = opts;
    daySel.value = Math.min(cur, len);
  }
  yearSel.value = ey; monthSel.value = em;
  fillDays();
  daySel.value = ed;
  monthSel.addEventListener('change', fillDays);
  yearSel.addEventListener('change', fillDays);
}

function initFormDateSelects(ey,em,ed){
  populateDateSelects($('#f-day'), $('#f-month'), $('#f-year'), ey, em, ed);
}
function initFilterDateSelects(){
  const t = Calendar.todayEthiopian();
  populateDateSelects($('#cf-day'), $('#cf-month'), $('#cf-year'), t.year, t.month, t.day);
  populateDateSelects($('#ct-day'), $('#ct-month'), $('#ct-year'), t.year, t.month, t.day);
}

/* ============================================================================
   FILTER / SEARCH / SORT PIPELINE
   ============================================================================ */
const FILTER_LABELS = {
  last7:'Last 7 Days', last30:'Last 30 Days', thismonth:'This Month',
  thisyear:'This Year', custom:'Custom Range'
};

function recordJDN(r){ return Calendar.jdnOfEthiopian(r.ethiopianDate.year, r.ethiopianDate.month, r.ethiopianDate.day); }

function matchesFilter(r){
  const today = Calendar.todayEthiopian();
  const todayJDN = Calendar.jdnOfEthiopian(today.year, today.month, today.day);
  const jdn = recordJDN(r);
  switch(State.filter.type){
    case 'last7': return (todayJDN - jdn) <= 6 && (todayJDN - jdn) >= 0;
    case 'last30': return (todayJDN - jdn) <= 29 && (todayJDN - jdn) >= 0;
    case 'thismonth': return r.ethiopianDate.year===today.year && r.ethiopianDate.month===today.month;
    case 'thisyear': return r.ethiopianDate.year===today.year;
    case 'custom': {
      if(!State.filter.from || !State.filter.to) return true;
      const fromJDN = Calendar.jdnOfEthiopian(State.filter.from.year, State.filter.from.month, State.filter.from.day);
      const toJDN = Calendar.jdnOfEthiopian(State.filter.to.year, State.filter.to.month, State.filter.to.day);
      const lo = Math.min(fromJDN,toJDN), hi = Math.max(fromJDN,toJDN);
      return jdn>=lo && jdn<=hi;
    }
    default: return true;
  }
}
function matchesSearch(r){
  if(!State.search) return true;
  const q = State.search.toLowerCase();
  return (r.source||'').toLowerCase().includes(q) ||
         (r.note||'').toLowerCase().includes(q) ||
         String(r.amount).includes(q);
}
function sortRecords(list){
  const arr = list.slice();
  switch(State.sort){
    case 'newest': arr.sort((a,b)=> recordJDN(b)-recordJDN(a) || new Date(b.createdAt)-new Date(a.createdAt)); break;
    case 'oldest': arr.sort((a,b)=> recordJDN(a)-recordJDN(b) || new Date(a.createdAt)-new Date(a.createdAt)); break;
    case 'highest': arr.sort((a,b)=> b.amount-a.amount); break;
    case 'lowest': arr.sort((a,b)=> a.amount-b.amount); break;
  }
  return arr;
}
function getVisibleRecords(){
  return sortRecords(State.records.filter(matchesFilter).filter(matchesSearch));
}

/* ============================================================================
   RENDER: BALANCE, STATS, LIST
   ============================================================================ */
function renderBalance(){
  const visible = State.records.filter(matchesFilter);
  const total = DB.calculateTotal(visible);
  if(State.balanceHidden){
    $('#balance-value').textContent = '••••••••';
  } else {
    Anim.countUp($('#balance-value'), 0, total, 700);
  }
  $('#balance-sub').innerHTML = visible.length
    ? `<b>${visible.length}</b> transaction${visible.length===1?'':'s'} in this period`
    : 'No transactions in this period';
  $('#filter-chip-label').textContent = FILTER_LABELS[State.filter.type];
}

function renderStats(){
  const today = Calendar.todayEthiopian();
  const todayTotal = DB.calculateTotal(State.records.filter(r=>r.ethiopianDate.year===today.year && r.ethiopianDate.month===today.month && r.ethiopianDate.day===today.day));
  const monthTotal = DB.calculateTotal(State.records.filter(r=>r.ethiopianDate.year===today.year && r.ethiopianDate.month===today.month));
  $('#stat-today').textContent = Utils.formatCompactETB(todayTotal);
  $('#stat-month').textContent = Utils.formatCompactETB(monthTotal);
  $('#stat-count').textContent = String(State.records.length);
  $$('.stat-card').forEach(c=>{
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = null;
  });
}

function renderList(){
  const visible = getVisibleRecords();
  const list = $('#tx-list');
  $('#history-count-label').textContent = `History · ${visible.length} record${visible.length===1?'':'s'}`;

  if(State.records.length === 0){
    list.innerHTML = '';
    $('#empty-state').classList.add('show');
    return;
  }
  $('#empty-state').classList.remove('show');

  if(visible.length === 0){
    list.innerHTML = `<div style="text-align:center; padding:36px 10px; color:var(--text-faint); font-size:13.5px; font-weight:600;">No matching transactions.</div>`;
    return;
  }

  list.innerHTML = visible.map((r,i)=>{
    const ed = Calendar.formatEthiopian(r.ethiopianDate);
    return `<div class="tx-card" tabindex="0" role="button" data-id="${r.id}" style="animation-delay:${Math.min(i,10)*35}ms">
      <div class="tx-icon"><span class="material-icons">${Utils.sourceIcon(r.source)}</span></div>
      <div class="tx-body">
        <div class="tx-source">${escapeHtml(r.source)}</div>
        <div class="tx-date">${ed}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amount">${State.balanceHidden ? '••••' : 'ETB '+Utils.formatETB(r.amount)}</div>
        <span class="material-icons tx-arrow">chevron_right</span>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.tx-card').forEach(card=>{
    card.addEventListener('click', ()=>openDetail(card.dataset.id));
    card.addEventListener('keydown', (e)=>{ if(e.key==='Enter') openDetail(card.dataset.id); });
  });
}

function escapeHtml(str){
  const d = document.createElement('div'); d.textContent = str==null?'':String(str); return d.innerHTML;
}

function renderAll(){
  renderBalance();
  renderStats();
  renderList();
}

/* ============================================================================
   ADD / EDIT FORM
   ============================================================================ */
function openAddForm(){
  State.editingId = null;
  $('#form-title').textContent = 'Add Income';
  $('#save-form-label').textContent = 'Save Income';
  $('#income-form').reset();
  $('#f-id').value = '';
  clearFormErrors();
  const t = Calendar.todayEthiopian();
  initFormDateSelects(t.year, t.month, t.day);
  selectSource(SOURCES[0]);
  openSheet('sheet-form');
}

function openEditForm(record){
  State.editingId = record.id;
  $('#form-title').textContent = 'Edit Income';
  $('#save-form-label').textContent = 'Update Income';
  clearFormErrors();
  $('#f-id').value = record.id;
  $('#f-amount').value = record.amount;
  $('#f-note').value = record.note || '';
  initFormDateSelects(record.ethiopianDate.year, record.ethiopianDate.month, record.ethiopianDate.day);
  selectSource(record.source);
  openSheet('sheet-form');
}

function clearFormErrors(){
  ['field-amount','field-source','field-date'].forEach(id=>$('#'+id).classList.remove('invalid'));
}

$('#btn-today').addEventListener('click', ()=>{
  const t = Calendar.todayEthiopian();
  $('#f-year').value = t.year;
  $('#f-month').value = t.month;
  $('#f-year').dispatchEvent(new Event('change'));
  $('#f-day').value = t.day;
});

$('#income-form').addEventListener('submit', function(e){
  e.preventDefault();
  clearFormErrors();
  let valid = true;
  const amount = parseFloat($('#f-amount').value);
  if(isNaN(amount) || amount <= 0){ $('#field-amount').classList.add('invalid'); valid = false; }
  if(!State.formSourceValue){ $('#field-source').classList.add('invalid'); valid = false; }
  const ey = parseInt($('#f-year').value,10), em = parseInt($('#f-month').value,10), ed = parseInt($('#f-day').value,10);
  if(!ey||!em||!ed){ $('#field-date').classList.add('invalid'); valid = false; }
  if(!valid) return;

  const note = $('#f-note').value.trim();
  const ethiopianDate = {year:ey, month:em, day:ed};

  const btn = $('#btn-save-form');
  btn.disabled = true;

  if(State.editingId){
    DB.update(State.editingId, {amount, source: State.formSourceValue, note, ethiopianDate}).then(()=>{
      afterMutation('Income updated successfully.');
      closeSheet('sheet-form');
    }).catch(onDbError).finally(()=>{ btn.disabled = false; });
  } else {
    const now = new Date().toISOString();
    const record = {
      id: Utils.uid(), amount, source: State.formSourceValue, note, ethiopianDate,
      createdAt: now, updatedAt: now, timestamp: Date.now()
    };
    DB.create(record).then(()=>{
      afterMutation('Income added successfully.', record.id);
      closeSheet('sheet-form');
    }).catch(onDbError).finally(()=>{ btn.disabled = false; });
  }
});

function onDbError(err){
  console.error(err);
  toast('Could not reach the cloud. Check your connection and try again.', 'err');
}

function afterMutation(message, scrollToId){
  loadRecords().then(()=>{
    renderAll();
    toast(message);
    if(scrollToId){
      requestAnimationFrame(()=>{
        const el = document.querySelector(`.tx-card[data-id="${scrollToId}"]`);
        if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
      });
    }
  });
}

/* ============================================================================
   TRANSACTION DETAIL MODAL
   ============================================================================ */
let activeRecord = null;
function openDetail(id){
  const r = State.records.find(x=>x.id===id);
  if(!r) return;
  activeRecord = r;
  $('#detail-icon').textContent = Utils.sourceIcon(r.source);
  $('#detail-amount').textContent = 'ETB ' + Utils.formatETB(r.amount);
  $('#detail-source').textContent = r.source;
  $('#detail-date').textContent = Calendar.formatEthiopian(r.ethiopianDate) + ' (' + gregorianLabel(r.ethiopianDate) + ')';
  if(r.note){
    $('#detail-note-row').style.display = '';
    $('#detail-note').textContent = r.note;
  } else {
    $('#detail-note-row').style.display = 'none';
  }
  $('#detail-created').textContent = Utils.formatDateTime(r.createdAt);
  $('#detail-modified').textContent = Utils.formatDateTime(r.updatedAt);
  $('#detail-id').textContent = r.id;
  openModal('modal-detail');
}
function gregorianLabel(ed){
  const g = Calendar.toGregorian(ed.year, ed.month, ed.day);
  const d = new Date(g.year, g.month-1, g.day);
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
$('#btn-detail-close').addEventListener('click', ()=>closeModal('modal-detail'));
$('#btn-detail-edit').addEventListener('click', ()=>{
  closeModal('modal-detail');
  setTimeout(()=>openEditForm(activeRecord), 150);
});
$('#btn-detail-delete').addEventListener('click', ()=>{
  State.pendingDeleteId = activeRecord.id;
  closeModal('modal-detail');
  setTimeout(()=>openModal('modal-confirm'), 150);
});
$('#btn-confirm-cancel').addEventListener('click', ()=>closeModal('modal-confirm'));
$('#btn-confirm-delete').addEventListener('click', ()=>{
  DB.remove(State.pendingDeleteId).then(()=>{
    closeModal('modal-confirm');
    afterMutation('Income deleted successfully.');
  }).catch(onDbError);
});

/* ============================================================================
   FILTER SHEET
   ============================================================================ */
function buildFilterOptions(){
  const opts = [
    {key:'last7', label:'Last 7 Days'},
    {key:'last30', label:'Last 30 Days'},
    {key:'thismonth', label:'This Month'},
    {key:'thisyear', label:'This Year'},
    {key:'custom', label:'Custom Date Range'}
  ];
  $('#filter-options').innerHTML = opts.map(o=>(
    `<div class="filter-opt ${State.filter.type===o.key?'active':''}" data-key="${o.key}">
      <div class="filter-opt-label">${o.label}</div>
      <div class="radio-dot"></div>
    </div>`
  )).join('');
  $$('.filter-opt').forEach(el=>{
    el.addEventListener('click', ()=>{
      $$('.filter-opt').forEach(o=>o.classList.remove('active'));
      el.classList.add('active');
      const key = el.dataset.key;
      $('#custom-range').classList.toggle('show', key==='custom');
      el.dataset.selected = 'true';
    });
  });
  $('#custom-range').classList.toggle('show', State.filter.type==='custom');
}
$('#btn-filter').addEventListener('click', ()=>{
  buildFilterOptions();
  initFilterDateSelects();
  openSheet('sheet-filter');
});
$('#btn-close-filter').addEventListener('click', ()=>closeSheet('sheet-filter'));
$('#btn-apply-filter').addEventListener('click', ()=>{
  const active = $('.filter-opt.active');
  const key = active ? active.dataset.key : 'last30';
  State.filter.type = key;
  if(key==='custom'){
    State.filter.from = { year:parseInt($('#cf-year').value,10), month:parseInt($('#cf-month').value,10), day:parseInt($('#cf-day').value,10) };
    State.filter.to = { year:parseInt($('#ct-year').value,10), month:parseInt($('#ct-month').value,10), day:parseInt($('#ct-day').value,10) };
  }
  closeSheet('sheet-filter');
  renderAll();
});

/* ============================================================================
   SEARCH + SORT
   ============================================================================ */
$('#search-input').addEventListener('input', Utils.debounce(function(e){
  State.search = e.target.value.trim();
  renderList();
}, 150));

const SORT_ORDER = ['newest','oldest','highest','lowest'];
const SORT_ICON = {newest:'south', oldest:'north', highest:'trending_up', lowest:'trending_down'};
$('#btn-sort').addEventListener('click', ()=>{
  const idx = SORT_ORDER.indexOf(State.sort);
  State.sort = SORT_ORDER[(idx+1)%SORT_ORDER.length];
  $('#btn-sort .material-icons').textContent = SORT_ICON[State.sort];
  $('#btn-sort').classList.add('active');
  toast('Sorted by ' + State.sort.charAt(0).toUpperCase()+State.sort.slice(1));
  renderList();
});

/* ============================================================================
   FAB / FORM SHEET WIRING
   ============================================================================ */
$('#btn-fab').addEventListener('click', (e)=>{ Anim.ripple(e, e.currentTarget); openAddForm(); });
$('#btn-empty-add').addEventListener('click', openAddForm);
$('#btn-close-form').addEventListener('click', ()=>closeSheet('sheet-form'));
$('#btn-cancel-form').addEventListener('click', ()=>closeSheet('sheet-form'));

/* ============================================================================
   EYE TOGGLE
   ============================================================================ */
$('#btn-eye').addEventListener('click', ()=>{
  State.balanceHidden = !State.balanceHidden;
  DB.saveSettings({balanceHidden: State.balanceHidden});
  $('#eye-icon').textContent = State.balanceHidden ? 'visibility_off' : 'visibility';
  renderBalance();
  renderList();
});

/* ============================================================================
   SETTINGS
   ============================================================================ */
$('#btn-settings').addEventListener('click', ()=>openSheet('sheet-settings'));
$('#btn-close-settings').addEventListener('click', ()=>closeSheet('sheet-settings'));

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', theme==='dark' ? '#0B100D' : '#F1F4F0');
  $('#opt-theme-dark').classList.toggle('active', theme==='dark');
  $('#opt-theme-light').classList.toggle('active', theme==='light');
  DB.saveSettings({theme});
}
$('#opt-theme-dark').addEventListener('click', ()=>applyTheme('dark'));
$('#opt-theme-light').addEventListener('click', ()=>applyTheme('light'));

$('#switch-anim').addEventListener('click', function(){
  const on = !this.classList.contains('on');
  this.classList.toggle('on', on);
  Anim.setEnabled(on);
  DB.saveSettings({animations:on});
});

$('#btn-reset-filters').addEventListener('click', ()=>{
  State.filter = {type:'last30', from:null, to:null};
  State.search = ''; $('#search-input').value='';
  State.sort = 'newest'; $('#btn-sort .material-icons').textContent = SORT_ICON.newest;
  renderAll();
  toast('Filters reset.');
});

/* ============================================================================
   PDF EXPORT  (replaces the old JSON import/export)
   ============================================================================ */
$('#btn-export-pdf').addEventListener('click', async ()=>{
  const btn = $('#btn-export-pdf');
  const icon = btn.querySelector('.material-icons');
  const originalIcon = icon.textContent;
  icon.textContent = 'hourglass_top';
  btn.disabled = true;
  try{
    const visible = getVisibleRecords();
    if(visible.length === 0){
      toast('Nothing to export in the current view.', 'err');
      return;
    }
    await PdfExport.exportStatement({
      records: visible,
      periodLabel: FILTER_LABELS[State.filter.type],
      balanceHidden: State.balanceHidden,
      currencyFormatter: (n)=>Utils.formatETB(n, false)
    });
    toast('PDF statement downloaded.');
  } catch(err){
    console.error(err);
    toast('Could not generate the PDF. Please try again.', 'err');
  } finally{
    icon.textContent = originalIcon;
    btn.disabled = false;
  }
});

$('#btn-clear-data').addEventListener('click', ()=>{ closeSheet('sheet-settings'); setTimeout(()=>openModal('modal-clear-confirm'),150); });
$('#btn-clear-cancel').addEventListener('click', ()=>closeModal('modal-clear-confirm'));
$('#btn-clear-confirm').addEventListener('click', ()=>{
  DB.clear().then(()=>{
    closeModal('modal-clear-confirm');
    afterMutation('All data cleared.');
  }).catch(onDbError);
});

/* ============================================================================
   LOCK FLOW CONTROLLER
   Drives the full-screen keypad for: unlocking, first-time PIN setup,
   changing the PIN, disabling the lock, and the email-free "forgot PIN"
   recovery path (security question stored & verified in Firestore).
   ============================================================================ */
const LockFlow = (function(){
  let mode = null;
  let buffer = '';
  let tempPin = '';
  let onSuccess = null;

  function el(){ return document.getElementById('lock-inner'); }
  function escAttr(s){ return String(s).replace(/"/g,'&quot;'); }

  function show(startMode, opts){
    opts = opts || {};
    onSuccess = opts.onSuccess || null;
    mode = startMode;
    buffer = '';
    document.getElementById('lock-flow').classList.add('show');
    render();
  }
  function hide(){
    document.getElementById('lock-flow').classList.remove('show');
    mode = null;
  }

  const TITLES = {
    'lock': ['Enter Your PIN','Enter your 4-digit PIN to unlock Bīr'],
    'setup-enter': ['Create a PIN','Choose a 4-digit PIN to protect your data'],
    'setup-confirm': ['Confirm PIN','Enter the same PIN again'],
    'change-verify': ['Enter Current PIN',"Verify it's you before changing your PIN"],
    'change-enter': ['New PIN','Choose a new 4-digit PIN'],
    'change-confirm': ['Confirm New PIN','Enter the new PIN again'],
    'disable-verify': ['Enter Current PIN','Confirm to turn off PIN lock'],
    'reset-enter': ['New PIN','Choose a new 4-digit PIN'],
    'reset-confirm': ['Confirm New PIN','Enter the new PIN again']
  };

  function render(){
    if(mode==='setup-question' || mode==='reset-question'){ renderQuestionForm(); return; }
    const [title, subtitle] = TITLES[mode] || ['Enter PIN',''];
    let html = '';
    if(mode!=='lock') html += `<div class="lock-back-row"><button class="lock-link muted" id="lock-back">‹ Back</button></div>`;
    html += `<div class="lock-mark">ብ</div>
      <div class="lock-title">${title}</div>
      <div class="lock-subtitle">${subtitle}</div>
      <div class="lock-dots" id="lock-dots">${[0,1,2,3].map(()=>'<div class="lock-dot"></div>').join('')}</div>
      <div class="keypad" id="lock-keypad">
        ${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="key-btn" data-key="${n}">${n}</button>`).join('')}
        <div></div>
        <button class="key-btn" data-key="0">0</button>
        <button class="key-btn ghost" data-key="back" aria-label="Backspace"><span class="material-icons">backspace</span></button>
      </div>`;
    if(mode==='lock') html += `<button class="lock-link" id="lock-forgot">Forgot PIN?</button>`;
    el().innerHTML = html;
    updateDots();
    el().querySelectorAll('.key-btn').forEach(btn=>btn.addEventListener('click', ()=>onKey(btn.dataset.key)));
    const backBtn = document.getElementById('lock-back');
    if(backBtn) backBtn.addEventListener('click', hide);
    const forgotBtn = document.getElementById('lock-forgot');
    if(forgotBtn) forgotBtn.addEventListener('click', ()=>{ mode='reset-question'; buffer=''; render(); });
  }

  function renderQuestionForm(){
    const sec = Security.get();
    const isReset = mode==='reset-question';
    let html = `<div class="lock-back-row"><button class="lock-link muted" id="lock-back">‹ Back</button></div>
      <div class="lock-mark">ብ</div>
      <div class="lock-title">${isReset ? 'Recover Your PIN' : 'Set a Recovery Question'}</div>
      <div class="lock-subtitle">${isReset ? 'Answer your security question to reset your PIN.' : 'Used only to reset your PIN if you forget it — no email required.'}</div>
      <div class="lock-form">`;
    if(isReset){
      html += `<div class="field">
          <label style="display:block;font-size:12px;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">Security Question</label>
          <div style="font-weight:600; font-size:14.5px; margin-bottom:12px;">${sec.question || '—'}</div>
          <div class="input-wrap"><input type="text" id="lock-answer" placeholder="Your answer" autocomplete="off"></div>
          <div class="field-error" id="lock-answer-error" style="display:none;">That answer doesn't match. Try again.</div>
        </div>
        <button class="btn btn-primary btn-block" id="lock-submit-answer">Continue</button>`;
    } else {
      html += `<div class="field">
          <label style="display:block;font-size:12px;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">Choose a Question</label>
          <select id="lock-question">${Security.QUESTIONS.map(q=>`<option value="${escAttr(q)}">${q}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label style="display:block;font-size:12px;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">Your Answer</label>
          <div class="input-wrap"><input type="text" id="lock-answer" placeholder="Answer" autocomplete="off"></div>
          <div class="field-error" id="lock-answer-error" style="display:none;">Please enter an answer.</div>
        </div>
        <button class="btn btn-primary btn-block" id="lock-submit-answer">Finish Setup</button>`;
    }
    html += `</div>`;
    el().innerHTML = html;
    document.getElementById('lock-back').addEventListener('click', hide);
    document.getElementById('lock-submit-answer').addEventListener('click', onSubmitAnswer);
    document.getElementById('lock-answer').addEventListener('keydown', (e)=>{ if(e.key==='Enter') onSubmitAnswer(); });
  }

  function updateDots(){
    document.querySelectorAll('#lock-dots .lock-dot').forEach((d,i)=> d.classList.toggle('filled', i < buffer.length));
  }

  function shakeAndReset(msg){
    const dotsEl = document.getElementById('lock-dots');
    if(dotsEl){
      dotsEl.classList.add('shake');
      dotsEl.querySelectorAll('.lock-dot').forEach(d=>d.classList.add('err'));
      setTimeout(()=>{
        dotsEl.classList.remove('shake');
        dotsEl.querySelectorAll('.lock-dot').forEach(d=>d.classList.remove('err','filled'));
      }, 420);
    }
    buffer = '';
    if(msg) toast(msg, 'err');
  }

  async function onKey(key){
    if(key==='back'){ buffer = buffer.slice(0,-1); updateDots(); return; }
    if(buffer.length>=4) return;
    buffer += key;
    updateDots();
    if(buffer.length===4) await onPinComplete();
  }

  async function onPinComplete(){
    const pin = buffer;
    if(mode==='lock'){
      if(await Security.verifyPin(pin)){ hide(); if(onSuccess) onSuccess(); }
      else shakeAndReset('Incorrect PIN. Try again.');
    } else if(mode==='setup-enter'){
      tempPin = pin; mode='setup-confirm'; buffer=''; render();
    } else if(mode==='setup-confirm'){
      if(pin===tempPin){ mode='setup-question'; buffer=''; render(); }
      else { tempPin=''; mode='setup-enter'; shakeAndReset("PINs didn't match — start again."); render(); }
    } else if(mode==='change-verify'){
      if(await Security.verifyPin(pin)){ mode='change-enter'; buffer=''; render(); }
      else shakeAndReset('Incorrect PIN. Try again.');
    } else if(mode==='change-enter'){
      tempPin = pin; mode='change-confirm'; buffer=''; render();
    } else if(mode==='change-confirm'){
      if(pin===tempPin){ await Security.changePin(pin); hide(); toast('PIN changed successfully.'); }
      else { mode='change-enter'; shakeAndReset("PINs didn't match — start again."); render(); }
    } else if(mode==='disable-verify'){
      if(await Security.verifyPin(pin)){ Security.disable(); hide(); refreshPinSettingsUI(); toast('PIN lock disabled.'); }
      else shakeAndReset('Incorrect PIN. Try again.');
    } else if(mode==='reset-enter'){
      tempPin = pin; mode='reset-confirm'; buffer=''; render();
    } else if(mode==='reset-confirm'){
      if(pin===tempPin){
        await Security.changePin(pin);
        hide();
        refreshPinSettingsUI();
        toast('PIN reset successfully.');
        if(onSuccess) onSuccess();
      } else { mode='reset-enter'; shakeAndReset("PINs didn't match — start again."); render(); }
    }
  }

  async function onSubmitAnswer(){
    const answer = document.getElementById('lock-answer').value.trim();
    const errEl = document.getElementById('lock-answer-error');
    if(mode==='reset-question'){
      if(!answer){ errEl.textContent = "Please enter an answer."; errEl.style.display='block'; return; }
      if(await Security.verifyAnswer(answer)){ mode='reset-enter'; buffer=''; render(); }
      else { errEl.textContent = "That answer doesn't match. Try again."; errEl.style.display='block'; }
    } else {
      const question = document.getElementById('lock-question').value;
      if(!answer){ errEl.style.display='block'; return; }
      await Security.setupPin(tempPin, question, answer);
      hide();
      refreshPinSettingsUI();
      toast('PIN lock enabled.');
    }
  }

  return { show, hide };
})();

function refreshPinSettingsUI(){
  const enabled = Security.isEnabled();
  $('#switch-pin-lock').classList.toggle('on', enabled);
  $('#row-change-pin').style.display = enabled ? '' : 'none';
  $('#pin-lock-sub').textContent = enabled ? 'PIN lock is enabled' : 'Require a PIN to open the app';
  $('#btn-lock-now').style.display = enabled ? '' : 'none';
}

$('#switch-pin-lock').addEventListener('click', ()=>{
  if(Security.isEnabled()) LockFlow.show('disable-verify');
  else LockFlow.show('setup-enter');
});
$('#btn-change-pin').addEventListener('click', ()=>LockFlow.show('change-verify'));
$('#btn-lock-now').addEventListener('click', ()=>{
  closeSheet('sheet-settings');
  LockFlow.show('lock', { onSuccess(){} });
});

/* ============================================================================
   INIT
   ============================================================================ */
function loadRecords(){
  return DB.list().then(list=>{ State.records = list; });
}

function restoreSettings(){
  return DB.getSettings().then(s=>{
    applyTheme(s.theme === 'light' ? 'light' : 'dark');
    State.balanceHidden = !!s.balanceHidden;
    $('#eye-icon').textContent = State.balanceHidden ? 'visibility_off' : 'visibility';
    const animOn = s.animations !== false;
    $('#switch-anim').classList.toggle('on', animOn);
    Anim.setEnabled(animOn);
  });
}

function showStartupError(message){
  const frame = $('#app-frame');
  frame.innerHTML = `<div style="padding:60px 28px; text-align:center;">
    <div class="lock-mark" style="margin:0 auto 18px;">ብ</div>
    <h3 style="font-family:var(--font-display); font-weight:600; font-size:19px; margin:0 0 10px;">Can't connect to the cloud</h3>
    <p style="color:var(--text-dim); font-size:13.5px; line-height:1.6; max-width:340px; margin:0 auto;">${message}</p>
  </div>`;
}

function init(){
  if(!FirebaseApp.configIsValid){
    showStartupError('Bīr needs a Firebase project to store your data. Open <b>js/firebase-config.js</b> and paste in your project\'s web config, then reload. See README.md for the full setup steps.');
    return;
  }
  DB.init().then(()=>{
    return Promise.all([ restoreSettings(), Security.init(), loadRecords() ]);
  }).then(()=>{
    refreshPinSettingsUI();
    buildSourceGrid();
    renderAll();
    DB.onChange(()=>{ loadRecords().then(renderAll); });
    if(Security.isEnabled()){
      LockFlow.show('lock', { onSuccess(){} });
    }
  }).catch(err=>{
    console.error(err);
    showStartupError('We couldn\'t sign in or reach Firestore. Check your internet connection and that your Firebase project and Security Rules are set up correctly (see README.md), then reload.');
  });
}

init();

})();
