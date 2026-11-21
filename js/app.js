// STM32 실습실 UI: 보드/부품 렌더링, 배선, 실행, 레슨 진행
{
const $ = s => document.querySelector(s);
const LESSONS = window.LESSONS, PARTS = window.PARTS;
const { createRuntime, Stop } = window.STM;
const now = () => performance.now();

/* ---------- 저장소 ---------- */
const KEY = 'stm32lab:v2';
let store = { done: {}, code: {}, wires: {}, pos: {}, sandbox: null, sound: true };
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
  PA0: 'ADC1_IN0 · TIM2_CH1(엔코더 A)', PA1: 'ADC1_IN1 · TIM2_CH2(엔코더 B)', PA4: 'ADC1_IN4', PB0: 'ADC1_IN8 · TIM3_CH3', PC1: 'ADC1_IN11', PC0: 'ADC1_IN10',
  PB8: 'I2C1_SCL', PB9: 'I2C1_SDA', PA5: 'LD2 · SPI1_SCK', PA6: 'TIM3_CH1 · SPI1_MISO', PA7: 'TIM3_CH2 · SPI1_MOSI', PB6: 'TIM4_CH1 · I2C1_SCL',
  PC7: 'TIM3_CH2', PA9: 'TIM1_CH2 · USART1_TX', PA8: 'TIM1_CH1', PB10: 'TIM2_CH3 · I2C2_SCL', PB4: 'TIM3_CH1', PB5: 'TIM3_CH2',
  PB3: 'TIM2_CH2', PA10: 'USART1_RX', PA2: 'USART2_TX (가상 COM)', PA3: 'USART2_RX (가상 COM)',
  '3V3': '3.3V 전원 출력', '5V': '5V 전원 출력 (USB)', GND1: '접지', GND2: '접지', GND3: '접지', VIN: '외부 전원 입력 7~12V'
};
const BP = Object.fromEntries(BOARD_PINS.map(p => [p.id, p]));

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
  <g>${Array.from({ length: 12 }, (_, i) => `<rect x="${166 + i * 8}" y="316" width="3" height="8" fill="#9aa3ab"/><rect x="${166 + i * 8}" y="432" width="3" height="8" fill="#9aa3ab"/><rect x="152" y="${330 + i * 8}" width="8" height="3" fill="#9aa3ab"/><rect x="260" y="${330 + i * 8}" width="8" height="3" fill="#9aa3ab"/>`).join('')}</g>
  <rect x="160" y="324" width="100" height="108" rx="3" fill="#1b1d1f"/><circle cx="172" cy="336" r="3" fill="#3a3d40"/>
  <text x="210" y="374" text-anchor="middle" font-size="14" font-weight="800" fill="#fff" font-family="sans-serif">STM32</text>
  <text x="210" y="392" text-anchor="middle" font-size="10" fill="#bfc5ca" font-family="monospace">F401RET6</text>
  <rect x="190" y="470" width="40" height="16" rx="7" fill="#c8ced3" stroke="#9aa3ab"/><text x="210" y="502" text-anchor="middle" font-size="10" fill="#8b959e" font-family="sans-serif">X3 8MHz</text>
  <circle id="ld2glow" cx="243" cy="262" r="26" fill="url(#glow)" style="color:#22d160" opacity="0"/>
  <rect id="ld2" x="236" y="257" width="14" height="10" rx="2" fill="#cfe8d4" stroke="#8fb59a"/>
  <text x="243" y="284" text-anchor="middle" font-size="10" font-weight="700" fill="#6b7781" font-family="sans-serif">LD2</text>
  <rect x="94" y="560" width="34" height="34" rx="3" fill="#d6dbdf" stroke="#aab2b9"/><circle id="b1cap" class="act" data-act="press" data-comp="B1" cx="111" cy="577" r="11" fill="#2f6ad0" stroke="#1d4a99" stroke-width="2"/>
  <text x="111" y="612" text-anchor="middle" font-size="10" font-weight="700" fill="#6b7781" font-family="sans-serif">B1 USER</text>
  <rect x="174" y="560" width="34" height="34" rx="3" fill="#d6dbdf" stroke="#aab2b9"/><circle id="b2cap" class="act" data-act="press" data-comp="B2" cx="191" cy="577" r="11" fill="#1b1d1f" stroke="#000" stroke-width="2"/>
  <text x="191" y="612" text-anchor="middle" font-size="10" font-weight="700" fill="#6b7781" font-family="sans-serif">B2 RESET</text>`;
  for (const [x, y1, y2] of [[LX, 166, 296], [LX, 322, 478], [RX, 166, 400], [RX, 426, 634]]) s += `<rect x="${x - 12}" y="${y1}" width="24" height="${y2 - y1}" rx="2" fill="#151719"/>`;
  for (const p of BOARD_PINS) {
    const port = p.kind === 'io' ? p.id : '';
    s += p.x === LX
      ? `<text class="plabel" x="${p.x + 18}" y="${p.y + 4}">${p.lab}${port ? ` <tspan class="m">${port}</tspan>` : ''}</text>`
      : `<text class="plabel" x="${p.x - 18}" y="${p.y + 4}" text-anchor="end">${port ? `<tspan class="m">${port}</tspan> ` : ''}${p.lab}</text>`;
  }
  $('#gBoard').innerHTML = s;
}

/* ---------- 상태 ---------- */
let cur = LESSONS[0], comps = [], wires = [], pending = null, nets = new Map(), members = new Map();
let rt = null, running = false, stats = null, hintTimer = 0, b1 = false;
const cs = {}, ios = {};
const TERMS = new Map();
const dirOf = id => id.startsWith('B:') ? (BP[id.slice(2)].x === LX ? [-1, 0] : [1, 0]) : [0, 1];
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
  for (const id of TERMS.keys()) parent.set(id, id);
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
  onWrite() { const t = now(); updateMotors(); eachPart((c, P, s, io) => { if (P.onWrite) P.onWrite(c, s, io, t); }); },
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
  oledShow(buf) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
    const g = cv.getContext('2d'); const img = g.createImageData(128, 64);
    for (let i = 0; i < buf.length; i++) { const o = i * 4, on = buf[i]; img.data[o] = on ? 120 : 5; img.data[o + 1] = on ? 210 : 6; img.data[o + 2] = on ? 255 : 8; img.data[o + 3] = 255; }
    g.putImageData(img, 0, 0); const url = cv.toDataURL();
    eachPart((c, P, s) => { if (c.type === 'oled') s.url = url; });
    if (stats) stats.oledFrames++;
  },
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

/* ---------- 렌더링 ---------- */
function addTerm(id, x, y, label, isBoard) {
  return `<g class="term" data-id="${id}"><circle class="hit" cx="${x}" cy="${y}" r="12"/>
    <circle class="pad" cx="${x}" cy="${y}" r="${isBoard ? 6.5 : 7}" fill="${isBoard ? '#d6ad52' : '#c9d1d8'}" stroke="${isBoard ? '#6e5316' : '#4b5560'}" stroke-width="1.5"/>
    ${label ? `<text class="tlabel" x="${x}" y="${y + 25}" text-anchor="middle">${label}</text>` : ''}</g>`;
}
function lessonComps(l) {
  if (l.sandbox) return (store.sandbox || []).map(c => ({ ...c }));
  const pos = store.pos[l.id] || {};
  return l.comps.map(c => ({ ...c, name: c.name || PARTS[c.type].label, x: pos[c.id] ? pos[c.id][0] : c.x, y: pos[c.id] ? pos[c.id][1] : c.y }));
}
function renderLesson() {
  TERMS.clear();
  comps = lessonComps(cur);
  let terms = '';
  for (const p of BOARD_PINS) { TERMS.set('B:' + p.id, { x: p.x, y: p.y }); terms += addTerm('B:' + p.id, p.x, p.y, '', true); }
  let html = '';
  for (const c of comps) {
    const P = PARTS[c.type];
    if (!cs[c.id] || cs[c.id].__t !== c.type) cs[c.id] = Object.assign(P.init(), { __t: c.type });
    ios[c.id] = makeIo(c);
    const lab = `<text class="clabel" x="${P.w / 2}" y="-12" text-anchor="middle">${c.name}</text>`;
    const del = cur.sandbox ? `<g class="del" data-del="${c.id}"><circle cx="${P.w + 6}" cy="-16" r="11" fill="var(--panel)" stroke="var(--line)"/><path d="M${P.w + 1} -21l10 10m0-10l-10 10" stroke="var(--muted)" stroke-width="2"/></g>` : '';
    html += `<g data-cg="${c.id}" transform="translate(${c.x},${c.y})">${lab}${P.draw(c)}${del}</g>`;
    terms += `<g data-tg="${c.id}" transform="translate(${c.x},${c.y})">` + P.terms.map(([t, dx, dy]) => {
      TERMS.set(`${c.id}:${t}`, { x: c.x + dx, y: c.y + dy });
      return addTerm(`${c.id}:${t}`, dx, dy, t === '-' ? '−' : t);
    }).join('') + '</g>';
  }
  $('#gComps').innerHTML = html;
  $('#gTerms').innerHTML = terms;
  wires = (store.wires[cur.id] || []).filter(([a, b]) => TERMS.has(a) && TERMS.has(b));
  fitView();
  renderWires(true);
}
function fitView() {
  let w = 880, h = 670;
  for (const c of comps) { const P = PARTS[c.type]; w = Math.max(w, c.x + P.w + 40); h = Math.max(h, c.y + P.h + 30); }
  svg.setAttribute('viewBox', `0 0 ${Math.ceil(w)} ${Math.ceil(h)}`);
}
const WCOL = ['#f0a202', '#1d7fd6', '#16a34a', '#e4572e', '#0f9fb5', '#c2417a', '#7a5c2e'];
function wirePath(a, b) {
  const A = TERMS.get(a), B = TERMS.get(b), da = dirOf(a), db = dirOf(b);
  const k = Math.min(140, Math.max(50, Math.hypot(A.x - B.x, A.y - B.y) * .35));
  return `M${A.x} ${A.y}C${A.x + da[0] * k} ${A.y + da[1] * k} ${B.x + db[0] * k} ${B.y + db[1] * k} ${B.x} ${B.y}`;
}
function renderWires(noSave) {
  rebuildNets();
  let ci = 0;
  $('#gWires').innerHTML = wires.map(([a, b], i) => {
    const ends = a + ' ' + b;
    const col = /B:GND/.test(ends) ? 'var(--wire-gnd)' : /B:3V3|B:5V/.test(ends) ? '#d6332a' : WCOL[ci++ % WCOL.length];
    const d = wirePath(a, b);
    return `<path class="wirehit" data-i="${i}" d="${d}"/><path class="wire" d="${d}" stroke="${col}"/>`;
  }).join('');
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

/* ---------- 배선·부품 상호작용 ---------- */
const svg = $('#svg');
function svgPt(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function setPending(id) {
  document.querySelectorAll('.term.sel').forEach(t => t.classList.remove('sel'));
  pending = id;
  if (id) svg.querySelector(`.term[data-id="${CSS.escape(id)}"]`).classList.add('sel');
  else $('#rubber').setAttribute('d', '');
}
let moved = false;
svg.addEventListener('click', e => {
  if (moved) { moved = false; return; }
  const del = e.target.closest('.del');
  if (del) { removeComp(del.dataset.del); return; }
  const t = e.target.closest('.term');
  if (t) {
    const id = t.dataset.id;
    if (!pending) return setPending(id);
    if (pending === id) return setPending(null);
    if (!wires.some(([a, b]) => (a === pending && b === id) || (a === id && b === pending))) { wires.push([pending, id]); renderWires(); }
    return setPending(null);
  }
  const w = e.target.closest('.wirehit');
  if (w) { wires.splice(+w.dataset.i, 1); renderWires(); return; }
  if (!e.target.closest('.act')) setPending(null);
});
svg.addEventListener('pointermove', e => {
  const t = e.target.closest('.term');
  if (t) {
    const id = t.dataset.id; let txt = `<b>${termName(id)}</b>`;
    if (id.startsWith('B:')) {
      txt += ` · ${AF[id.slice(2)] || ''}`;
      const s = rt && rt.st.pins[id.slice(2)];
      if (s) txt += ` · ${({ out: '출력', in: '입력', an: '아날로그', af: '대체 기능', reset: '리셋', it_r: '인터럽트↑', it_f: '인터럽트↓', it_rf: '인터럽트↕' })[s.mode] || s.mode}${s.mode === 'out' ? (s.out ? ' HIGH' : ' LOW') : ''}`;
    }
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
  for (const id of [a, b]) svg.querySelector(`.term[data-id="${CSS.escape(id)}"]`)?.classList.add('hint');
  $('#info').innerHTML = `다음 연결: <b>${termName(a)}</b> ↔ <b>${termName(b)}</b>`;
  clearTimeout(hintTimer); hintTimer = setTimeout(() => document.querySelectorAll('.term.hint').forEach(t => t.classList.remove('hint')), 3000);
};

let drag = null;
svg.addEventListener('pointerdown', e => {
  const act = e.target.closest('.act');
  if (act) {
    const id = act.dataset.comp, kind = act.dataset.act; e.preventDefault(); svg.setPointerCapture(e.pointerId);
    if (kind === 'press') {
      if (id === 'B2') { act.setAttribute('r', 9); if (rt) { serial('— RESET (B2) —\n', 'sys'); run(); } drag = { press: 'B2' }; return; }
      if (id === 'B1') b1 = true; else cs[id].pressed = true;
      if (stats) { stats.presses++; stats.lastInput = now(); }
      drag = { press: id }; return;
    }
    drag = { act: id, x: e.clientX, y: e.clientY }; return;
  }
  const body = e.target.closest('.body'), g = e.target.closest('[data-cg]');
  if (body && g) { svg.setPointerCapture(e.pointerId); const c = compOf(g.dataset.cg); const p = svgPt(e); drag = { move: c, dx: p.x - c.x, dy: p.y - c.y, sx: e.clientX, sy: e.clientY }; moved = false; }
});
const release = () => {
  if (drag && drag.press) {
    if (drag.press === 'B1') b1 = false; else if (drag.press === 'B2') $('#b2cap').setAttribute('r', 11); else if (cs[drag.press]) cs[drag.press].pressed = false;
    if (stats) stats.lastInput = now();
  }
  if (drag && drag.move && moved) {
    const c = drag.move;
    if (cur.sandbox) store.sandbox = comps.map(({ id, type, name, color, x, y }) => ({ id, type, name, color, x, y }));
    else (store.pos[cur.id] = store.pos[cur.id] || {})[c.id] = [c.x, c.y];
    save(); fitView();
  }
  drag = null;
};
svg.addEventListener('pointerup', release); svg.addEventListener('pointercancel', release);
svg.addEventListener('pointermove', e => {
  if (!drag) return;
  if (drag.act) {
    const c = compOf(drag.act); const P = c && PARTS[c.type];
    if (P && P.act) P.act(cs[c.id], e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX; drag.y = e.clientY;
  } else if (drag.move) {
    if (!moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    moved = true;
    const c = drag.move, p = svgPt(e), P = PARTS[c.type];
    c.x = Math.round(Math.max(410, p.x - drag.dx)); c.y = Math.round(Math.max(30, p.y - drag.dy));
    svg.querySelector(`[data-cg="${c.id}"]`).setAttribute('transform', `translate(${c.x},${c.y})`);
    svg.querySelector(`[data-tg="${c.id}"]`).setAttribute('transform', `translate(${c.x},${c.y})`);
    for (const [t, dx, dy] of P.terms) TERMS.set(`${c.id}:${t}`, { x: c.x + dx, y: c.y + dy });
    renderWires(true);
  }
});
svg.addEventListener('wheel', e => {
  const k = e.target.closest('.act'); if (!k || k.dataset.act === 'press') return;
  const c = compOf(k.dataset.comp); if (!c || !PARTS[c.type].act) return;
  e.preventDefault(); PARTS[c.type].act(cs[c.id], -e.deltaY / 6, 0);
}, { passive: false });

/* ---------- 자유 실습 ---------- */
const pal = $('#partSel');
pal.innerHTML = Object.entries(PARTS).map(([k, P]) => `<option value="${k}">${P.label}</option>`).join('');
const saveSandbox = () => { store.sandbox = comps.map(({ id, type, name, color, x, y }) => ({ id, type, name, color, x, y })); save(); };
$('#addPart').onclick = () => {
  const type = pal.value, P = PARTS[type];
  let n = 1; while (comps.some(c => c.id === type + n)) n++;
  const id = type + n;
  comps.push({ id, type, name: `${P.label} ${n}`, color: type === 'led' ? ['red', 'green', 'yellow', 'blue', 'white'][(n - 1) % 5] : undefined, x: 440 + (comps.length % 3) * 170, y: 60 + Math.floor(comps.length / 3) * 200 });
  saveSandbox(); stop(true); renderLesson(); toast(`${P.label} 추가 — 코드에서는 배선한 핀으로 제어하세요`);
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
  eachPart((c, P, s) => { if ('lit' in s) s.lit = false; if (c.type === 'oled') s.url = ''; if (c.type === 'lcd') s.lines = ['', '']; if (c.type === 'stepper') s.idx = -1; if (c.type === 'dcmotor') s.lt = now(); });
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
let lastT = now(), ld2Lit = false;
function edge(key, on, t) {
  if (!stats || !running) return;
  if (key === 'ld2') stats.ld2Edges++; else stats.ledEdges[key] = (stats.ledEdges[key] || 0) + 1;
  if (t - stats.lastInput < 450) stats.reactive++;
}
function frame(t) {
  const dt = Math.min(.1, (t - lastT) / 1000); lastT = t;
  const d2 = rt && rt.drive('PA5'); const l2 = d2 ? d2.level : 0;
  $('#ld2glow').setAttribute('opacity', l2.toFixed(2));
  $('#ld2').setAttribute('fill', l2 > .05 ? '#5df08a' : '#cfe8d4');
  if ((l2 > .5) !== ld2Lit) { ld2Lit = l2 > .5; edge('ld2', ld2Lit, t); }
  $('#b1cap').setAttribute('r', b1 ? 9 : 11);
  eachPart((c, P, s, io) => { try { P.frame && P.frame(c, s, io, dt, t); } catch (e) { console.error(e); } });
  for (const p of BOARD_PINS) {
    if (p.kind !== 'io') continue;
    const d = rt && rt.drive(p.id);
    const pad = svg.querySelector(`.term[data-id="B:${p.id}"] .pad`);
    const v = d ? d.level : 0;
    pad.setAttribute('fill', v > 0 ? `color-mix(in srgb, #ffe04a ${Math.round(40 + 60 * v)}%, #d6ad52)` : '#d6ad52');
  }
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
  $('#info').innerHTML = l.sandbox ? '부품을 추가하고 원하는 대로 배선해보세요. 부품 몸체를 끌면 옮겨져요.' : l.wiring.length ? '핀을 누른 뒤 연결할 다른 핀을 누르면 전선이 생겨요. 전선을 누르면 지워지고, 부품 몸체를 끌면 옮겨져요.' : '이 레슨은 배선 없이 보드 내장 LED·버튼을 씁니다. 실행을 눌러보세요.';
  document.title = `${l.title} · STM32 실습실`;
  series.clear(); plotDirty = true; showView('mon');
  const cb = document.querySelector('#lessonList [aria-current=true]'); if (cb) cb.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
window.addEventListener('hashchange', () => openLesson(location.hash.slice(1)));

drawBoard();
openLesson(location.hash.slice(1));
requestAnimationFrame(frame);
}
