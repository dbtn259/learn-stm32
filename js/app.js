// STM32 실습실 UI: 3D 작업대, 배선, 실행, 레슨 진행
import { createScene, BOARD } from './scene3d.js';
{
const $ = s => document.querySelector(s);
const LESSONS = window.LESSONS, PARTS = window.PARTS;
const { createRuntime, Stop } = window.STM;
const now = () => performance.now();

/* ---------- 저장소 ---------- */
const KEY = 'stm32lab:v3';
let store = { done: {}, code: {}, wires: {}, pos: {}, sandbox: null, sound: true };
try {
  const old = JSON.parse(localStorage.getItem('stm32lab:v2') || 'null');
  if (old && !localStorage.getItem(KEY)) Object.assign(store, { done: old.done || {}, code: old.code || {}, sound: old.sound !== false });
  store = Object.assign(store, JSON.parse(localStorage.getItem(KEY) || '{}'));
} catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };

/* ---------- 보드 핀 ---------- */
const BOARD_PINS = BOARD.filter(p => p.kind !== 'nc');
const AF = {
  PA0: 'ADC1_IN0 · TIM2_CH1(엔코더 A)', PA1: 'ADC1_IN1 · TIM2_CH2(엔코더 B)', PA4: 'ADC1_IN4', PB0: 'ADC1_IN8 · TIM3_CH3', PC1: 'ADC1_IN11', PC0: 'ADC1_IN10',
  PB8: 'I2C1_SCL', PB9: 'I2C1_SDA', PA5: 'LD2 · SPI1_SCK', PA6: 'TIM3_CH1 · SPI1_MISO', PA7: 'TIM3_CH2 · SPI1_MOSI', PB6: 'TIM4_CH1 · I2C1_SCL',
  PC7: 'TIM3_CH2', PA9: 'TIM1_CH2 · USART1_TX', PA8: 'TIM1_CH1', PB10: 'TIM2_CH3 · I2C2_SCL', PB4: 'TIM3_CH1', PB5: 'TIM3_CH2',
  PB3: 'TIM2_CH2', PA10: 'USART1_RX', PA2: 'USART2_TX (가상 COM)', PA3: 'USART2_RX (가상 COM)',
  '3V3': '3.3V 전원 출력', '5V': '5V 전원 출력 (USB)', GND1: '접지', GND2: '접지', GND3: '접지'
};
const BP = Object.fromEntries(BOARD.map(p => [p.id, p]));

/* ---------- 상태 ---------- */
let cur = LESSONS[0], comps = [], wires = [], pending = null, nets = new Map(), members = new Map();
let rt = null, running = false, stats = null, hintTimer = 0, b1 = false, b2 = false, ld2Lit = false;
const cs = {}, ios = {};
const TERMS = new Set();
const compOf = id => comps.find(c => c.id === id);

function termName(id) {
  if (id.startsWith('B:')) { const p = BP[id.slice(2)]; return p.kind === 'io' ? `${p.lab} (${p.id})` : p.lab; }
  const [cid, t] = id.split(':'); const c = compOf(cid);
  return `${c ? c.name : cid} ${t === '-' ? '−' : t}`;
}

/* ---------- 넷 ---------- */
function rebuildNets() {
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const id of TERMS) parent.set(id, id);
  parent.set(find('B:GND1'), find('B:GND2')); parent.set(find('B:GND2'), find('B:GND3'));
  for (const [a, b] of wires) if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b));
  nets = new Map(); members = new Map();
  for (const id of parent.keys()) { const r = find(id); nets.set(id, r); if (!members.has(r)) members.set(r, []); members.get(r).push(id); }
}
const mem = id => members.get(nets.get(id)) || [id];
const isGnd = id => mem(id).some(m => /^B:GND/.test(m));
const isPwr = id => mem(id).some(m => m === 'B:3V3' || m === 'B:5V');
const voltOf = id => { const m = mem(id); if (m.includes('B:5V')) return 5; if (m.includes('B:3V3')) return 3.3; if (m.some(x => /^B:GND/.test(x))) return 0; return null; };
const sameNet = (a, b) => nets.get(a) !== undefined && nets.get(a) === nets.get(b);

function netDrive(id) {
  for (const m of mem(id)) {
    if (m === 'B:3V3' || m === 'B:5V') return { level: 1, pulse: null };
    if (rt && m.startsWith('B:') && BP[m.slice(2)].kind === 'io') { const d = rt.drive(m.slice(2)); if (d) return d; }
  }
  return null;
}
const sysWarned = new Set();
function sysWarn(k, msg) { if (!sysWarned.has(k)) { sysWarned.add(k); serial('[경고] ' + msg + '\n', 'warn'); } }

/* ---------- 부품 io ---------- */
function newStats() {
  return { ld2Edges: 0, ledEdges: {}, ledLevels: {}, reactive: 0, presses: 0, serialLines: 0, adcValues: new Set(), servoMin: 999, servoMax: -1, lastInput: -1e9,
    rgbColors: new Set(), relayToggles: 0, buzzFreqs: new Set(), pings: 0, digits: new Set(), lcdText: '', oledFrames: 0, dhtReads: 0,
    rpmMax: 0, rpmRev: false, hold: 0, holdMax: 0, posHold: 0, posHoldMax: 0, stepMin: 0, stepMax: 0, escMax: 0, escArmed: false, irq: {}, rxBytes: 0 };
}
const DUMMY = newStats();
function makeIo(c) {
  const P = PARTS[c.type], T = t => c.id + ':' + t;
  return {
    drive: t => netDrive(T(t)), gnd: t => isGnd(T(t)), volt: t => voltOf(T(t)),
    powered: () => !P.pwr || (isPwr(T(P.pwr[0])) && isGnd(T(P.pwr[1]))),
    el: n => document.getElementById(c.id + '-' + n),
    edge: (k, on) => edge(k, on, now()),
    get stats() { return stats || DUMMY; }, get running() { return running; },
    sound: f => sound(c.id, f), warn: sysWarn, beep: () => beep()
  };
}
function eachPart(fn) { for (const c of comps) { const P = PARTS[c.type]; if (P && cs[c.id] && ios[c.id]) fn(c, P, cs[c.id], ios[c.id]); } }
function updateMotors() { const t = now(); eachPart((c, P, s, io) => { if (P.update) P.update(c, s, io, t); }); }

const hw = {
  readPin(p, pull, silent) {
    if (p === 'PC13') return b1 ? 0 : 1;
    const id = 'B:' + p;
    if (!TERMS.has(id)) return pull === 1 ? 1 : 0;
    const t = now();
    for (const m of mem(id)) {
      if (m === 'B:3V3' || m === 'B:5V') return 1;
      if (/^B:GND/.test(m)) return 0;
      if (m.startsWith('B:')) { if (m !== id && rt) { const d = rt.drive(m.slice(2)); if (d) return d.level > .5 ? 1 : 0; } continue; }
      const [cid, term] = m.split(':'); const c = compOf(cid); const P = c && PARTS[c.type];
      if (P && P.out) { if (P.update) P.update(c, cs[cid], ios[cid], t); const v = P.out(c, cs[cid], term, ios[cid], t); if (v !== null && v !== undefined) return v; }
    }
    if (pull === 0 && !silent) sysWarn('float' + p, `${p} 입력이 어디에도 연결되지 않아 값이 불안정(floating)해요.`);
    return pull === 1 ? 1 : 0;
  },
  analog(p) {
    const id = 'B:' + p;
    if (!TERMS.has(id)) return 0;
    for (const m of mem(id)) {
      if (m === 'B:3V3') return 4095;
      if (m === 'B:5V') { sysWarn('adc5', 'ADC 핀에 5V가 들어갔어요. 3.3V를 넘으면 실제 칩이 손상될 수 있습니다.'); return 4095; }
      if (/^B:GND/.test(m)) return 0;
      if (m.startsWith('B:')) continue;
      const [cid, term] = m.split(':'); const c = compOf(cid); const P = c && PARTS[c.type];
      if (P && P.analog) {
        const v = P.analog(c, cs[cid], term, ios[cid]); if (v === null) continue;
        if (v > 3.31) sysWarn('adc5', '가변저항에 5V를 걸었어요. ADC 입력은 3.3V를 넘으면 안 됩니다. +를 3V3에 연결하세요.');
        return Math.max(0, Math.min(4095, v / 3.3 * 4095 + (Math.random() * 6 - 3)));
      }
    }
    return 1700 + Math.random() * 800;
  },
  onWrite() {
    const t = now(); updateMotors(); eachPart((c, P, s, io) => { if (P.onWrite) P.onWrite(c, s, io, t); if (c.type === 'led') P.step(c, s, io, 0, t); });
    const d2 = rt && rt.drive('PA5'); const on = !!d2 && d2.level > .5; if (on !== ld2Lit) { ld2Lit = on; edge('ld2', on, t); }
  },
  onPwm: () => updateMotors(),
  encoder() {
    let r = null;
    eachPart((c, P, s, io) => {
      if (c.type !== 'dcmotor' || r !== null || !io.powered()) return;
      P.update(c, s, io, now());
      if (sameNet(c.id + ':A', 'B:PA0') && sameNet(c.id + ':B', 'B:PA1')) r = P.encoder(s);
      else if (sameNet(c.id + ':A', 'B:PA1') && sameNet(c.id + ':B', 'B:PA0')) r = -P.encoder(s);
    });
    if (r === null) { sysWarn('encw', '엔코더 A→PA0(A0), B→PA1(A1)과 모터 전원 배선을 확인하세요.'); return 0; }
    return r;
  },
  i2cReady(addr) {
    let ok = false;
    eachPart((c, P, s, io) => { if (P.i2c === addr && io.powered() && sameNet(c.id + ':SDA', 'B:PB9') && sameNet(c.id + ':SCL', 'B:PB8')) ok = true; });
    return ok;
  },
  oledShow(buf) { eachPart((c, P, s) => { if (c.type === 'oled') { s.buf = buf; s.ver++; } }); if (stats) stats.oledFrames++; },
  lcdShow(lines) { eachPart((c, P, s) => { if (c.type === 'lcd') s.lines = lines.slice(); }); if (stats) stats.lcdText = lines.join('|'); },
  dhtRead(p) {
    let r = null;
    eachPart((c, P, s, io) => { if (c.type === 'dht11' && io.powered() && sameNet(c.id + ':DATA', 'B:' + p)) r = { t: Math.round(s.t), h: Math.round(s.h) }; });
    if (r && stats) stats.dhtReads++;
    return r;
  },
  onSerial: s => serial(s),
  onWarn: m => serial('[경고] ' + m + '\n', 'warn'),
  onError: e => { serial('[오류] 인터럽트 콜백: ' + friendly(e) + '\n', 'err'); setStatus('err', '오류'); },
  onAdc: v => stats && stats.adcValues.add(Math.round(v / 128)),
  onIrq: k => { if (stats) stats.irq[k] = (stats.irq[k] || 0) + 1; }
};

/* ---------- 소리 ---------- */
let actx = null; const oscs = {};
function audioInit() { if (!store.sound) return; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume && actx.resume(); } catch (e) { actx = null; } }
function sound(id, f) {
  if (!actx || !store.sound) { if (oscs[id]) oscs[id].g.gain.value = 0; return; }
  let o = oscs[id];
  if (!o) { const osc = actx.createOscillator(), g = actx.createGain(); osc.type = 'square'; g.gain.value = 0; osc.connect(g).connect(actx.destination); osc.start(); o = oscs[id] = { osc, g, f: 0 }; }
  if (f === o.f) return; o.f = f;
  if (f) { o.osc.frequency.setTargetAtTime(f, actx.currentTime, .005); o.g.gain.setTargetAtTime(.04, actx.currentTime, .01); }
  else o.g.gain.setTargetAtTime(0, actx.currentTime, .01);
}
function silence() { for (const k in oscs) { oscs[k].g.gain.value = 0; oscs[k].f = 0; } }
function beep() {
  if (!actx || !store.sound) return;
  [0, .15, .3].forEach((d, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880 + i * 220; g.gain.value = .04; o.connect(g).connect(actx.destination); o.start(actx.currentTime + d); o.stop(actx.currentTime + d + .1); });
}
const sndBtn = $('#soundBtn');
const paintSnd = () => { sndBtn.textContent = store.sound ? '소리 켬' : '소리 끔'; sndBtn.setAttribute('aria-pressed', store.sound); };
sndBtn.onclick = () => { store.sound = !store.sound; save(); paintSnd(); if (store.sound) audioInit(); else silence(); };
paintSnd();

/* ---------- 3D 작업대 ---------- */
const stage = $('#stage');
const scene = createScene(stage, {
  onTerm: id => {
    if (!pending) return setPending(id);
    if (pending === id) return setPending(null);
    if (!wires.some(([a, b]) => (a === pending && b === id) || (a === id && b === pending))) { wires.push([pending, id]); renderWires(); }
    setPending(null);
  },
  onWire: i => { wires.splice(i, 1); renderWires(); },
  onEmpty: () => setPending(null),
  onHover: id => {
    if (!id) return;
    let txt = `<b>${termName(id)}</b>`;
    if (id.startsWith('B:')) {
      txt += ` · ${AF[id.slice(2)] || ''}`;
      const s = rt && rt.st.pins[id.slice(2)];
      if (s) txt += ` · ${({ out: '출력', in: '입력', an: '아날로그', af: '대체 기능', reset: '리셋', it_r: '인터럽트↑', it_f: '인터럽트↓', it_rf: '인터럽트↕' })[s.mode] || s.mode}${s.mode === 'out' ? (s.out ? ' HIGH' : ' LOW') : ''}`;
    }
    $('#info').innerHTML = txt;
  },
  onPress: (id, down) => {
    if (id === 'B2') { b2 = down; if (down && rt) { serial('— RESET (B2) —\n', 'sys'); run(); } return; }
    if (id === 'B1') b1 = down; else if (cs[id]) cs[id].pressed = down;
    if (stats) { if (down) stats.presses++; stats.lastInput = now(); }
  },
  onAct: (id, dx, dy) => { const c = compOf(id); const P = c && PARTS[c.type]; if (P && P.act) P.act(cs[c.id], dx, dy); },
  onMove: (id, X, Z, end) => {
    const c = compOf(id); if (!c) return; c.X = X; c.Z = Z;
    if (!end) { scene.setWires(wires, wireColor); return; }
    if (cur.sandbox) saveSandbox(); else (store.pos[cur.id] = store.pos[cur.id] || {})[c.id] = [X, Z];
    save();
  },
  onDelete: id => removeComp(id)
});
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => scene.view(b.dataset.view));
window.__lab = { scene };

function lessonComps(l) {
  if (l.sandbox) return (store.sandbox || []).map(c => ({ ...c }));
  const pos = store.pos[l.id] || {};
  return l.comps.map(c => {
    const P = PARTS[c.type];
    const X = (c.x - 410) * .2 + 45 + P.w / 2, Z = (c.y - 300) * .2 + P.d / 2;
    return { ...c, name: c.name || P.label, X: pos[c.id] ? pos[c.id][0] : X, Z: pos[c.id] ? pos[c.id][1] : Z };
  });
}
function renderLesson() {
  comps = lessonComps(cur);
  TERMS.clear();
  for (const p of BOARD_PINS) TERMS.add('B:' + p.id);
  for (const c of comps) {
    const P = PARTS[c.type];
    if (!cs[c.id] || cs[c.id].__t !== c.type) cs[c.id] = Object.assign(P.init(), { __t: c.type });
    ios[c.id] = makeIo(c);
    for (const [t] of P.terms) TERMS.add(`${c.id}:${t}`);
  }
  scene.setComps(comps, !!cur.sandbox);
  wires = (store.wires[cur.id] || []).filter(([a, b]) => TERMS.has(a) && TERMS.has(b));
  renderWires(true);
}
const WCOL = ['#f0a202', '#1d7fd6', '#16a34a', '#e4572e', '#0f9fb5', '#c2417a', '#8e6c3a', '#f2f2f2'];
function wireColor(a, b, i) {
  const ends = a + ' ' + b;
  if (/B:GND/.test(ends)) return '#1b1c1e';
  if (/B:3V3|B:5V/.test(ends)) return '#d6332a';
  let k = 0; for (let j = 0; j < i; j++) { const e = wires[j][0] + ' ' + wires[j][1]; if (!/B:GND|B:3V3|B:5V/.test(e)) k++; }
  return WCOL[k % WCOL.length];
}
function renderWires(noSave) {
  rebuildNets();
  scene.setWires(wires, wireColor);
  if (!noSave) { store.wires[cur.id] = wires; save(); }
  updateWireStatus();
}
function wireCheck() {
  const req = cur.wiring || [];
  const missing = req.filter(([a, b]) => !sameNet(a, b));
  let short = false;
  for (const ms of members.values()) {
    const g = ms.some(m => /^B:GND/.test(m)), v3 = ms.includes('B:3V3'), v5 = ms.includes('B:5V');
    if ((g && (v3 || v5)) || (v3 && v5)) short = true;
  }
  return { missing, short, total: req.length };
}
function updateWireStatus() {
  const { missing, short, total } = wireCheck();
  const chip = $('#wireChip');
  chip.className = 'wirechip' + (short ? ' bad' : total && !missing.length ? ' ok' : '');
  chip.textContent = short ? '전원 단락!' : total ? `배선 ${total - missing.length} / ${total}` : cur.sandbox ? `전선 ${wires.length}개` : '배선 필요 없음';
  $('#hintBtn').hidden = !total; $('#clearBtn').hidden = !total && !cur.sandbox;
  if (short) sysWarn('short' + wires.length, '전원(3V3/5V)과 GND, 또는 3V3와 5V가 바로 연결됐어요. 실제로는 단락이라 위험합니다.');
  renderPinTab();
}
function setPending(id) { pending = id; scene.setPending(id); if (id) $('#info').innerHTML = `<b>${termName(id)}</b> 선택됨 · 연결할 다른 핀을 누르세요 (Esc 취소)`; }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') setPending(null);
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
});
$('#clearBtn').onclick = () => { wires = []; renderWires(); };
$('#hintBtn').onclick = () => {
  const { missing } = wireCheck();
  if (!missing.length) return toast('배선이 모두 맞아요');
  const [a, b] = missing[0];
  scene.highlight([a, b]);
  $('#info').innerHTML = `다음 연결: <b>${termName(a)}</b> ↔ <b>${termName(b)}</b>`;
  clearTimeout(hintTimer); hintTimer = setTimeout(() => scene.highlight([]), 3500);
};

/* ---------- 자유 실습 ---------- */
const pal = $('#partSel');
pal.innerHTML = Object.entries(PARTS).map(([k, P]) => `<option value="${k}">${P.label}</option>`).join('');
const saveSandbox = () => { store.sandbox = comps.map(({ id, type, name, color, X, Z }) => ({ id, type, name, color, X, Z })); save(); };
$('#addPart').onclick = () => {
  const type = pal.value, P = PARTS[type];
  let n = 1; while (comps.some(c => c.id === type + n)) n++;
  const id = type + n, k = comps.length;
  comps.push({ id, type, name: `${P.label} ${n}`, color: type === 'led' ? ['red', 'green', 'yellow', 'blue', 'white'][(n - 1) % 5] : undefined, X: 60 + (k % 3) * 70 + P.w / 2, Z: -40 + Math.floor(k / 3) * 60 });
  saveSandbox(); stop(true); renderLesson(); scene.view('all'); toast(`${P.label} 추가 — 몸체를 끌어 옮길 수 있어요`);
};
function removeComp(id) {
  comps = comps.filter(c => c.id !== id); saveSandbox();
  store.wires[cur.id] = (store.wires[cur.id] || []).filter(w => !w.some(t => t.startsWith(id + ':'))); save();
  stop(true); renderLesson();
}

/* ---------- 시리얼 · 플로터 ---------- */
const out = $('#out');
let lineBuf = '';
const series = new Map(); let plotDirty = false;
function serial(text, kind) {
  text = String(text).replace(/\r/g, '');
  if (!kind) {
    if (stats) stats.serialLines += (text.match(/\n/g) || []).length;
    lineBuf += text; let i;
    while ((i = lineBuf.indexOf('\n')) >= 0) { plotLine(lineBuf.slice(0, i)); lineBuf = lineBuf.slice(i + 1); }
  }
  const last = out.lastChild;
  if (!kind && last && last.nodeType === 3) last.nodeValue += text;
  else if (kind) { const s = document.createElement('span'); s.className = kind; s.textContent = text; out.append(s); }
  else out.append(document.createTextNode(text));
  while (out.textContent.length > 60000 && out.firstChild) out.firstChild.remove();
  out.scrollTop = out.scrollHeight;
}
function plotLine(l) {
  const pairs = [...l.matchAll(/([A-Za-z가-힣_][\w가-힣]*)\s*[:=]\s*(-?\d+(?:\.\d+)?)/g)];
  let vals = pairs.map(m => [m[1], +m[2]]);
  if (!vals.length && /^[\s,\-\d.]+$/.test(l) && /\d/.test(l)) vals = l.trim().split(/[\s,]+/).map((v, i) => ['값' + (i + 1), +v]);
  if (!vals.length) return;
  for (const [k, v] of vals) { if (!series.has(k)) series.set(k, []); const a = series.get(k); a.push(v); if (a.length > 400) a.shift(); }
  plotDirty = true;
}
const PCOL = ['#4ea3ff', '#ff7a5c', '#3ccf7a', '#ffc24a', '#e06aa6', '#3cc8d8'];
function drawPlot() {
  const cv = $('#plot'); if (cv.hidden || !plotDirty) return; plotDirty = false;
  const W = cv.clientWidth, H = cv.clientHeight, dpr = devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
  g.fillStyle = '#0b0f12'; g.fillRect(0, 0, W, H);
  let lo = Infinity, hi = -Infinity;
  for (const a of series.values()) for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!isFinite(lo)) { g.fillStyle = '#7f8c97'; g.font = '13px sans-serif'; g.fillText('printf("이름:값,이름:값\\r\\n") 형식으로 출력하면 그래프가 그려져요', 14, 28); return; }
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * .08; lo -= pad; hi += pad;
  const L = 52, R = W - 10, Tp = 28, B = H - 14;
  g.strokeStyle = '#1e262d'; g.fillStyle = '#7f8c97'; g.font = '11px monospace'; g.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const y = Tp + (B - Tp) * i / 4; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); g.fillText((hi - (hi - lo) * i / 4).toFixed(Math.abs(hi - lo) < 10 ? 2 : 0), L - 6, y + 4); }
  let i = 0, lx = L; g.textAlign = 'left';
  for (const [k, a] of series) {
    const col = PCOL[i++ % PCOL.length]; g.strokeStyle = col; g.lineWidth = 1.8; g.beginPath();
    a.forEach((v, j) => { const x = L + (R - L) * (j + 400 - a.length) / 399, y = B - (v - lo) / (hi - lo) * (B - Tp); j ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    g.fillStyle = col; g.fillRect(lx, 9, 10, 10); g.fillStyle = '#d6e2ea'; g.font = '12px sans-serif';
    const label = `${k} ${a[a.length - 1].toFixed(1)}`; g.fillText(label, lx + 14, 18); lx += g.measureText(label).width + 30;
  }
}
function showView(v) {
  document.querySelectorAll('.stab').forEach(x => x.setAttribute('aria-selected', x.dataset.view === v));
  $('#plot').hidden = v !== 'plot'; out.hidden = v === 'plot'; plotDirty = true;
}
document.querySelectorAll('.stab').forEach(b => b.onclick = () => showView(b.dataset.view));
$('#clrSerial').onclick = () => { out.textContent = ''; series.clear(); plotDirty = true; };
$('#rxForm').addEventListener('submit', e => {
  e.preventDefault();
  const inp = $('#rxIn'); const end = { none: '', lf: '\n', crlf: '\r\n' }[$('#rxEnd').value];
  if (!rt) { toast('먼저 실행하세요'); return; }
  rt.feed(inp.value + end); if (stats) stats.rxBytes += (inp.value + end).length;
  serial('» ' + inp.value + '\n', 'sys'); inp.value = '';
});

/* ---------- 실행 ---------- */
function setStatus(k, t) { const s = $('#status'); s.className = 'status ' + k; s.lastElementChild.textContent = t; }
function friendly(e) {
  const m = String(e && e.message || e); let r;
  if ((r = m.match(/^(\w+) is not defined/))) return `'${r[1]}'을(를) 찾을 수 없어요. 오타이거나 이 실습실이 지원하지 않는 함수/변수예요.`;
  if (e instanceof SyntaxError) return '문법 오류: ' + m + ' (세미콜론, 괄호, 중괄호 짝을 확인하세요)';
  if (/Cannot (?:read|set) propert/.test(m)) return '정의되지 않은 값에 접근했어요. 구조체·핸들·포트 이름을 확인하세요.';
  return m;
}
async function run() {
  stop(true); audioInit();
  stats = newStats(); sysWarned.clear(); lineBuf = '';
  eachPart((c, P, s) => { if ('lit' in s) s.lit = false; if (c.type === 'oled') { s.buf = null; s.ver++; } if (c.type === 'lcd') s.lines = ['', '']; if (c.type === 'stepper') s.idx = -1; if (c.type === 'dcmotor') s.lt = now(); });
  serial(`▶ ${cur.title} 실행\n`, 'sys');
  if (cur.plot) showView('plot');
  const me = createRuntime(hw); rt = me;
  let start;
  try { start = me.compile($('#code').value); }
  catch (e) { serial('[오류] 컴파일 실패 — ' + friendly(e) + '\n', 'err'); setStatus('err', '컴파일 오류'); me.stop(); rt = null; return; }
  running = true; setStatus('run', '실행 중');
  try {
    await start();
    if (rt === me) { serial('■ main()이 끝났어요 (실제 MCU에서는 while(1)로 끝나지 않게 합니다)\n', 'sys'); setStatus('', '종료'); }
  } catch (e) {
    if (e instanceof Stop) return;
    if (rt === me) { serial('[오류] ' + friendly(e) + '\n', 'err'); setStatus('err', '오류'); running = false; me.stop(); }
  }
}
function stop(silent) {
  if (rt) rt.stop();
  if (running && !silent) serial('■ 정지\n', 'sys');
  rt = null; running = false; setStatus('', '대기'); silence();
}
$('#runBtn').onclick = run; $('#runBtn2').onclick = run; $('#stopBtn').onclick = () => stop();

/* ---------- 프레임 루프 ---------- */
let lastT = now();
function edge(key, on, t) {
  if (!stats || !running) return;
  if (key === 'ld2') stats.ld2Edges++; else stats.ledEdges[key] = (stats.ledEdges[key] || 0) + 1;
  if (t - stats.lastInput < 450) stats.reactive++;
}
function frame(t) {
  const dt = Math.min(.1, (t - lastT) / 1000); lastT = t;
  const d2 = rt && rt.drive('PA5'); const l2 = d2 ? d2.level : 0;
  if ((l2 > .5) !== ld2Lit) { ld2Lit = l2 > .5; edge('ld2', ld2Lit, t); }
  eachPart((c, P, s, io) => { try { P.step(c, s, io, dt, t); } catch (e) { console.error(e); } });
  scene.render({ ld2: l2, b1, b2, parts: cs });
  drawPlot();
  if (running && stats && !cur.sandbox && !store.done[cur.id]) {
    const wc = wireCheck();
    if (!wc.missing.length && !wc.short && cur.goal.check(stats)) {
      store.done[cur.id] = true; save(); renderList(); renderGoal();
      toast(`완료! ${cur.title}`); serial(`✓ 레슨 완료: ${cur.goal.text}\n`, 'sys');
    }
  }
  requestAnimationFrame(frame);
}

/* ---------- 패널 ---------- */
function renderList() {
  let sec = '', h = '';
  LESSONS.forEach((l, i) => {
    if (l.sec !== sec) { sec = l.sec; h += `<li class="sec">${sec}</li>`; }
    h += `<li class="${store.done[l.id] ? 'done' : ''}"><button data-id="${l.id}" aria-current="${l === cur}"><span class="n">${store.done[l.id] ? '✓' : l.sandbox ? '∞' : i + 1}</span><span><b>${l.title}</b><small>${l.tag}</small></span></button></li>`;
  });
  $('#lessonList').innerHTML = h;
  const total = LESSONS.filter(l => !l.sandbox).length, n = LESSONS.filter(l => store.done[l.id]).length;
  $('#progText').textContent = `${n} / ${total} 완료`;
  $('#progBar').style.width = (n / total * 100) + '%';
}
$('#lessonList').addEventListener('click', e => { const b = e.target.closest('button'); if (b) location.hash = b.dataset.id; });
function renderGoal() {
  const g = $('#goal'); g.classList.toggle('done', !!store.done[cur.id]);
  g.hidden = !!cur.sandbox;
  g.lastElementChild.textContent = (store.done[cur.id] ? '완료 — ' : '목표 — ') + (cur.goal ? cur.goal.text : '');
}
const pinRef = () => `<h3 class="sub">이 실습실의 주변장치 핀 배정</h3><table class="stack"><thead><tr><th>기능</th><th>핀</th><th>핸들 · 설정</th></tr></thead><tbody>
  <tr><td>LD2 / B1</td><td>PA5 / PC13</td><td>보드 내장</td></tr>
  <tr><td>USART2</td><td>PA2(D1) / PA3(D0)</td><td><code>huart2</code> 115200 8N1</td></tr>
  <tr><td>ADC1</td><td>PA0 PA1 PA4 PB0 PC1 PC0</td><td><code>hadc1</code> 기본 채널 0(PA0)</td></tr>
  <tr><td>TIM1 PWM 50Hz</td><td>PA8(D7) CH1 · PA9(D8) CH2</td><td><code>htim1</code> PSC 83, ARR 19999</td></tr>
  <tr><td>TIM2 엔코더</td><td>PA0(A0) · PA1(A1)</td><td><code>htim2</code> 32bit, 4체배</td></tr>
  <tr><td>TIM3 PWM 1kHz</td><td>PA6(D12) CH1 · PA7(D11) CH2 · PB0(A3) CH3</td><td><code>htim3</code> PSC 83, ARR 999</td></tr>
  <tr><td>TIM4 PWM (부저)</td><td>PB6(D10) CH1</td><td><code>htim4</code> PSC 83 (1MHz)</td></tr>
  <tr><td>TIM5 µs 카운터</td><td>—</td><td><code>htim5</code> 1MHz 자유 카운트</td></tr>
  <tr><td>TIM11 주기 인터럽트</td><td>—</td><td><code>htim11</code> 10kHz, ARR 99 → 10ms</td></tr>
  <tr><td>I2C1</td><td>PB8(D15) SCL · PB9(D14) SDA</td><td><code>hi2c1</code> 100kHz</td></tr></tbody></table>`;
function renderPinTab() {
  const { missing } = wireCheck(); let h;
  if (cur.sandbox) h = `<p>위쪽 <b>부품 추가</b>로 원하는 부품을 넣고, 부품 몸체를 끌어 옮기세요. 오른쪽 위 ×로 삭제합니다.</p>` + pinRef();
  else if (!cur.wiring.length) h = `<p>이 레슨은 배선이 필요 없어요. 보드에 내장된 부품을 씁니다.</p>` + pinRef();
  else h = `<table class="stack"><thead><tr><th>부품 단자</th><th>보드 핀</th><th>상태</th></tr></thead><tbody>` +
    cur.wiring.map(w => { const ok = !missing.includes(w); const [ca, cb] = w[0].startsWith('B:') ? [w[1], w[0]] : w; return `<tr><td>${termName(ca)}</td><td>${termName(cb)}</td><td class="st ${ok ? 'ok' : 'no'}">${ok ? '연결' : '—'}</td></tr>`; }).join('') +
    `</tbody></table><p class="note">GND는 보드의 GND 핀 3개 중 아무거나 써도 돼요(보드 안에서 연결됨). 배선 힌트를 누르면 다음에 연결할 두 핀이 깜빡여요.</p>` + pinRef();
  $('#p-pin').innerHTML = h;
}
function renderSpec() {
  const row = r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`;
  $('#p-spec').innerHTML = (cur.spec ? `<h3 class="sub">이 레슨</h3><table><tbody>${cur.spec.map(row).join('')}</tbody></table>` : '') +
  `<h3 class="sub">STM32F401RE · NUCLEO-F401RE</h3><table><tbody>${[
    ['코어', 'Arm Cortex-M4 + FPU, 최대 84MHz'], ['메모리', 'Flash 512KB · SRAM 96KB'], ['ADC', '12bit 1개, 외부 16채널'],
    ['타이머', 'TIM1(고급) · TIM2/TIM5(32bit) · TIM3/TIM4 · TIM9~11'], ['통신', 'USART ×3 · I2C ×3 · SPI ×4 · USB OTG FS'], ['동작 전압', 'MCU 1.7~3.6V, 보드 I/O 3.3V'],
    ['디버거', 'ST-LINK/V2-1 내장 (드래그앤드롭 업로드, 가상 COM)'], ['커넥터', 'Arduino Uno V3 + ST morpho']].map(row).join('')}</tbody></table>
  <h3 class="sub">시뮬레이터 범위</h3><p class="note">GPIO, EXTI 인터럽트, SysTick(HAL_Delay/GetTick), USART2 송수신(폴링·인터럽트), ADC1 폴링, TIM PWM·엔코더·주기 인터럽트·µs 카운터, I2C(LCD·OLED 장치), DHT11 드라이버를 지원해요. DMA, SPI, RTC, 저전력 모드, 워치독은 아직 없어요. C 문법은 자주 쓰는 부분만 변환하며, 정수 나눗셈은 실수로 계산될 수 있어요.</p>
  <p class="note">참고: <a href="https://www.st.com/en/evaluation-tools/nucleo-f401re.html">ST NUCLEO-F401RE</a> · <a href="https://www.st.com/en/microcontrollers-microprocessors/stm32f401re.html">STM32F401RE 데이터시트</a> · <a href="https://github.com/afiskon/stm32-ssd1306">stm32-ssd1306 라이브러리</a></p>`;
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
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.isComposing) {
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
  for (const k in cs) delete cs[k];
  $('#lTitle').textContent = l.title; $('#lTag').textContent = `${l.sec} · ${l.tag}`;
  $('#ovBody').innerHTML = l.overview;
  $('#palette').hidden = !l.sandbox;
  ta.value = store.code[l.id] || l.code; syncGutter();
  renderLesson(); renderList(); renderGoal(); renderSpec();
  $('#info').innerHTML = l.sandbox ? '부품을 추가하고 원하는 대로 배선해보세요. 부품 몸체를 끌면 옮겨져요.' : l.wiring.length ? '핀(금색 단자)을 누른 뒤 연결할 다른 핀을 누르면 점퍼선이 꽂혀요. 선을 누르면 뽑히고, 부품 몸체를 끌면 옮겨져요.' : '이 레슨은 배선 없이 보드 내장 LED·버튼을 씁니다. 실행을 눌러보세요.';
  document.title = `${l.title} · STM32 실습실`;
  series.clear(); plotDirty = true; showView('mon'); scene.view('all');
  const cb = document.querySelector('#lessonList [aria-current=true]'); if (cb) cb.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
window.addEventListener('hashchange', () => openLesson(location.hash.slice(1)));

openLesson(location.hash.slice(1));
requestAnimationFrame(frame);
}
