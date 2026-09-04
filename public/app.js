const REMOTE = {
  crimes: 'https://raw.githubusercontent.com/NakamuraYUKI-TCPDBOT/TCPD_crime_app_V2/refs/heads/main/crimes.json',
  groups: 'https://raw.githubusercontent.com/NakamuraYUKI-TCPDBOT/TCPD_crime_app_V2/refs/heads/main/groups.json',
  buttons: 'https://raw.githubusercontent.com/NakamuraYUKI-TCPDBOT/TCPD_crime_app_V2/refs/heads/main/buttons.json'
};
const LOCAL = { crimes: 'data/crimes.json', groups: 'data/groups.json', buttons: 'data/buttons.json' };
const HIDDEN_KEY = 'tcpd-fine-hidden-v2';

const state = {
  crimes: [], groups: {}, buttons: [], selected: new Set(), hidden: new Set(), values: {}, source: 'local'
};

const $ = (id) => document.getElementById(id);
const els = {
  crimeList: $('crimeList'), emptyState: $('emptyState'), presetGroups: $('presetGroups'),
  totalFine: $('totalFine'), totalPrison: $('totalPrison'), copyNotice: $('copyNotice'),
  searchInput: $('searchInput'), dataStatus: $('dataStatus'), dataStatusDot: $('dataStatusDot')
};

function safeNumber(value) {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function formatMan(value) {
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toLocaleString('ja-JP') : rounded.toLocaleString('ja-JP', {maximumFractionDigits: 1})}万`;
}

function setStatus(text, type='ok') {
  els.dataStatus.textContent = text;
  els.dataStatusDot.className = `status-dot ${type}`;
}

async function fetchJson(url, timeoutMs=6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function loadData(forceRemote=false) {
  // まず同梱データを即表示し、その後GitHubの最新版へ差し替える。
  try {
    const [crimes, groups, buttons] = await Promise.all([
      fetchJson(LOCAL.crimes, 2500), fetchJson(LOCAL.groups, 2500), fetchJson(LOCAL.buttons, 2500)
    ]);
    state.crimes = crimes; state.groups = groups; state.buttons = buttons; state.source = 'local';
    normalizeState(); renderAll();
    setStatus('同梱データを表示中・GitHubの最新版を確認中...', 'warn');
  } catch (localErr) {
    console.warn('Local fallback load failed:', localErr);
    setStatus('GitHubからデータを取得中...', 'warn');
  }

  try {
    const [crimes, groups, buttons] = await Promise.all([
      fetchJson(REMOTE.crimes), fetchJson(REMOTE.groups), fetchJson(REMOTE.buttons)
    ]);
    state.crimes = crimes; state.groups = groups; state.buttons = buttons; state.source = 'remote';
    normalizeState(); renderAll();
    setStatus('GitHubの最新データを使用中', 'ok');
  } catch (remoteErr) {
    if (state.crimes.length) {
      setStatus('GitHub取得失敗：同梱データを使用中', 'warn');
    } else {
      setStatus('データを読み込めませんでした', 'error');
      console.error(remoteErr);
    }
  }
}

function normalizeState() {
  const names = new Set(state.crimes.map(c => c.name));
  state.selected = new Set([...state.selected].filter(n => names.has(n)));
  state.hidden = new Set([...state.hidden].filter(n => names.has(n)));
  saveHidden();
}

function loadHidden() {
  try { state.hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); }
  catch { state.hidden = new Set(); }
}
function saveHidden() { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...state.hidden])); }

function crimeValue(name) {
  if (!state.values[name]) state.values[name] = { count:'', fine:'', prison:'' };
  return state.values[name];
}

function renderAll() {
  renderPresets();
  renderCrimes();
  calculate();
}

function renderPresets() {
  const preferred = ['対応','小型','中型','大型','特殊','操作'];
  const found = [...new Set(state.buttons.map(b => b.group || '').filter(Boolean))];
  const groupOrder = [...preferred.filter(g => found.includes(g)), ...found.filter(g => !preferred.includes(g))];
  const cssClass = { '対応':'response', '小型':'small', '中型':'medium', '大型':'large', '特殊':'special', '操作':'action' };
  els.presetGroups.innerHTML = '';
  for (const groupName of groupOrder) {
    const items = state.buttons.filter(b => (b.group || '') === groupName);
    if (!items.length) continue;
    const wrap = document.createElement('div'); wrap.className = 'preset-group';
    const title = document.createElement('div'); title.className='preset-group-title'; title.textContent=groupName;
    const buttons = document.createElement('div'); buttons.className='preset-buttons';
    for (const info of items) {
      const btn = document.createElement('button');
      btn.type='button'; btn.className=`preset-btn ${cssClass[groupName] || ''}`; btn.textContent=info.label;
      btn.addEventListener('click', () => applyPreset(info));
      buttons.appendChild(btn);
    }
    wrap.append(title, buttons); els.presetGroups.appendChild(wrap);
  }
}

function applyPreset(info) {
  if (info.is_clear) return clearAll();
  if (info.clear_first) clearAll(false);
  for (const groupName of info.group_names || []) checkGroup(groupName);
  renderCrimes(); calculate();
}

function checkGroup(groupName) {
  // groups.jsonを主に使いつつ、crimes.json側のgroupも併用してデータ表記揺れを吸収する。
  const names = new Set(state.groups[groupName] || []);
  for (const crime of state.crimes) {
    if (Array.isArray(crime.group) && crime.group.includes(groupName)) names.add(crime.name);
  }
  for (const name of names) {
    if (state.crimes.some(c => c.name === name)) state.selected.add(name);
  }
}

function renderCrimes() {
  const query = els.searchInput.value.trim().toLowerCase();
  els.crimeList.innerHTML='';
  let shown=0;
  state.crimes.forEach((crime) => {
    if (crime.visible === false || state.hidden.has(crime.name)) return;
    if (query && !crime.name.toLowerCase().includes(query)) return;
    shown++;
    const v = crimeValue(crime.name);
    const row = document.createElement('div');
    row.className = `crime-row${state.selected.has(crime.name) ? ' checked' : ''}`;

    const main = document.createElement('label'); main.className='crime-main';
    const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=state.selected.has(crime.name);
    cb.addEventListener('change', () => {
      cb.checked ? state.selected.add(crime.name) : state.selected.delete(crime.name);
      row.classList.toggle('checked', cb.checked); calculate();
    });
    const name = document.createElement('span'); name.className='crime-name'; name.textContent=crime.name;
    main.append(cb,name);

    const fine = document.createElement('div'); fine.className='fine-cell cell-center unit-value'; fine.textContent=`${safeNumber(crime.fine).toLocaleString('ja-JP')}万`;
    const prison = document.createElement('div'); prison.className='prison-cell cell-center unit-value'; prison.textContent=`${safeNumber(crime.prison)}分`;

    const meta = document.createElement('div'); meta.className='mobile-meta';
    meta.innerHTML=`<span>罰金: <b>${safeNumber(crime.fine).toLocaleString('ja-JP')}万</b></span><span>プリズン: <b>${safeNumber(crime.prison)}分</b></span>`;

    const inputWrap = document.createElement('div'); inputWrap.className='input-cell-wrap';
    const flexibleCell = document.createElement('div'); flexibleCell.className='input-cell cell-center';
    const prisonInputCell = document.createElement('div'); prisonInputCell.className='input-cell cell-center';

    if (crime.input_count) flexibleCell.append(makeInputLabel(crime.input_count_label || '個数'), makeRowInput('count', crime, v.count, crime.input_count_label || '個数'));
    else if (crime.input_fine) flexibleCell.append(makeInputLabel(crime.input_fine_label || '金額'), makeRowInput('fine', crime, v.fine, crime.input_fine_label || '金額'));
    else flexibleCell.innerHTML='';

    if (crime.input_prison) prisonInputCell.append(makeInputLabel(crime.input_prison_label || '時間'), makeRowInput('prison', crime, v.prison, crime.input_prison_label || '時間'));
    else prisonInputCell.innerHTML='';
    inputWrap.append(flexibleCell, prisonInputCell);

    const hideCell = document.createElement('div'); hideCell.className='hide-cell cell-center';
    const hideBtn = document.createElement('button'); hideBtn.type='button'; hideBtn.className='hide-row-btn'; hideBtn.textContent='×'; hideBtn.title='この罪状を非表示';
    hideBtn.addEventListener('click',()=>{ state.hidden.add(crime.name); state.selected.delete(crime.name); saveHidden(); renderCrimes(); calculate(); });
    hideCell.appendChild(hideBtn);

    row.append(main, fine, prison, inputWrap, hideCell, meta);
    els.crimeList.appendChild(row);
  });
  els.emptyState.hidden = shown !== 0;
}

function makeInputLabel(text) {
  const label=document.createElement('span'); label.className='input-label-mobile'; label.textContent=`${text}:`;
  return label;
}

function makeRowInput(kind, crime, current, placeholder) {
  const input=document.createElement('input'); input.className='row-input'; input.type='number'; input.inputMode='decimal'; input.min='0'; input.step='1';
  input.placeholder=placeholder; input.value=current;
  input.addEventListener('input',()=>{
    crimeValue(crime.name)[kind]=input.value;
    if (input.value.trim() !== '') state.selected.add(crime.name);
    renderCheckedOnly(); calculate();
  });
  return input;
}

function renderCheckedOnly() {
  [...els.crimeList.querySelectorAll('.crime-row')].forEach(row=>{
    const name=row.querySelector('.crime-name')?.textContent; const cb=row.querySelector('input[type=checkbox]');
    if (!name || !cb) return; cb.checked=state.selected.has(name); row.classList.toggle('checked',cb.checked);
  });
}

function calculate() {
  let totalFine=0, normalPrison=0, overPrison=0;
  for (const crime of state.crimes) {
    if (!state.selected.has(crime.name)) continue;
    const v=crimeValue(crime.name);
    let fine=safeNumber(crime.fine), prison=safeNumber(crime.prison);
    if (crime.input_count) {
      const count = safeNumber(v.count);
      fine += count * safeNumber(crime.fine_per_unit);
      prison += count * safeNumber(crime.prison_per_unit);
    }
    if (crime.input_fine && String(v.fine).trim() !== '') fine = safeNumber(v.fine);
    if (crime.input_prison && String(v.prison).trim() !== '') prison = safeNumber(v.prison);
    totalFine += fine;
    if (crime.allow_prison_over) overPrison += prison; else normalPrison += prison;
  }
  // 元EXEの計算処理に合わせ、通常プリズンは60分上限。allow_prison_over分は上限外で加算。
  const totalPrison = Math.min(normalPrison, 60) + overPrison;
  els.totalFine.textContent=formatMan(totalFine);
  els.totalPrison.textContent=`${totalPrison.toLocaleString('ja-JP')}分`;
  return { totalFine, totalPrison };
}

function selectedNames() { return state.crimes.filter(c=>state.selected.has(c.name)).map(c=>c.name); }
async function copyText(text, success) {
  try { await navigator.clipboard.writeText(text); showNotice(success); }
  catch {
    const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); showNotice(success);
  }
}
function showNotice(text) { els.copyNotice.textContent=text; clearTimeout(showNotice.t); showNotice.t=setTimeout(()=>els.copyNotice.textContent='',2200); }

function clearAll(render=true) {
  state.selected.clear(); state.values={};
  if (render) { renderCrimes(); calculate(); showNotice('選択をクリアしました'); }
}

$('copyIncidentBtn').addEventListener('click',()=>copyText(selectedNames().join('、'),'インシデントをコピーしました'));
$('copyFineBtn').addEventListener('click',()=>{
  const {totalFine}=calculate(); const yen=Math.round(totalFine*10000); copyText(String(yen),`罰金 ${yen.toLocaleString('ja-JP')}円 をコピーしました`);
});
$('copyFine150Btn').addEventListener('click',()=>{
  const {totalFine}=calculate();
  const yen=totalFine*1.5*10000;
  const display=`合計罰金額(x1.5): ${yen.toLocaleString('ja-JP',{minimumFractionDigits:1,maximumFractionDigits:1})}`;
  copyText(display,`${display} をコピーしました`);
});
$('clearBtnTop').addEventListener('click',()=>clearAll());
$('clearBtnBottom').addEventListener('click',()=>clearAll());
$('showHiddenBtn').addEventListener('click',()=>{ state.hidden.clear(); saveHidden(); renderCrimes(); showNotice('非表示の罪状を戻しました'); });
$('reloadDataBtn').addEventListener('click',()=>loadData(true));
els.searchInput.addEventListener('input',renderCrimes);

loadHidden();
loadData();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(console.warn));
}
