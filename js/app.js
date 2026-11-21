// STM32 실습실 UI: 보드/부품 렌더링, 배선, 실행, 레슨 진행
{
const $ = s => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const LESSONS = window.LESSONS;
const { createRuntime, Stop } = window.STM;

/* ---------- 저장소 ---------- */
const KEY = 'stm32lab:v1';
let store = { done: {}, code: {}, wires: {} };
try { store = Object.assign(store, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };

/* ---------- 보드 핀 ---------- */
const LX = 58, RX = 362;
const BOARD_PINS = [
  ['3V3', '3V3', LX, 180, 'pwr'], ['5V', '5V', LX, 206, 'pwr'], ['GND1', 'GND', LX, 232, 'gnd'], ['GND2', 'GND', LX, 258, 'gnd'], ['VIN', 'VIN', LX, 284, 'nc'],
  ['PA0', 'A0', LX, 336], ['PA1', 'A1', LX, 362], ['PA4', 'A2', LX, 388], ['PB0', 'A3', LX, 414], ['PC1', 'A4', LX, 440], ['PC0', 'A5', LX, 466],
  ['PB8', 'D15', RX, 180], ['PB9', 'D14', RX, 206], ['GND3', 'GND', RX, 232, 'gnd'], ['PA5', 'D13', RX, 258], ['PA6', 'D12', RX, 284], ['PA7', 'D11', RX, 310],
  ['PB6', 'D10', RX, 336], ['PC7', 'D9', RX, 362], ['PA9', 'D8', RX, 388],
  ['PA8', 'D7', RX, 440], ['PB10', 'D6', RX, 466], ['PB4', 'D5', RX, 492], ['PB5', 'D4', RX, 518], ['PB3', 'D3', RX, 544], ['PA10', 'D2', RX, 570], ['PA2', 'D1', RX, 596], ['PA3', 'D0', RX, 622]
].map(([id, lab, x, y, kind]) => ({ id, lab, x, y, kind: kind || 'io' }));
const AF = {
  PA0: 'ADC1_IN0 · TIM2_CH1', PA1: 'ADC1_IN1 · TIM2_CH2', PA4: 'ADC1_IN4', PB0: 'ADC1_IN8 · TIM3_CH3', PC1: 'ADC1_IN11', PC0: 'ADC1_IN10',
  PB8: 'I2C1_SCL', PB9: 'I2C1_SDA', PA5: 'LD2 · SPI1_SCK', PA6: 'TIM3_CH1 · SPI1_MISO', PA7: 'SPI1_MOSI · TIM3_CH2', PB6: 'TIM4_CH1 · I2C1_SCL',
  PC7: 'TIM3_CH2', PA9: 'USART1_TX · TIM1_CH2', PA8: 'TIM1_CH1', PB10: 'TIM2_CH3 · I2C2_SCL', PB4: 'TIM3_CH1', PB5: 'TIM3_CH2',
  PB3: 'TIM2_CH2', PA10: 'USART1_RX', PA2: 'USART2_TX (가상 COM)', PA3: 'USART2_RX (가상 COM)',
  '3V3': '3.3V 전원 출력', '5V': '5V 전원 출력 (USB)', GND1: '접지', GND2: '접지', GND3: '접지', VIN: '외부 전원 입력 7~12V'
};
const BP = Object.fromEntries(BOARD_PINS.map(p => [p.id, p]));

/* ---------- 부품 ---------- */
const LED_COL = { red: '#ff3b30', green: '#22d160', yellow: '#ffc400' };
const CT = {
  led: { terms: [['+', 25, 104], ['-', 55, 104]] },
  button: { terms: [['S', 25, 87], ['+', 55, 87], ['-', 85, 87]] },
  pot: { terms: [['+', 25, 87], ['S', 55, 87], ['-', 85, 87]] },
  servo: { terms: [['S', 70, 108], ['+', 95, 108], ['-', 120, 108]] }
};
function drawComp(c) {
  const lab = `<text class="clabel" x="${c.type === 'servo' ? 75 : c.type === 'led' ? 40 : 55}" y="-12" text-anchor="middle">${c.name}</text>`;
  if (c.type === 'led') {
    const col = LED_COL[c.color];
    return lab + `<circle id="glow-${c.id}" cx="40" cy="40" r="52" fill="url(#glow)" style="color:${col}" opacity="0"/>
      <line x1="25" y1="64" x2="25" y2="100" stroke="#9aa3ab" stroke-width="3"/><line x1="55" y1="64" x2="55" y2="88" stroke="#9aa3ab" stroke-width="3"/><line x1="55" y1="88" x2="55" y2="100" stroke="#9aa3ab" stroke-width="3"/>
      <rect x="14" y="58" width="52" height="7" rx="2" fill="${col}" opacity=".55"/>
      <path id="dome-${c.id}" d="M18 60V38a22 22 0 0 1 44 0v22z" fill="${col}" fill-opacity=".3" stroke="${col}" stroke-width="2"/>
      <path d="M27 40a13 13 0 0 1 10-14" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (c.type === 'button') {
    return lab + `<rect width="110" height="96" rx="8" fill="#16324f"/><rect x="33" y="10" width="44" height="44" rx="4" fill="#2b2f33"/>
      <circle cx="37" cy="14" r="2" fill="#777"/><circle cx="73" cy="14" r="2" fill="#777"/><circle cx="37" cy="50" r="2" fill="#777"/><circle cx="73" cy="50" r="2" fill="#777"/>
      <circle id="cap-${c.id}" class="cap" data-comp="${c.id}" cx="55" cy="32" r="14" fill="#e9edf0" stroke="#9aa4ad" stroke-width="2"/>
      <rect x="12" y="78" width="86" height="18" rx="2" fill="#0b0d0f"/>`;
  }
  if (c.type === 'pot') {
    return lab + `<rect width="110" height="96" rx="8" fill="#16324f"/>
      <g class="knob" data-comp="${c.id}"><circle cx="55" cy="38" r="28" fill="#1d2226"/><circle cx="55" cy="38" r="23" fill="#39424b"/>
      <g id="knob-${c.id}"><line x1="55" y1="38" x2="55" y2="19" stroke="#fff" stroke-width="4" stroke-linecap="round"/></g></g>
      <rect x="12" y="78" width="86" height="18" rx="2" fill="#0b0d0f"/>
      <text id="val-${c.id}" class="val" x="55" y="134" text-anchor="middle"></text>`;
  }
  if (c.type === 'servo') {
    return lab + `<rect x="0" y="36" width="150" height="16" rx="4" fill="#2a63c4"/><rect x="12" y="18" width="126" height="58" rx="6" fill="#2f6fd6"/>
      <text x="108" y="52" fill="#fff" font-size="13" font-weight="700" text-anchor="middle" font-family="sans-serif">SG90</text>
      <path d="M85 76 C85 92 70 92 70 100M95 76V100M105 76C105 92 120 92 120 100" fill="none" stroke-width="4"/>
      <path d="M85 76 C85 92 70 92 70 100" fill="none" stroke="#f28c28" stroke-width="4"/><path d="M95 76V100" stroke="#d63a2f" stroke-width="4"/><path d="M105 76C105 92 120 92 120 100" fill="none" stroke="#6b4428" stroke-width="4"/>
      <rect x="58" y="99" width="74" height="18" rx="2" fill="#0b0d0f"/>
      <circle cx="45" cy="47" r="15" fill="#e6e9ec"/>
      <g id="arm-${c.id}"><rect x="38" y="-2" width="14" height="56" rx="7" fill="#f7f8f9" stroke="#b8c0c7" stroke-width="1.5"/><circle cx="45" cy="6" r="2.5" fill="#b8c0c7"/><circle cx="45" cy="18" r="2.5" fill="#b8c0c7"/></g>
      <circle cx="45" cy="47" r="4.5" fill="#8e979f"/>
      <text id="val-${c.id}" class="val" x="95" y="154" text-anchor="middle"></text>`;
  }
  return '';
}

function drawBoard() {
  let s = `<rect x="36" y="28" width="360" height="630" rx="10" fill="#000" opacity=".08"/>
  <rect x="30" y="20" width="360" height="630" rx="10" fill="#fbfbf8" stroke="#c3cad0" stroke-width="1.5"/>
  <rect x="31" y="21" width="358" height="118" rx="9" fill="#f0f1ed"/>
  <rect x="180" y="6" width="60" height="34" rx="3" fill="#b9c0c6" stroke="#8a9299"/><rect x="190" y="12" width="40" height="10" rx="2" fill="#6f777e"/>
  <rect x="268" y="56" width="40" height="40" rx="2" fill="#1b1d1f"/>
  <text x="70" y="74" font-size="13" font-weight="700" fill="#6b7781" font-family="sans-serif">ST-LINK/V2-1</text>
  <text x="70" y="92" font-size="11" fill="#8b959e" font-family="sans-serif">디버거 · 가상 COM</text>
  <circle cx="140" cy="116" r="4" fill="#e0453a"/><text x="150" y="120" font-size="10" fill="#8b959e" font-family="sans-serif">LD1 COM</text>
  <circle cx="330" cy="120" r="9" fill="url(#glow)" style="color:#ff3b30"/><circle cx="330" cy="120" r="4" fill="#ff3b30"/><text x="318" y="124" font-size="10" fill="#8b959e" text-anchor="end" font-family="sans-serif">LD3 PWR</text>
  <line x1="30" y1="140" x2="390" y2="140" stroke="#b9c0c6" stroke-dasharray="3 5" stroke-width="2"/>
  <text x="210" y="236" text-anchor="middle" font-size="15" font-weight="800" fill="#03234b" font-family="sans-serif">NUCLEO-F401RE</text>
  <rect x="190" y="470" width="40" height="16" rx="7" fill="#c8ced3" stroke="#9aa3ab"/><text x="210" y="502" text-anchor="middle" font-size="10" fill="#8b959e" font-family="sans-serif">X3 8MHz</text>
  <g>${Array.from({ length: 12 }, (_, i) => `<rect x="${166 + i * 8}" y="316" width="3" height="8" fill="#9aa3ab"/><rect x="${166 + i * 8}" y="432" width="3" height="8" fill="#9aa3ab"/><rect x="152" y="${330 + i * 8}" width="8" height="3" fill="#9aa3ab"/><rect x="260" y="${330 + i * 8}" width="8" height="3" fill="#9aa3ab"/>`).join('')}</g>
  <rect x="160" y="324" width="100" height="108" rx="3" fill="#1b1d1f"/><circle cx="172" cy="336" r="3" fill="#3a3d40"/>
  <text x="210" y="374" text-anchor="middle" font-size="14" font-weight="800" fill="#fff" font-family="sans-serif">STM32</text>
  <text x="210" y="392" text-anchor="middle" font-size="10" fill="#bfc5ca" font-family="monospace">F401RET6</text>
  <circle id="ld2glow" cx="243" cy="262" r="26" fill="url(#glow)" style="color:#22d160" opacity="0"/>
  <rect id="ld2" x="236" y="257" width="14" height="10" rx="2" fill="#cfe8d4" stroke="#8fb59a"/>
  <text x="243" y="284" text-anchor="middle" font-size="10" font-weight="700" fill="#6b7781" font-family="sans-serif">LD2</text>
  <rect x="94" y="560" width="34" height="34" rx="3" fill="#d6dbdf" stroke="#aab2b9"/><circle id="b1cap" class="cap" data-comp="B1" cx="111" cy="577" r="11" fill="#2f6ad0" stroke="#1d4a99" stroke-width="2"/>
  <text x="111" y="612" text-anchor="middle" font-size="10" font-weight="700" fill="#6b7781" font-family="sans-serif">B1 USER</text>
  <rect x="174" y="560" width="34" height="34" rx="3" fill="#d6dbdf" stroke="#aab2b9"/><circle id="b2cap" class="cap" data-comp="B2" cx="191" cy="577" r="11" fill="#1b1d1f" stroke="#000" stroke-width="2"/>
  <text x="191" y="612" text-anchor="middle" font-size="10" font-weight="700" fill="#6b7781" font-family="sans-serif">B2 RESET</text>`;
  for (const [x, y1, y2, n] of [[LX, 166, 296, 'CN6'], [LX, 322, 478, 'CN8'], [RX, 166, 400, 'CN5'], [RX, 426, 634, 'CN9']]) {
    s += `<rect x="${x - 12}" y="${y1}" width="24" height="${y2 - y1}" rx="2" fill="#151719"/>`;
  }
  for (const p of BOARD_PINS) {
    const port = p.kind === 'io' ? p.id : '';
    s += p.x === LX
      ? `<text class="plabel" x="${p.x + 18}" y="${p.y + 4}">${p.lab}${port ? ` <tspan class="m">${port}</tspan>` : ''}</text>`
      : `<text class="plabel" x="${p.x - 18}" y="${p.y + 4}" text-anchor="end">${port ? `<tspan class="m">${port}</tspan> ` : ''}${p.lab}</text>`;
  }
  $('#gBoard').innerHTML = s;
}

/* ---------- 상태 ---------- */
let cur = LESSONS[0], wires = [], pending = null, nets = new Map(), members = new Map();
let rt = null, running = false, stats = null, hintTimer = 0;
const cs = {}; // 부품 상태: pressed, pos, angle, lit, level
let b1 = false;
const TERMS = new Map();
const dirOf = id => id.startsWith('B:') ? (BP[id.slice(2)].x === LX ? [-1, 0] : [1, 0]) : [0, 1];

function termName(id) {
  if (id.startsWith('B:')) { const p = BP[id.slice(2)]; return p.kind === 'io' ? `${p.lab} (${p.id})` : p.lab; }
  const [cid, t] = id.split(':'); const c = cur.comps.find(c => c.id === cid);
  return `${c ? c.name : cid} ${t === '-' ? '−' : t}`;
}

/* ---------- 넷(전기적 연결) ---------- */
function rebuildNets() {
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => parent.set(find(a), find(b));
  for (const id of TERMS.keys()) parent.set(id, id);
  union('B:GND1', 'B:GND2'); union('B:GND2', 'B:GND3');
  for (const [a, b] of wires) if (parent.has(a) && parent.has(b)) union(a, b);
  nets = new Map(); members = new Map();
  for (const id of parent.keys()) { const r = find(id); nets.set(id, r); if (!members.has(r)) members.set(r, []); members.get(r).push(id); }
}
const mem = id => members.get(nets.get(id)) || [id];
const has = (id, pred) => mem(id).some(pred);
const isGnd = id => has(id, m => /^B:GND/.test(m));
const isPwr = id => has(id, m => m === 'B:3V3' || m === 'B:5V');
const voltOf = id => { const m = mem(id); if (m.includes('B:5V')) return 5; if (m.includes('B:3V3')) return 3.3; if (m.some(x => /^B:GND/.test(x))) return 0; return null; };
const powered = cid => isPwr(cid + ':+') && isGnd(cid + ':-');

function netDrive(id) {
  for (const m of mem(id)) {
    if (m === 'B:3V3' || m === 'B:5V') return { level: 1, pulse: null };
    if (rt && m.startsWith('B:') && BP[m.slice(2)].kind === 'io') { const d = rt.drive(m.slice(2)); if (d) return d; }
  }
  return null;
}
const sysWarned = new Set();
function sysWarn(k, msg) { if (!sysWarned.has(k)) { sysWarned.add(k); serial('[경고] ' + msg + '\n', 'warn'); } }

const hw = {
  readPin(p, pull) {
    if (p === 'PC13') return b1 ? 0 : 1;
    const id = 'B:' + p;
    if (!TERMS.has(id)) return pull === 1 ? 1 : 0;
    for (const m of mem(id)) {
      if (m === 'B:3V3' || m === 'B:5V') { if (m === 'B:5V') sysWarn('5v' + p, `${p}에 5V가 직접 연결됐어요. 실제 보드에서는 3.3V 핀에 무리가 갈 수 있습니다.`); return 1; }
      if (/^B:GND/.test(m)) return 0;
      const [cid, t] = m.split(':');
      if (t === 'S' && cs[cid] && cur.comps.find(c => c.id === cid)?.type === 'button' && powered(cid)) return cs[cid].pressed ? 1 : 0;
      if (m !== id && m.startsWith('B:') && rt) { const d = rt.drive(m.slice(2)); if (d) return d.level > .5 ? 1 : 0; }
    }
    if (pull === 0) sysWarn('float' + p, `${p} 입력이 어디에도 연결되지 않아 값이 불안정(floating)해요.`);
    return pull === 1 ? 1 : 0;
  },
  analog(p) {
    const id = 'B:' + p;
    if (!TERMS.has(id)) return 0;
    for (const m of mem(id)) {
      if (m === 'B:3V3') return 4095;
      if (m === 'B:5V') { sysWarn('adc5', 'ADC 핀에 5V가 들어갔어요. 3.3V를 넘으면 실제 칩이 손상될 수 있습니다.'); return 4095; }
      if (/^B:GND/.test(m)) return 0;
      const [cid, t] = m.split(':');
      const c = cur.comps.find(c => c.id === cid);
      if (c && c.type === 'pot' && t === 'S') {
        const top = voltOf(cid + ':+'), bot = voltOf(cid + ':-');
        if (top === null || bot === null) break;
        if (Math.max(top, bot) > 3.3) sysWarn('adc5', '가변저항에 5V를 걸었어요. ADC 입력은 3.3V를 넘으면 안 됩니다. +를 3V3에 연결하세요.');
        const v = bot + (top - bot) * cs[cid].pos;
        return Math.max(0, Math.min(4095, v / 3.3 * 4095 + (Math.random() * 6 - 3)));
      }
    }
    return 1700 + Math.random() * 800; // 떠 있는 입력
  },
  onSerial: s => serial(s),
  onWarn: m => serial('[경고] ' + m + '\n', 'warn'),
  onAdc: v => stats && stats.adcValues.add(Math.round(v / 128))
};

/* ---------- 렌더링 ---------- */
function addTerm(id, x, y, label, isBoard) {
  TERMS.set(id, { x, y });
  return `<g class="term" data-id="${id}"><circle class="hit" cx="${x}" cy="${y}" r="12"/>
    <circle class="pad" cx="${x}" cy="${y}" r="${isBoard ? 6.5 : 7}" fill="${isBoard ? '#d6ad52' : '#c9d1d8'}" stroke="${isBoard ? '#6e5316' : '#4b5560'}" stroke-width="1.5"/>
    ${label ? `<text class="tlabel" x="${x}" y="${y + 26}" text-anchor="middle">${label}</text>` : ''}</g>`;
}
function renderLesson() {
  TERMS.clear();
  let terms = '';
  for (const p of BOARD_PINS) terms += addTerm('B:' + p.id, p.x, p.y, '', true);
  let comps = '';
  for (const c of cur.comps) {
    cs[c.id] = cs[c.id] && cs[c.id].type === c.type ? cs[c.id] : { type: c.type, pressed: false, pos: .5, angle: 90, lit: false };
    comps += `<g transform="translate(${c.x},${c.y})">${drawComp(c)}</g>`;
    for (const [t, dx, dy] of CT[c.type].terms) terms += addTerm(`${c.id}:${t}`, c.x + dx, c.y + dy, t === '-' ? '−' : t);
  }
  $('#gComps').innerHTML = comps;
  $('#gTerms').innerHTML = terms;
  wires = (store.wires[cur.id] || []).filter(([a, b]) => TERMS.has(a) && TERMS.has(b));
  renderWires();
}
const WCOL = ['#f0a202', '#1d7fd6', '#16a34a', '#e4572e', '#0f9fb5', '#c2417a'];
function wirePath(a, b) {
  const A = TERMS.get(a), B = TERMS.get(b), da = dirOf(a), db = dirOf(b);
  const k = Math.min(140, Math.max(50, Math.hypot(A.x - B.x, A.y - B.y) * .35));
  return `M${A.x} ${A.y}C${A.x + da[0] * k} ${A.y + da[1] * k} ${B.x + db[0] * k} ${B.y + db[1] * k} ${B.x} ${B.y}`;
}
function renderWires() {
  rebuildNets();
  let ci = 0;
  $('#gWires').innerHTML = wires.map(([a, b], i) => {
    const ends = a + b;
    const col = /GND/.test(ends) ? 'var(--wire-gnd)' : /3V3|5V/.test(ends) ? '#d6332a' : WCOL[ci++ % WCOL.length];
    const d = wirePath(a, b);
    return `<path class="wirehit" data-i="${i}" d="${d}"/><path class="wire" d="${d}" stroke="${col}"/>`;
  }).join('');
  store.wires[cur.id] = wires; save();
  updateWireStatus();
}
function wireCheck() {
  const missing = cur.wiring.filter(([a, b]) => nets.get(a) !== nets.get(b));
  let short = false;
  for (const ms of members.values()) {
    const g = ms.some(m => /^B:GND/.test(m)), p = ms.some(m => m === 'B:3V3' || m === 'B:5V');
    if (g && p) short = true;
  }
  return { missing, short, total: cur.wiring.length };
}
function updateWireStatus() {
  const { missing, short, total } = wireCheck();
  const chip = $('#wireChip');
  chip.className = 'wirechip' + (short ? ' bad' : total && !missing.length ? ' ok' : '');
  chip.textContent = short ? '전원 단락!' : total ? `배선 ${total - missing.length} / ${total}` : '배선 필요 없음';
  $('#hintBtn').hidden = !total; $('#clearBtn').hidden = !total;
  if (short) sysWarn('short' + wires.length, '전원(3V3/5V)과 GND가 바로 연결됐어요. 실제로는 단락이라 위험합니다.');
  renderPinTab();
}

/* ---------- 배선 상호작용 ---------- */
const svg = $('#svg');
function svgPt(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function setPending(id) {
  document.querySelectorAll('.term.sel').forEach(t => t.classList.remove('sel'));
  pending = id;
  if (id) svg.querySelector(`.term[data-id="${CSS.escape(id)}"]`).classList.add('sel');
  else $('#rubber').setAttribute('d', '');
}
svg.addEventListener('click', e => {
  const t = e.target.closest('.term');
  if (t) {
    const id = t.dataset.id;
    if (!pending) return setPending(id);
    if (pending === id) return setPending(null);
    if (!wires.some(([a, b]) => (a === pending && b === id) || (a === id && b === pending))) {
      wires.push([pending, id]); renderWires();
    }
    return setPending(null);
  }
  const w = e.target.closest('.wirehit');
  if (w) { wires.splice(+w.dataset.i, 1); renderWires(); return; }
  if (!e.target.closest('.cap,.knob')) setPending(null);
});
svg.addEventListener('pointermove', e => {
  const t = e.target.closest('.term');
  if (t) {
    const id = t.dataset.id; let txt = `<b>${termName(id)}</b>`;
    if (id.startsWith('B:')) { txt += ` · ${AF[id.slice(2)] || ''}`; const s = rt && rt.st.pins[id.slice(2)]; if (s) txt += ` · 모드 ${({ out: '출력', in: '입력', an: '아날로그', af: '대체 기능', reset: '리셋' })[s.mode] || s.mode}${s.mode === 'out' ? (s.out ? ' HIGH' : ' LOW') : ''}`; }
    $('#info').innerHTML = txt;
  }
  if (pending) { const A = TERMS.get(pending), p = svgPt(e); $('#rubber').setAttribute('d', `M${A.x} ${A.y}L${p.x} ${p.y}`); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') setPending(null);
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
});
$('#clearBtn').onclick = () => { wires = []; renderWires(); };
$('#hintBtn').onclick = () => {
  const { missing } = wireCheck();
  document.querySelectorAll('.term.hint').forEach(t => t.classList.remove('hint'));
  if (!missing.length) return toast('배선이 모두 맞아요');
  const [a, b] = missing[0];
  for (const id of [a, b]) svg.querySelector(`.term[data-id="${CSS.escape(id)}"]`).classList.add('hint');
  $('#info').innerHTML = `다음 연결: <b>${termName(a)}</b> ↔ <b>${termName(b)}</b>`;
  clearTimeout(hintTimer); hintTimer = setTimeout(() => document.querySelectorAll('.term.hint').forEach(t => t.classList.remove('hint')), 3000);
};

// 버튼·노브
let drag = null;
svg.addEventListener('pointerdown', e => {
  const cap = e.target.closest('.cap'), knob = e.target.closest('.knob');
  if (cap) {
    const id = cap.dataset.comp; e.preventDefault(); svg.setPointerCapture(e.pointerId);
    if (id === 'B2') { cap.setAttribute('r', 9); if (running || rt) { serial('— RESET (B2) —\n', 'sys'); run(); } return; }
    if (id === 'B1') b1 = true; else cs[id].pressed = true;
    if (stats) { stats.presses++; stats.lastInput = performance.now(); }
    drag = { cap: id }; return;
  }
  if (knob) { e.preventDefault(); svg.setPointerCapture(e.pointerId); drag = { knob: knob.dataset.comp, x: e.clientX, y: e.clientY }; }
});
const release = () => {
  if (drag && drag.cap) {
    if (drag.cap === 'B1') b1 = false; else if (cs[drag.cap]) cs[drag.cap].pressed = false;
    if (stats) stats.lastInput = performance.now();
  }
  const b2 = $('#b2cap'); if (b2) b2.setAttribute('r', 11);
  drag = null;
};
svg.addEventListener('pointerup', release); svg.addEventListener('pointercancel', release);
svg.addEventListener('pointermove', e => {
  if (!drag || !drag.knob) return;
  const c = cs[drag.knob];
  c.pos = Math.max(0, Math.min(1, c.pos + ((e.clientX - drag.x) - (e.clientY - drag.y)) / 220));
  drag.x = e.clientX; drag.y = e.clientY;
});
svg.addEventListener('wheel', e => {
  const k = e.target.closest('.knob'); if (!k) return;
  e.preventDefault(); const c = cs[k.dataset.comp]; c.pos = Math.max(0, Math.min(1, c.pos - e.deltaY / 1500));
}, { passive: false });

/* ---------- 시리얼 ---------- */
const out = $('#out');
function serial(text, kind) {
  text = String(text).replace(/\r/g, '');
  if (stats && !kind) stats.serialLines += (text.match(/\n/g) || []).length;
  const last = out.lastChild;
  if (!kind && last && last.nodeType === 3) last.nodeValue += text;
  else if (kind) { const s = document.createElement('span'); s.className = kind; s.textContent = text; out.append(s); }
  else out.append(document.createTextNode(text));
  if (out.textContent.length > 60000) out.firstChild.remove();
  out.scrollTop = out.scrollHeight;
}
$('#clrSerial').onclick = () => { out.textContent = ''; };

/* ---------- 실행 ---------- */
function setStatus(k, t) { const s = $('#status'); s.className = 'status ' + k; s.lastElementChild.textContent = t; }
function newStats() { return { ld2Edges: 0, ledEdges: {}, ledLevels: {}, reactive: 0, presses: 0, serialLines: 0, adcValues: new Set(), servoMin: 999, servoMax: -1, lastInput: -1e9 }; }
function friendly(e) {
  const m = String(e && e.message || e);
  let r;
  if ((r = m.match(/^(\w+) is not defined/))) return `'${r[1]}'을(를) 찾을 수 없어요. 오타이거나 이 실습실이 지원하지 않는 함수/변수예요.`;
  if (e instanceof SyntaxError) return '문법 오류: ' + m + ' (세미콜론, 괄호, 중괄호 짝을 확인하세요)';
  if ((r = m.match(/Cannot (?:read|set) propert(?:y|ies) of (undefined|null)/))) return '정의되지 않은 값에 접근했어요. 구조체/포트 이름을 확인하세요.';
  return m;
}
async function run() {
  stop(true);
  stats = newStats(); sysWarned.clear();
  for (const id in cs) { cs[id].lit = false; }
  serial(`▶ ${cur.title} 실행\n`, 'sys');
  const me = createRuntime(hw); rt = me;
  let start;
  try { start = me.compile($('#code').value); }
  catch (e) { serial('[오류] 컴파일 실패 — ' + friendly(e) + '\n', 'err'); setStatus('err', '컴파일 오류'); rt = null; return; }
  running = true; setStatus('run', '실행 중');
  try {
    await start();
    if (rt === me) { serial('■ main()이 끝났어요 (실제 MCU는 while(1)로 멈추지 않게 합니다)\n', 'sys'); setStatus('', '종료'); running = false; }
  } catch (e) {
    if (e instanceof Stop) return;
    if (rt === me) { serial('[오류] ' + friendly(e) + '\n', 'err'); setStatus('err', '오류'); running = false; me.stop(); }
  }
}
function stop(silent) {
  if (rt) rt.stop();
  if (running && !silent) serial('■ 정지\n', 'sys');
  rt = null; running = false; setStatus('', '대기');
}
$('#runBtn').onclick = run; $('#runBtn2').onclick = run; $('#stopBtn').onclick = () => stop();

/* ---------- 프레임 루프 ---------- */
let lastT = performance.now();
function edge(key, lit, now) {
  if (!stats) return;
  if (key === 'ld2') stats.ld2Edges++; else stats.ledEdges[key] = (stats.ledEdges[key] || 0) + 1;
  if (now - stats.lastInput < 450) stats.reactive++;
}
function frame(now) {
  const dt = Math.min(.1, (now - lastT) / 1000); lastT = now;
  // LD2
  const d2 = rt && rt.drive('PA5'); const l2 = d2 ? d2.level : 0;
  $('#ld2glow').setAttribute('opacity', l2.toFixed(2));
  $('#ld2').setAttribute('fill', l2 > .05 ? '#5df08a' : '#cfe8d4');
  const lit2 = l2 > .5; if (lit2 !== cs.__ld2) { if (cs.__ld2 !== undefined && running) edge('ld2', lit2, now); cs.__ld2 = lit2; }
  $('#b1cap').setAttribute('r', b1 ? 9 : 11);
  for (const c of cur.comps) {
    const s = cs[c.id];
    if (c.type === 'led') {
      let lv = 0;
      if (isGnd(c.id + ':-')) { const d = netDrive(c.id + ':+'); if (d) lv = d.level; }
      const g = document.getElementById('glow-' + c.id); if (!g) continue;
      g.setAttribute('opacity', (lv * .95).toFixed(2));
      document.getElementById('dome-' + c.id).setAttribute('fill-opacity', (.3 + .7 * lv).toFixed(2));
      const lit = lv > .5;
      if (lit !== s.lit) { if (running) edge(c.id, lit, now); s.lit = lit; }
      if (running && stats && lv > 0) (stats.ledLevels[c.id] = stats.ledLevels[c.id] || new Set()).add(Math.round(lv * 20));
    } else if (c.type === 'button') {
      document.getElementById('cap-' + c.id).setAttribute('r', s.pressed ? 11 : 14);
    } else if (c.type === 'pot') {
      document.getElementById('knob-' + c.id).setAttribute('transform', `rotate(${-135 + 270 * s.pos} 55 38)`);
      const top = voltOf(c.id + ':+'), bot = voltOf(c.id + ':-');
      document.getElementById('val-' + c.id).textContent = top !== null && bot !== null ? `${(bot + (top - bot) * s.pos).toFixed(2)} V` : '전원 연결 안 됨';
    } else if (c.type === 'servo') {
      let target = s.angle, note = '';
      if (!powered(c.id)) note = '전원 연결 안 됨';
      else { const d = netDrive(c.id + ':S'); if (d && d.pulse !== null && d.pulse >= 400) target = Math.max(0, Math.min(180, (d.pulse - 500) / 2000 * 180)); else if (rt) note = '신호 없음'; }
      s.angle += (target - s.angle) * Math.min(1, dt * 7);
      document.getElementById('arm-' + c.id).setAttribute('transform', `rotate(${(s.angle - 90).toFixed(1)} 45 47)`);
      document.getElementById('val-' + c.id).textContent = note || `${Math.round(s.angle)}°`;
      if (running && stats && !note) { stats.servoMin = Math.min(stats.servoMin, s.angle); stats.servoMax = Math.max(stats.servoMax, s.angle); }
    }
  }
  // 보드 핀 출력 표시
  for (const p of BOARD_PINS) {
    if (p.kind !== 'io') continue;
    const d = rt && rt.drive(p.id);
    const pad = svg.querySelector(`.term[data-id="B:${p.id}"] .pad`);
    const hi = d ? d.level : 0;
    pad.setAttribute('fill', hi > 0 ? `color-mix(in srgb, #ffe04a ${Math.round(40 + 60 * hi)}%, #d6ad52)` : '#d6ad52');
  }
  // 완료 판정
  if (running && stats && !store.done[cur.id]) {
    const wc = wireCheck();
    if (!wc.missing.length && !wc.short && cur.goal.check(stats)) {
      store.done[cur.id] = true; save(); renderList(); renderGoal();
      toast(`완료! ${cur.title}`);
      serial(`✓ 레슨 완료: ${cur.goal.text}\n`, 'sys');
    }
  }
  requestAnimationFrame(frame);
}

/* ---------- 패널 ---------- */
function renderList() {
  $('#lessonList').innerHTML = LESSONS.map((l, i) => `<li class="${store.done[l.id] ? 'done' : ''}"><button data-id="${l.id}" aria-current="${l === cur}">
    <span class="n">${store.done[l.id] ? '✓' : i + 1}</span><span><b>${l.title}</b><small>${l.tag}</small></span><span></span></button></li>`).join('');
  const n = LESSONS.filter(l => store.done[l.id]).length;
  $('#progText').textContent = `${n} / ${LESSONS.length} 완료`;
  $('#progBar').style.width = (n / LESSONS.length * 100) + '%';
}
$('#lessonList').addEventListener('click', e => { const b = e.target.closest('button'); if (b) location.hash = b.dataset.id; });
function renderGoal() {
  const g = $('#goal'); g.classList.toggle('done', !!store.done[cur.id]);
  g.lastElementChild.textContent = (store.done[cur.id] ? '완료 — ' : '목표 — ') + cur.goal.text;
}
function renderPinTab() {
  const { missing } = wireCheck();
  let h;
  if (!cur.wiring.length) {
    h = `<p>이 레슨은 배선이 필요 없어요. 보드에 내장된 부품을 씁니다.</p>
      <table class="stack"><thead><tr><th>보드 부품</th><th>MCU 핀</th><th>동작</th></tr></thead><tbody>
      <tr><td>LD2 (초록 LED)</td><td><code>PA5</code> · D13</td><td>HIGH일 때 켜짐</td></tr>
      <tr><td>B1 USER (파란 버튼)</td><td><code>PC13</code></td><td>누르면 LOW, 평소 HIGH</td></tr>
      <tr><td>USART2</td><td><code>PA2</code> / <code>PA3</code></td><td>ST-LINK 가상 COM 포트</td></tr></tbody></table>`;
  } else {
    h = `<table class="stack"><thead><tr><th>부품 단자</th><th>보드 핀</th><th>상태</th></tr></thead><tbody>` +
      cur.wiring.map(([a, b]) => {
        const ok = !missing.includes(cur.wiring.find(w => w[0] === a && w[1] === b));
        const [ca, cb] = a.startsWith('B:') ? [b, a] : [a, b];
        return `<tr><td>${termName(ca)}</td><td>${termName(cb)}</td><td class="st ${ok ? 'ok' : 'no'}">${ok ? '연결' : '—'}</td></tr>`;
      }).join('') + `</tbody></table><p class="note">GND는 보드의 GND 핀 3개 중 아무거나 써도 돼요(보드 안에서 서로 연결됨). 배선 힌트 버튼을 누르면 다음에 연결할 두 핀이 깜빡입니다.</p>`;
  }
  $('#p-pin').innerHTML = h;
}
function renderSpec() {
  const row = r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`;
  $('#p-spec').innerHTML = `<h3 class="sub">이 레슨</h3><table><tbody>${cur.spec.map(row).join('')}</tbody></table>
  <h3 class="sub">STM32F401RE · NUCLEO-F401RE</h3><table><tbody>${[
    ['코어', 'Arm Cortex-M4 + FPU, 최대 84MHz'], ['메모리', 'Flash 512KB · SRAM 96KB'], ['ADC', '12bit 1개, 외부 16채널'],
    ['타이머', 'TIM1(고급) · TIM2~5 · TIM9~11'], ['통신', 'USART ×3 · I2C ×3 · SPI ×4 · USB OTG FS'], ['동작 전압', 'MCU 1.7~3.6V, 보드 I/O 3.3V'],
    ['디버거', 'ST-LINK/V2-1 내장 (드래그앤드롭 업로드, 가상 COM)'], ['커넥터', 'Arduino Uno V3 + ST morpho']].map(row).join('')}</tbody></table>
  <h3 class="sub">시뮬레이터 범위</h3><p class="note">GPIO 입출력, HAL_Delay/HAL_GetTick, USART2(printf), ADC1 폴링, TIM3·TIM1 PWM을 지원해요. 인터럽트·DMA·I2C·SPI는 아직 없고, C 문법은 자주 쓰는 부분만 변환합니다. 실제 보드에서는 STM32CubeIDE로 같은 코드를 빌드하면 됩니다.</p>
  <p class="note">참고: <a href="https://www.st.com/en/evaluation-tools/nucleo-f401re.html">ST NUCLEO-F401RE 공식 페이지</a> · <a href="https://www.st.com/en/microcontrollers-microprocessors/stm32f401re.html">STM32F401RE 데이터시트</a></p>`;
}
function selectTab(k) {
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === k));
  document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== 'p-' + k);
  if (k === 'code') syncGutter();
}
document.querySelectorAll('.tab').forEach(t => t.onclick = () => selectTab(t.dataset.tab));

/* ---------- 에디터 ---------- */
const ta = $('#code'), gut = $('#gutter');
function syncGutter() { const n = ta.value.split('\n').length; gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); gut.scrollTop = ta.scrollTop; }
let saveT = 0;
ta.addEventListener('input', () => { syncGutter(); clearTimeout(saveT); saveT = setTimeout(() => { store.code[cur.id] = ta.value; save(); }, 300); });
ta.addEventListener('scroll', () => { gut.scrollTop = ta.scrollTop; });
ta.addEventListener('keydown', e => {
  if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
    const before = ta.value.slice(0, ta.selectionStart); const line = before.slice(before.lastIndexOf('\n') + 1);
    const ind = line.match(/^\s*/)[0] + (/\{\s*$/.test(line) ? '  ' : '');
    e.preventDefault(); document.execCommand('insertText', false, '\n' + ind);
  }
});
let resetArm = 0;
$('#resetCode').onclick = e => {
  const b = e.currentTarget;
  if (!resetArm) { resetArm = setTimeout(() => { resetArm = 0; b.textContent = '예제로 되돌리기'; }, 3000); b.textContent = '한 번 더 누르면 되돌려요'; return; }
  clearTimeout(resetArm); resetArm = 0; b.textContent = '예제로 되돌리기';
  ta.value = cur.code; delete store.code[cur.id]; save(); syncGutter();
};
$('#copyCode').onclick = async () => { try { await navigator.clipboard.writeText(ta.value); toast('코드를 복사했어요'); } catch (e) { ta.select(); toast('Ctrl+C로 복사하세요'); } };

let toastT = 0;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); }

/* ---------- 레슨 전환 ---------- */
function openLesson(id) {
  const l = LESSONS.find(l => l.id === id) || LESSONS[0];
  stop(true); stats = null; setPending(null);
  cur = l;
  $('#lTitle').textContent = l.title; $('#lTag').textContent = `레슨 ${LESSONS.indexOf(l) + 1} · ${l.tag}`;
  $('#ovBody').innerHTML = l.overview;
  ta.value = store.code[l.id] || l.code; syncGutter();
  renderLesson(); renderList(); renderGoal(); renderSpec();
  $('#info').innerHTML = l.wiring.length ? '핀을 누른 뒤 연결할 다른 핀을 누르면 전선이 생겨요. 전선을 누르면 지워집니다.' : '이 레슨은 배선 없이 보드 내장 LED·버튼을 씁니다. 실행을 눌러보세요.';
  document.title = `${l.title} · STM32 실습실`;
}
window.addEventListener('hashchange', () => openLesson(location.hash.slice(1)));

drawBoard();
openLesson(location.hash.slice(1));
requestAnimationFrame(frame);
}
