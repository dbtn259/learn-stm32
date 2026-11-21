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
  PA0: 'KEY 버튼 · ADC1_IN0 · TIM5_CH1', PA1: 'ADC1_IN1 · TIM2_CH2', PA2: 'USART2_TX · ADC1_IN2', PA3: 'USART2_RX · ADC1_IN3', PA4: 'ADC1_IN4 · SPI1_NSS', PA5: 'ADC1_IN5 · SPI1_SCK',
  PA6: 'TIM3_CH1 · ADC1_IN6 · SPI1_MISO', PA7: 'TIM3_CH2 · ADC1_IN7 · SPI1_MOSI', PA8: 'TIM1_CH1', PA9: 'TIM1_CH2 · USART1_TX', PA10: 'TIM1_CH3 · USART1_RX',
  PA11: 'USB D− (USB-C와 연결)', PA12: 'USB D+ (USB-C와 연결)', PA15: 'TIM2_CH1(엔코더 A) · SPI1_NSS', PB0: 'TIM3_CH3 · ADC1_IN8', PB1: 'TIM3_CH4 · ADC1_IN9', PB2: 'BOOT1',
  PB3: 'TIM2_CH2(엔코더 B) · SPI1_SCK', PB4: 'TIM3_CH1 · SPI1_MISO', PB5: 'TIM3_CH2 · SPI1_MOSI', PB6: 'TIM4_CH1 · I2C1_SCL', PB7: 'TIM4_CH2 · I2C1_SDA',
  PB8: 'I2C1_SCL · TIM4_CH3', PB9: 'I2C1_SDA · TIM4_CH4', PB10: 'TIM2_CH3 · I2C2_SCL', PB12: 'SPI2_NSS', PB13: 'SPI2_SCK', PB14: 'SPI2_MISO', PB15: 'SPI2_MOSI',
  PC13: '보드 LED (LOW일 때 켜짐)', PC14: 'OSC32_IN (32.768kHz)', PC15: 'OSC32_OUT (32.768kHz)',
  '3V3': '3.3V 출력', '3V3_2': '3.3V 출력', '5V': '5V (USB)', '5V_2': '5V (USB)', GND1: '접지', GND2: '접지'
};
const BP = Object.fromEntries(BOARD.map(p => [p.id, p]));

/* ---------- 상태 ---------- */
let cur = LESSONS[0], comps = [], wires = [], pending = null, nets = new Map(), members = new Map();
let rt = null, running = false, stats = null, hintTimer = 0, ld2Lit = false;
const press = { KEY: false, NRST: false, BOOT0: false };
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
  for (const [a, b] of [['B:GND1', 'B:GND2'], ['B:3V3', 'B:3V3_2'], ['B:5V', 'B:5V_2']]) if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b));
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
    if (p === 'PA0' && press.KEY) return 0;   // KEY: 누르면 PA0이 GND
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
    const on = ledOn() > .5; if (on !== ld2Lit) { ld2Lit = on; edge('ld2', on, t); }
  },
  onPwm: () => updateMotors(),
  encoder() {
    let r = null;
    eachPart((c, P, s, io) => {
      if (c.type !== 'dcmotor' || r !== null || !io.powered()) return;
      P.update(c, s, io, now());
      if (sameNet(c.id + ':A', 'B:PA15') && sameNet(c.id + ':B', 'B:PB3')) r = P.encoder(s);
      else if (sameNet(c.id + ':A', 'B:PB3') && sameNet(c.id + ':B', 'B:PA15')) r = -P.encoder(s);
    });
    if (r === null) { sysWarn('encw', '엔코더 A→A15, B→B3과 모터 전원 배선을 확인하세요.'); return 0; }
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

/* ---------- 보드 LED(C13, LOW일 때 켜짐) ---------- */
function ledOn() { const s = rt && rt.st.pins.PC13; return s && s.mode === 'out' && !s.out ? 1 : 0; }

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


/* ---------- 3D 작업대 ---------- */
const stage = $('#stage');
const scene = createScene(stage, {
  onTerm: id => {
    if (curView !== 'lesson') return;
    if (!pending) return setPending(id);
    if (pending === id) return setPending(null);
    if (!wires.some(([a, b]) => (a === pending && b === id) || (a === id && b === pending))) { wires.push([pending, id]); renderWires(); }
    setPending(null);
  },
  onWire: i => { if (curView !== 'lesson') return; wires.splice(i, 1); renderWires(); },
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
    if (id in press) press[id] = down;
    if (id === 'NRST') { if (down && rt) { serial('— RESET (NRST) —\n', 'sys'); run(); } return; }
    if (id === 'BOOT0') { if (down) toast('BOOT0: 누른 채로 리셋하면 USB 부트로더(DFU) 모드로 들어가요'); return; }
    if (id !== 'KEY' && cs[id]) cs[id].pressed = down;
    if (stats) { if (down) stats.presses++; stats.lastInput = now(); }
  },
  onAct: (id, dx, dy) => { const c = compOf(id); const P = c && PARTS[c.type]; if (P && P.act) P.act(cs[c.id], dx, dy); },
  onMove: (id, X, Z, end) => {
    const c = compOf(id); if (!c) return; c.X = X; c.Z = Z;
    if (!end) { scene.setWires(wires, wireColor); return; }
    if (curView !== 'lesson') return;
    if (cur.sandbox) saveSandbox(); else (store.pos[cur.id] = store.pos[cur.id] || {})[c.id] = [X, Z];
    save();
  },
  onDelete: id => { if (curView === 'lesson') removeComp(id); },
  onHotspot: key => showHotspot(key)
});
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => scene.view(b.dataset.view));
window.__lab = { scene };

function lessonComps(l) {
  if (l.sandbox) return (store.sandbox || []).map(c => ({ ...c }));
  const pos = store.pos[l.id] || {};
  return l.comps.map(c => {
    const P = PARTS[c.type];
    const X = (c.x - 410) * .2 + 40 + P.w / 2, Z = (c.y - 300) * .2 + P.d / 2;
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
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && curView === 'lesson') { e.preventDefault(); run(); }
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
function setStatus(k, t) { const s = $('#status'); s.className = 'pill ' + k; s.lastElementChild.textContent = t; }
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
  rt = null; running = false; setStatus('', '정지됨'); silence();
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
  const l2 = ledOn();
  if ((l2 > .5) !== ld2Lit) { ld2Lit = l2 > .5; edge('ld2', ld2Lit, t); }
  eachPart((c, P, s, io) => { try { P.step(c, s, io, dt, t); } catch (e) { console.error(e); } });
  if (stage.parentElement && stage.parentElement.offsetParent !== null) scene.render({ led: l2, press, parts: cs });
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
  let sec = '', h = '', num = 0;
  LESSONS.forEach(l => {
    if (l.sec !== sec) { sec = l.sec; h += `<li class="sec">${sec}</li>`; }
    if (!l.sandbox) num++;
    const d = store.done[l.id];
    h += `<li class="${d ? 'done' : ''}"><a href="#${l.id}"><span class="n">${d ? '✓' : l.sandbox ? '∞' : num}</span><span><b>${l.title}</b><small>${l.tag}</small></span></a></li>`;
  });
  $('#lessonList').innerHTML = h;
  const list = LESSONS.filter(l => !l.sandbox), n = list.filter(l => store.done[l.id]).length;
  const next = list.find(l => !store.done[l.id]) || list[list.length - 1];
  $('#progText').textContent = `${n}/${list.length}`;
  $('#progBar').style.width = (n / list.length * 100) + '%';
  $('#secName').textContent = next.sec;
  $('#nextCard').innerHTML = `<span class="num">${list.indexOf(next) + 1}</span><div><small>${n ? '이어서 학습' : '첫 레슨'} · ${next.sec}</small><b>${next.title}</b></div><a class="btn primary" href="#${next.id}">시작</a>`;
}
function renderGoal() {
  const g = $('#goal'); g.classList.toggle('done', !!store.done[cur.id]);
  g.hidden = !!cur.sandbox;
  g.lastElementChild.textContent = (store.done[cur.id] ? '완료 — ' : '목표 — ') + (cur.goal ? cur.goal.text : '');
}
const pinRef = () => `<h3 class="sub">이 실습실의 주변장치 핀 배정</h3><table class="stack"><thead><tr><th>기능</th><th>핀</th><th>핸들 · 설정</th></tr></thead><tbody>
  <tr><td>보드 LED / KEY</td><td>C13 / A0</td><td>LED는 LOW일 때 켜짐, KEY는 누르면 LOW</td></tr>
  <tr><td>USART2</td><td>A2 TX · A3 RX</td><td><code>huart2</code> 115200 8N1</td></tr>
  <tr><td>ADC1</td><td>A0~A7, B0, B1</td><td><code>hadc1</code> 기본 채널 1(A1)</td></tr>
  <tr><td>TIM1 PWM 50Hz</td><td>A8 CH1 · A9 CH2</td><td><code>htim1</code> PSC 99, ARR 19999</td></tr>
  <tr><td>TIM2 엔코더</td><td>A15 CH1 · B3 CH2</td><td><code>htim2</code> 32bit, 4체배</td></tr>
  <tr><td>TIM3 PWM 1kHz</td><td>A6 CH1 · A7 CH2 · B0 CH3 · B1 CH4</td><td><code>htim3</code> PSC 99, ARR 999</td></tr>
  <tr><td>TIM4 PWM (부저)</td><td>B6 CH1 · B7 CH2</td><td><code>htim4</code> PSC 99 (1MHz)</td></tr>
  <tr><td>TIM5 µs 카운터</td><td>—</td><td><code>htim5</code> 1MHz 자유 카운트</td></tr>
  <tr><td>TIM11 주기 인터럽트</td><td>—</td><td><code>htim11</code> 10kHz, ARR 99 → 10ms</td></tr>
  <tr><td>I2C1</td><td>B8 SCL · B9 SDA</td><td><code>hi2c1</code> 100kHz</td></tr></tbody></table>`;
function renderPinTab() {
  const { missing } = wireCheck(); let h;
  if (cur.sandbox) h = `<p>위쪽 <b>부품 추가</b>로 원하는 부품을 넣고, 부품 몸체를 끌어 옮기세요. 오른쪽 위 ×로 삭제합니다.</p>` + pinRef();
  else if (!cur.wiring.length) h = `<p>이 레슨은 배선이 필요 없어요. 보드에 내장된 부품을 씁니다.</p>` + pinRef();
  else h = `<table class="stack"><thead><tr><th>부품 단자</th><th>보드 핀</th><th>상태</th></tr></thead><tbody>` +
    cur.wiring.map(w => { const ok = !missing.includes(w); const [ca, cb] = w[0].startsWith('B:') ? [w[1], w[0]] : w; return `<tr><td>${termName(ca)}</td><td>${termName(cb)}</td><td class="st ${ok ? 'ok' : 'no'}">${ok ? '연결' : '—'}</td></tr>`; }).join('') +
    `</tbody></table><p class="note">G(GND) 핀 2개, 3.3·5V 핀 2개는 각각 보드 안에서 연결돼 있어 아무거나 써도 돼요. 배선 힌트를 누르면 다음에 연결할 두 핀이 깜빡여요.</p>` + pinRef();
  $('#p-pin').innerHTML = h;
}
const BOARD_SPEC = [
  ['MCU', 'STM32F411CEU6 (UFQFPN48)'], ['코어', 'Arm Cortex-M4 + FPU, 최대 100MHz'], ['메모리', 'Flash 512KB · SRAM 128KB'],
  ['ADC', '12bit 1개, 핀으로 나온 채널 10개 (A0~A7, B0, B1)'], ['타이머', 'TIM1(고급) · TIM2/TIM5(32bit) · TIM3/TIM4 · TIM9~11'],
  ['통신', 'USART ×3 · I2C ×3 · SPI ×5 · USB OTG FS'], ['클럭', 'HSE 25MHz · LSE 32.768kHz'], ['보드', 'USB-C, KEY(A0)·NRST·BOOT0 버튼, C13 LED, 3.3V LDO'],
  ['디버그', 'SWD 4핀 (3V3 · DIO · CLK · GND)'], ['크기', '약 53.3 × 20.8mm, 핀 간격 15.24mm(600mil)']
];
function renderSpec() {
  const row = r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`;
  $('#p-spec').innerHTML = (cur.spec ? `<h3 class="sub">이 레슨</h3><table><tbody>${cur.spec.map(row).join('')}</tbody></table>` : '') +
  `<h3 class="sub">STM32F411CEU6 · Black Pill</h3><table><tbody>${BOARD_SPEC.map(row).join('')}</tbody></table>
  <h3 class="sub">시뮬레이터 범위</h3><p class="note">GPIO, EXTI 인터럽트, SysTick(HAL_Delay/GetTick), USART2 송수신(폴링·인터럽트), ADC1 폴링, TIM PWM·엔코더·주기 인터럽트·µs 카운터, I2C(LCD·OLED 장치), DHT11 드라이버를 지원해요. DMA, SPI, RTC, 저전력 모드, 워치독은 아직 없어요. C 문법은 자주 쓰는 부분만 변환하며, 정수 나눗셈은 실수로 계산될 수 있어요.</p>
  <p class="note">참고: <a href="https://www.st.com/en/microcontrollers-microprocessors/stm32f411ce.html">ST STM32F411CE</a> · <a href="https://stm32-base.org/boards/STM32F411CEU6-WeAct-Black-Pill-V2.0">stm32-base Black Pill</a> · <a href="https://github.com/afiskon/stm32-ssd1306">stm32-ssd1306 라이브러리</a></p>`;
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
ta.addEventListener('input', () => { syncGutter(); clearTimeout(saveT); const id = cur.id, v = ta.value; store.code[id] = v; saveT = setTimeout(save, 300); });
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

/* ---------- 레슨 열기 ---------- */
function openLesson(l) {
  stop(true); stats = null; setPending(null);
  cur = l;
  for (const k in cs) delete cs[k];
  $('#lTitle').textContent = l.title;
  const idx = LESSONS.filter(x => !x.sandbox).indexOf(l);
  $('#lTag').textContent = `${l.sandbox ? '자유 실습' : '레슨 ' + (idx + 1)} · ${l.sec} · ${l.tag}`;
  $('#ovBody').innerHTML = l.overview;
  $('#palette').hidden = !l.sandbox;
  ta.value = store.code[l.id] || l.code; syncGutter();
  scene.setBoard(true); scene.setHotspots(false);
  renderLesson(); renderGoal(); renderSpec(); selectTab('ov');
  $('#info').innerHTML = l.sandbox ? '부품을 추가하고 원하는 대로 배선해보세요. 부품 몸체를 끌면 옮겨져요.' : l.wiring.length ? '금색 핀을 누른 뒤 연결할 다른 핀을 누르면 점퍼선이 꽂혀요. 선을 누르면 뽑히고, 부품 몸체를 끌면 옮겨져요.' : '이 레슨은 배선 없이 보드의 C13 LED·KEY 버튼을 씁니다. 실행을 눌러보세요.';
  document.title = `${l.title} · Learn STM32`;
  series.clear(); plotDirty = true; showView('mon'); scene.view('all');
}

/* ---------- 홈: 핫스팟 설명 ---------- */
const HS_INFO = {
  gpio: ['GPIO 핀', '#ff7a1a', '양쪽에 20개씩 모두 40핀이에요. 실크 인쇄의 A0·B5 같은 이름이 포트와 번호(PA0, PB5)예요. 대부분 5V를 견디는(FT) 핀이지만 ADC로 쓰는 핀에는 3.3V까지만 넣으세요.'],
  mcu: ['STM32F411CEU6', '#e8b04a', 'Arm Cortex-M4F 코어, 최대 100MHz, Flash 512KB, SRAM 128KB. 48핀 QFN 패키지가 45° 돌아간 채로 실장돼 있어요.'],
  usb: ['USB-C', '#5aa9ff', '전원(5V)과 MCU의 USB(PA11·PA12)가 함께 연결돼 있어요. BOOT0을 누른 채 리셋하면 USB DFU로 펌웨어를 올릴 수 있고, 코드로 USB 가상 COM(CDC)도 만들 수 있어요.'],
  led: ['C13 LED', '#3fd1a5', '파란 사용자 LED는 PC13에 연결돼 있고 LOW를 출력하면 켜져요. 옆의 빨간 LED는 전원 표시등이에요.'],
  key: ['KEY 버튼', '#ffcf5a', 'PA0에 연결된 사용자 버튼이에요. 누르면 PA0이 GND로 연결되므로 내부 풀업을 켜고 LOW를 눌림으로 읽어요.'],
  reset: ['NRST · BOOT0', '#c58cff', 'NRST는 MCU를 리셋해요. BOOT0을 누른 채 NRST를 눌렀다 떼면 내장 부트로더로 들어가 USB로 펌웨어를 올릴 수 있어요.'],
  xtal: ['25MHz 크리스털', '#d8cfc2', '외부 고속 클럭(HSE)이에요. PLL로 배수해 100MHz 시스템 클럭을 만들어요. 옆의 작은 부품은 RTC용 32.768kHz(LSE) 크리스털이에요.'],
  power: ['3V3 · G · 5V', '#ff5a4e', '양쪽 끝에 5V, G(GND), 3.3V 핀이 있어요. 센서는 보통 3.3V, 서보·릴레이·초음파는 5V에 연결해요. 3.3V 레귤레이터는 수백 mA까지만 낼 수 있어요.'],
  swd: ['SWD 디버그', '#8fd14f', '3V3·DIO(PA13)·CLK(PA14)·GND 4핀이에요. ST-LINK를 연결하면 펌웨어를 올리고 브레이크포인트로 디버깅할 수 있어요.']
};
function showHotspot(key) {
  const [t, c, p] = HS_INFO[key]; const sh = $('#hsSheet');
  sh.hidden = false; sh.style.setProperty('--c', c); sh.querySelector('i').style.background = c;
  sh.querySelector('h3').textContent = t; sh.querySelector('p').textContent = p;
}
$('#hsSheet .x').onclick = () => { $('#hsSheet').hidden = true; };

/* ---------- 부품 ---------- */
const PART_INFO = {
  led: ['저항이 내장된 5mm LED 모듈. +를 GPIO에, −를 G에 연결해요.', ['GPIO 출력', 'PWM 밝기']],
  rgb: ['공통 캐소드 RGB LED. R·G·B 세 핀을 PWM으로 섞어 색을 만들어요.', ['TIM3 PWM 3채널']],
  button: ['누르면 S가 HIGH가 되는 버튼 모듈(풀다운 내장).', ['GPIO 입력', 'EXTI']],
  pot: ['10kΩ 가변저항. 가운데 단자(S) 전압이 0~3.3V로 바뀌어 ADC로 읽어요.', ['ADC1']],
  buzzer: ['수동 부저. 넣어주는 PWM 주파수대로 음이 나요.', ['TIM4 PWM', '주파수 변경']],
  dht11: ['온도·습도 센서. 데이터선 하나로 40비트를 보내요.', ['단선 통신', '1초 간격']],
  seg7: ['공통 캐소드 7세그먼트. 세그먼트 a~g, dp를 각각 켜서 숫자를 표시해요.', ['GPIO 8개']],
  oled: ['128×64 단색 OLED(SSD1306), I2C 주소 0x3C.', ['I2C1', '프레임버퍼']],
  hcsr04: ['초음파 거리 센서. TRIG 10µs 펄스 → ECHO 펄스 폭으로 거리 계산.', ['5V', 'µs 타이머']],
  servo: ['SG90 서보. 50Hz 펄스 폭 0.5~2.5ms로 0~180° 각도를 정해요.', ['TIM1 PWM 50Hz', '5V']],
  relay: ['5V 릴레이 모듈과 램프. 작은 신호로 큰 전류를 켜고 꺼요.', ['GPIO 출력', '5V']],
  lcd: ['16×2 문자 LCD + PCF8574 I2C 백팩, 주소 0x27.', ['I2C1', '5V']],
  stepper: ['28BYJ-48 스텝 모터 + ULN2003 드라이버. 하프스텝 4096번에 1회전.', ['GPIO 4개', '5V']],
  dcmotor: ['L298N H-브리지 + 엔코더 기어드 DC 모터(1320카운트/회전). 바퀴를 끌면 부하가 걸려요.', ['TIM3 PWM', 'TIM2 엔코더', 'PID']],
  esc: ['BLDC 아웃러너 모터 + ESC. 서보처럼 50Hz 펄스(1000~2000µs)로 스로틀을 줘요.', ['TIM1 PWM 50Hz', '암(arming)']]
};
let curPart = 'dcmotor';
function renderParts() {
  $('#partGrid').innerHTML = Object.entries(PARTS).map(([k, P]) => `<button data-part="${k}" aria-pressed="${k === curPart}"><b>${P.label}</b><small>${P.terms.length}핀 · ${(PART_INFO[k] || ['', []])[1].join(' · ')}</small></button>`).join('');
  const P = PARTS[curPart], [desc, tags] = PART_INFO[curPart];
  const used = LESSONS.filter(l => l.comps.some(c => c.type === curPart));
  $('#partInfo').innerHTML = `<h3>${P.label}</h3><p>${desc}</p><p class="note">단자: ${P.terms.map(t => t[0] === '-' ? '−' : t[0]).join(' · ')}</p>` +
    (used.length ? `<p class="note">쓰는 레슨: ${used.map(l => `<a href="#${l.id}">${l.title}</a>`).join(' · ')}</p>` : '') +
    `<div class="tags">${tags.map(t => `<span>${t}</span>`).join('')}</div>`;
}
$('#partGrid').addEventListener('click', e => { const b = e.target.closest('[data-part]'); if (!b) return; curPart = b.dataset.part; renderParts(); showPartScene(); });
function showPartScene() {
  const P = PARTS[curPart];
  comps = [{ id: 'p1', type: curPart, name: P.label, color: 'red', X: 0, Z: 0 }];
  for (const k in cs) delete cs[k];
  cs.p1 = Object.assign(P.init(), { __t: curPart }); ios.p1 = makeIo(comps[0]);
  TERMS.clear(); for (const [t] of P.terms) TERMS.add('p1:' + t);
  scene.setBoard(false); scene.setHotspots(false); scene.setComps(comps, false); wires = []; rebuildNets(); scene.setWires([], wireColor);
  scene.view('all');
}

/* ---------- 참고 ---------- */
function renderRef() {
  const rows = (arr) => arr.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
  const hdr = side => BOARD.filter(p => p.side === side).map((p, i) => [i + 1, `<b>${p.lab}</b>`, p.kind === 'io' ? p.id : p.kind === 'pwr' ? '전원' : p.kind === 'gnd' ? '접지' : p.id === 'NRST' ? '리셋' : 'VBAT', AF[p.id] || '']);
  $('#refBody').innerHTML = `
  <div class="card"><h3>처음 사용하는 법</h3>
  <ol class="howto"><li><b>홈</b>에서 3D 보드를 돌려 보고, 동그란 라벨을 눌러 각 부품 설명을 읽어요.</li>
  <li><b>레슨</b> 탭에서 레슨을 고르고 맨 위 <b>목표</b>를 확인해요.</li>
  <li><b>핀맵</b> 탭을 보며 금색 핀 두 개를 차례로 눌러 점퍼선을 꽂아요. 막히면 <b>배선 힌트</b>.</li>
  <li><b>실행</b>을 누르고 3D 부품과 <b>시리얼 모니터</b>를 확인해요. 목표를 달성하면 완료!</li>
  <li><b>예제</b> 탭에서 코드를 고쳐 다시 실행해보고, 막히면 <b>예제로 되돌리기</b>.</li>
  <li>배운 걸 섞어 보고 싶으면 <b>자유 실습</b>에서 부품을 직접 꺼내 만들어요.</li></ol>
  <div class="edbar"><button class="btn primary" data-tour="home">홈 둘러보기 안내</button><button class="btn" data-tour="lesson">작업대 사용법 안내</button></div></div>
  <div class="card"><h3>조작법</h3><table><tbody>${rows([['이동', '왼쪽 드래그 · W A S D'], ['회전', '오른쪽 드래그 · Q / E · 아래 툴바 ↺ ↻'], ['확대', '마우스 휠 · R / F · 툴바 − +'], ['시점 초기화', '툴바 나침반'], ['배선', '핀을 누르고 다른 핀을 누르기 · 선을 누르면 제거 · Esc 취소'], ['부품', '몸체를 끌어 이동 · 노브·바퀴·블록은 끌어서 조절'], ['실행', '실행 버튼 · Ctrl+Enter'], ['모바일', '한 손가락 이동 · 두 손가락 확대·회전']])}</tbody></table></div>
  <div class="card"><h3>Black Pill 핀맵 — USB 쪽 줄 (B12 → 3.3)</h3><table class="stack"><thead><tr><th>#</th><th>표기</th><th>핀</th><th>주요 기능</th></tr></thead><tbody>${rows(hdr('N'))}</tbody></table></div>
  <div class="card"><h3>Black Pill 핀맵 — 반대쪽 줄 (5V → VB)</h3><table class="stack"><thead><tr><th>#</th><th>표기</th><th>핀</th><th>주요 기능</th></tr></thead><tbody>${rows(hdr('F'))}</tbody></table></div>
  <div class="card">${pinRef()}</div>
  <div class="card"><h3>자주 쓰는 HAL 함수</h3><table><tbody>${rows([
    ['<code>HAL_GPIO_WritePin(port, pin, state)</code>', '핀 출력'], ['<code>HAL_GPIO_ReadPin(port, pin)</code>', '핀 읽기'], ['<code>HAL_GPIO_TogglePin(port, pin)</code>', '출력 반전'],
    ['<code>HAL_Delay(ms)</code> · <code>HAL_GetTick()</code>', '지연 · 경과 시간'], ['<code>HAL_ADC_Start/PollForConversion/GetValue</code>', 'ADC 읽기'],
    ['<code>HAL_TIM_PWM_Start</code> · <code>__HAL_TIM_SET_COMPARE</code>', 'PWM 시작 · 듀티'], ['<code>HAL_TIM_Base_Start_IT</code>', '주기 인터럽트'],
    ['<code>HAL_TIM_Encoder_Start</code> · <code>__HAL_TIM_GET_COUNTER</code>', '엔코더'], ['<code>HAL_UART_Transmit</code> · <code>HAL_UART_Receive_IT</code>', 'UART 송수신'],
    ['<code>HAL_I2C_IsDeviceReady</code>', 'I2C 장치 확인'], ['<code>HAL_NVIC_EnableIRQ(IRQn)</code>', '인터럽트 켜기']])}</tbody></table></div>
  <div class="card"><h3>보드 사양</h3><table><tbody>${rows(BOARD_SPEC)}</tbody></table>
  <p class="note">참고 자료: <a href="https://www.st.com/en/microcontrollers-microprocessors/stm32f411ce.html">ST STM32F411CE</a> · <a href="https://stm32-base.org/boards/STM32F411CEU6-WeAct-Black-Pill-V2.0">stm32-base Black Pill</a> · <a href="https://github.com/dbtn259/learn-stm32">이 사이트 저장소</a></p></div>`;
}

/* ---------- 설정 ---------- */
function renderSettings() {
  const sw = (k, on) => `<button class="switch" role="switch" data-set="${k}" aria-checked="${!!on}"></button>`;
  $('#setBody').innerHTML = `
  <div class="setrow"><div><b>소리</b><small>부저·ESC 소리를 스피커로 내요</small></div>${sw('sound', store.sound)}</div>
  <div class="setrow"><div><b>고화질 그래픽</b><small>그림자·해상도를 높여요. 느리면 끄세요</small></div>${sw('hq', store.hq !== false)}</div>
  <div class="setrow"><div><b>사용법 안내 다시 보기</b><small>홈과 작업대 사용법을 단계별로 안내해요</small></div><button class="btn sm" data-tour="home">홈</button><button class="btn sm" data-tour="lesson">작업대</button></div>
  <div class="setrow"><div><b>진행 기록 지우기</b><small>완료한 레슨 표시를 모두 지워요</small></div><button class="btn sm" data-act="resetDone">지우기</button></div>
  <div class="setrow"><div><b>코드·배선 초기화</b><small>고친 코드, 꽂은 선, 옮긴 부품을 처음으로 돌려요</small></div><button class="btn sm" data-act="resetWork">초기화</button></div>`;
}
$('#setBody').addEventListener('click', e => {
  const s = e.target.closest('[data-set]'), a = e.target.closest('[data-act]');
  if (s) {
    const k = s.dataset.set; store[k] = !(k === 'hq' ? store.hq !== false : store[k]); save(); renderSettings();
    if (k === 'sound') { if (store.sound) audioInit(); else silence(); }
    if (k === 'hq') scene.quality(store.hq !== false);
  }
  if (a) {
    if (a.dataset.armed !== '1') { a.dataset.armed = '1'; a.textContent = '한 번 더 누르세요'; setTimeout(() => { a.dataset.armed = ''; renderSettings(); }, 3000); return; }
    if (a.dataset.act === 'resetDone') store.done = {};
    else { store.code = {}; store.wires = {}; store.pos = {}; store.sandbox = null; }
    save(); renderSettings(); renderList(); toast('초기화했어요');
  }
});

/* ---------- 라우팅 ---------- */
const VIEWERS = { home: '#homeViewer', lesson: '#lessonViewer', parts: '#partsViewer' };
let curView = '';
function route() {
  const h = location.hash.slice(1) || 'home';
  const lesson = LESSONS.find(l => l.id === h);
  const view = lesson ? 'lesson' : ['home', 'lessons', 'parts', 'ref', 'settings'].includes(h) ? h : 'home';
  if (curView === 'lesson' && (view !== 'lesson' || lesson !== cur)) stop(true);
  curView = view;
  if (tour) { tour = null; tourEl.hidden = true; }
  document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== 'v-' + view);
  document.querySelectorAll('.tabbar a').forEach(a => a.setAttribute('aria-current', a.dataset.nav === (view === 'lesson' ? 'lessons' : view) ? 'page' : 'false'));
  if (VIEWERS[view]) { $(VIEWERS[view]).append(stage); scene.mount(stage); }
  if (view === 'home') {
    comps = []; wires = []; TERMS.clear(); for (const p of BOARD_PINS) TERMS.add('B:' + p.id); rebuildNets();
    scene.setBoard(true); scene.setComps([], false); scene.setWires([], wireColor); scene.setHotspots(true); scene.view('home');
    document.title = 'Learn STM32'; maybeTour('home');
  } else if (view === 'parts') { renderParts(); showPartScene(); document.title = '부품 · Learn STM32'; }
  else if (view === 'lesson') { openLesson(lesson); maybeTour('lesson'); }
  else if (view === 'ref') { renderRef(); document.title = '참고 · Learn STM32'; }
  else if (view === 'settings') { renderSettings(); document.title = '설정 · Learn STM32'; }
  else document.title = '레슨 · Learn STM32';
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => {
  const k = b.dataset.cam;
  if (k === 'rl') scene.rotate(1); else if (k === 'rr') scene.rotate(-1); else if (k === 'zi') scene.zoom(.75); else if (k === 'zo') scene.zoom(1.33);
  else scene.view(curView === 'home' ? 'home' : 'all');
});

/* ---------- 사용법 튜토리얼(단계별 안내) ---------- */
const TOURS = {
  home: [
    { sel: '.hero', t: 'Learn STM32에 오신 걸 환영해요', p: 'STM32F411 Black Pill 보드를 3D로 살펴보고, 부품을 배선하고, HAL C 코드를 실행해보는 실습 사이트예요. 1분이면 사용법을 익힐 수 있어요.' },
    { sel: '#homeViewer', t: '3D 보드 살펴보기', p: '왼쪽 드래그로 이동, 오른쪽 드래그나 Q·E로 회전, 휠로 확대해요. 휴대폰은 한 손가락 이동, 두 손가락 확대·회전이에요.' },
    { sel: '#homeViewer .hs', t: '부품 설명 라벨', p: '보드 위 동그란 라벨을 누르면 그 부품이 무엇이고 어떻게 쓰는지 아래에 설명이 나와요.', fallback: '#homeViewer' },
    { sel: '#stage .vtools', t: '시점 툴바', p: '↺ ↻ 회전, − + 확대, 나침반은 처음 시점으로 돌아가요.' },
    { sel: '.stat', t: '진행률', p: '완료한 레슨 수와 지금 배우는 단원이 표시돼요. 기록은 이 브라우저에 저장돼요.' },
    { sel: '#nextCard', t: '레슨 시작', p: '시작을 누르면 다음에 할 레슨이 열려요. 레슨에 들어가면 작업대 사용법을 이어서 안내해요.' },
    { sel: '.tabbar', t: '메뉴', p: '레슨 목록, 부품 15종 3D 보기, 핀맵·HAL 함수 참고, 설정으로 이동해요. 이 안내는 참고 탭에서 다시 볼 수 있어요.' }
  ],
  lesson: [
    { sel: '#goal', t: '레슨 목표', p: '이 조건을 실행 중에 달성하면 레슨이 완료돼요.' },
    { sel: '#lessonViewer', t: '작업대와 배선', p: '금색 핀을 누른 뒤 연결할 다른 핀을 누르면 점퍼선이 꽂혀요. 선을 누르면 뽑히고, Esc로 선택을 취소해요. 부품 몸체는 끌어서 옮길 수 있어요.' },
    { sel: '.wirebar', t: '실행과 배선 도움', p: '실행을 누르면 예제 코드가 돌아가요. 배선 힌트는 다음에 꽂을 두 핀을 빨갛게 표시하고, 전선 지우기는 모든 선을 뽑아요.' },
    { sel: '.lside .tabs', t: '설명·핀맵·예제·사양', p: '개요에서 개념을 읽고, 핀맵에서 어디에 꽂을지 확인하세요. 예제 탭에서 코드를 직접 고치고 Ctrl+Enter로 실행할 수 있어요.' },
    { sel: '.serial', t: '시리얼 모니터', p: 'printf 출력과 경고·오류가 여기에 나와요. 플로터 탭은 "이름:값" 형식 출력을 그래프로 그리고, 아래 입력창으로 보드에 문자를 보낼 수 있어요.' },
    { sel: '#lessonViewer', t: '부품 조작', p: 'KEY·NRST 버튼과 버튼 모듈은 누르고 있으면 눌린 상태가 돼요. 가변저항 노브, 모터 바퀴, 초음파 앞 블록, 온습도 센서는 끌어서 값을 바꿔요.' }
  ]
};
const tourEl = document.createElement('div'); tourEl.className = 'tour'; tourEl.hidden = true;
tourEl.innerHTML = '<div class="tour-hole"></div><div class="tour-card" role="dialog" aria-live="polite"><small></small><h3></h3><p></p><div class="tour-btns"><button class="btn sm" data-t="skip">건너뛰기</button><span></span><button class="btn sm" data-t="prev">이전</button><button class="btn sm primary" data-t="next">다음</button></div></div>';
document.body.append(tourEl);
let tour = null;
function startTour(name) {
  if (!TOURS[name]) return;
  tour = { name, i: 0 }; tourEl.hidden = false; showStep();
}
function endTour(done) {
  if (!tour) return;
  (store.tours = store.tours || {})[tour.name] = true; save();
  tour = null; tourEl.hidden = true;
}
function showStep() {
  const steps = TOURS[tour.name], s = steps[tour.i];
  let el = document.querySelector(s.sel);
  if (!el || !el.offsetParent && el !== document.querySelector('.tabbar')) el = s.fallback ? document.querySelector(s.fallback) : null;
  if (!el) { tour.i < steps.length - 1 ? (tour.i++, showStep()) : endTour(true); return; }
  const r0 = el.getBoundingClientRect();
  if (r0.top < 0 || r0.bottom > innerHeight - 90) el.scrollIntoView({ block: 'center' });
  const card = tourEl.querySelector('.tour-card');
  card.querySelector('small').textContent = `${tour.i + 1} / ${steps.length}`;
  card.querySelector('h3').textContent = s.t; card.querySelector('p').textContent = s.p;
  card.querySelector('[data-t=prev]').hidden = tour.i === 0;
  card.querySelector('[data-t=next]').textContent = tour.i === steps.length - 1 ? '시작하기' : '다음';
  tour.el = el; requestAnimationFrame(placeTour);
}
function placeTour() {
  if (!tour) return;
  const r = tour.el.getBoundingClientRect(), pad = 8, hole = tourEl.querySelector('.tour-hole'), card = tourEl.querySelector('.tour-card');
  Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
  const cw = Math.min(360, innerWidth - 24), ch = card.offsetHeight;
  let top = r.bottom + 16; if (top + ch > innerHeight - 12) top = r.top - ch - 16; if (top < 12) top = Math.max(12, innerHeight - ch - 100);
  const left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), innerWidth - cw - 12);
  Object.assign(card.style, { width: cw + 'px', left: left + 'px', top: top + 'px' });
}
tourEl.addEventListener('click', e => {
  const b = e.target.closest('[data-t]'); if (!b || !tour) return;
  const n = TOURS[tour.name].length;
  if (b.dataset.t === 'skip') return endTour(false);
  if (b.dataset.t === 'prev') tour.i = Math.max(0, tour.i - 1);
  else { if (tour.i >= n - 1) return endTour(true); tour.i++; }
  showStep();
});
addEventListener('resize', () => tour && placeTour());
addEventListener('scroll', () => tour && placeTour(), { passive: true });
document.addEventListener('keydown', e => { if (!tour) return; if (e.key === 'Escape') endTour(false); if (e.key === 'ArrowRight' || e.key === 'Enter') tourEl.querySelector('[data-t=next]').click(); if (e.key === 'ArrowLeft') tourEl.querySelector('[data-t=prev]').click(); }, true);
const maybeTour = name => { if (!(store.tours || {})[name] && !tour) setTimeout(() => { if (!tour && curView === (name === 'lesson' ? 'lesson' : 'home')) startTour(name); }, 900); };
document.addEventListener('click', e => { const b = e.target.closest('[data-tour]'); if (!b) return; e.preventDefault(); const name = b.dataset.tour; if (name === 'lesson' && curView !== 'lesson') { location.hash = LESSONS[1].id; setTimeout(() => startTour('lesson'), 900); } else if (name === 'home' && curView !== 'home') { location.hash = 'home'; setTimeout(() => startTour('home'), 900); } else startTour(name); });

/* ---------- 시계 ---------- */
function tickClock() {
  const d = new Date();
  $('#clkDate').textContent = `${d.getMonth() + 1}월 ${d.getDate()}, ${d.getFullYear()}`;
  $('#clkTime').textContent = d.toTimeString().slice(0, 8);
}
setInterval(tickClock, 1000); tickClock();

scene.quality(store.hq !== false);
renderList();
route();
requestAnimationFrame(frame);
}
