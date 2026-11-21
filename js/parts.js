// 부품 라이브러리: 그리기, 단자, 전기적 동작, 물리 모델
// io: drive(term), gnd(term), volt(term), powered(), el(name), edge(key, on), stats, running, sound(f), warn(k,msg)
(function () {
const PCB = '#16324f', HDR = '#0b0d0f';
const hdr = (x, w, y = 78) => `<rect x="${x}" y="${y}" width="${w}" height="18" rx="2" fill="${HDR}"/>`;
const pcb = (w, h, col = PCB) => `<rect class="body" width="${w}" height="${h}" rx="8" fill="${col}"/>`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LED_COL = { red: '#ff3b30', green: '#22d160', yellow: '#ffc400', blue: '#2f8cff', white: '#f4f4f4' };
const NOTES = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시'];
const noteName = f => { if (!f) return ''; const n = Math.round(12 * Math.log2(f / 261.63)); return NOTES[((n % 12) + 12) % 12] + (4 + Math.floor(n / 12)); };
const SEG = { 0x3F: 0, 0x06: 1, 0x5B: 2, 0x4F: 3, 0x66: 4, 0x6D: 5, 0x7D: 6, 0x07: 7, 0x7F: 8, 0x6F: 9 };
const STEP_SEQ = [0b0001, 0b0011, 0b0010, 0b0110, 0b0100, 0b1100, 0b1000, 0b1001];
const hi = (io, t) => { const d = io.drive(t); return d ? d.level : 0; };

const P = {};

P.led = {
  label: 'LED', w: 80, h: 132, terms: [['+', 25, 104], ['-', 55, 104]], pwr: null,
  init: () => ({ lit: false }),
  draw: c => {
    const col = LED_COL[c.color || 'red'];
    return `<rect class="body" x="8" y="10" width="64" height="94" fill="transparent"/>
    <circle id="${c.id}-glow" cx="40" cy="40" r="52" fill="url(#glow)" style="color:${col}" opacity="0"/>
    <line x1="25" y1="64" x2="25" y2="100" stroke="#9aa3ab" stroke-width="3"/><line x1="55" y1="64" x2="55" y2="100" stroke="#9aa3ab" stroke-width="3"/>
    <rect x="14" y="58" width="52" height="7" rx="2" fill="${col}" opacity=".55"/>
    <path id="${c.id}-dome" class="body" d="M18 60V38a22 22 0 0 1 44 0v22z" fill="${col}" fill-opacity=".3" stroke="${col}" stroke-width="2"/>
    <path d="M27 40a13 13 0 0 1 10-14" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round" pointer-events="none"/>`;
  },
  frame(c, s, io) {
    const lv = io.gnd('-') ? hi(io, '+') : 0;
    io.el('glow').setAttribute('opacity', (lv * .95).toFixed(2));
    io.el('dome').setAttribute('fill-opacity', (.3 + .7 * lv).toFixed(2));
    const lit = lv > .5; if (lit !== s.lit) { io.edge(c.id, lit); s.lit = lit; }
    if (io.running && lv > 0) (io.stats.ledLevels[c.id] = io.stats.ledLevels[c.id] || new Set()).add(Math.round(lv * 20));
  }
};

P.rgb = {
  label: 'RGB LED', w: 110, h: 132, terms: [['R', 18, 104], ['G', 42, 104], ['B', 66, 104], ['-', 92, 104]],
  init: () => ({}),
  draw: c => `<rect class="body" x="10" y="0" width="90" height="100" fill="transparent"/>
    <circle id="${c.id}-glow" cx="55" cy="40" r="58" fill="url(#glow)" opacity="0"/>
    ${[18, 42, 66, 92].map((x, i) => `<line x1="${x}" y1="64" x2="${x}" y2="100" stroke="#9aa3ab" stroke-width="3"/>`).join('')}
    <path id="${c.id}-dome" class="body" d="M28 62V38a27 27 0 0 1 54 0v24z" fill="#eef1f4" stroke="#c4ccd3" stroke-width="2"/>`,
  frame(c, s, io) {
    const g = io.gnd('-');
    const r = g ? hi(io, 'R') : 0, gg = g ? hi(io, 'G') : 0, b = g ? hi(io, 'B') : 0;
    const col = `rgb(${Math.round(238 * (1 - Math.max(r, gg, b)) + 255 * r)},${Math.round(241 * (1 - Math.max(r, gg, b)) + 255 * gg)},${Math.round(244 * (1 - Math.max(r, gg, b)) + 255 * b)})`;
    io.el('dome').setAttribute('fill', col);
    const m = Math.max(r, gg, b); const ge = io.el('glow'); ge.setAttribute('opacity', (m * .9).toFixed(2));
    ge.style.color = `rgb(${255 * r | 0},${255 * gg | 0},${255 * b | 0})`;
    if (io.running && m > .05) io.stats.rgbColors.add(`${Math.round(r * 4)}${Math.round(gg * 4)}${Math.round(b * 4)}`);
  }
};

P.button = {
  label: '버튼 모듈', w: 110, h: 120, terms: [['S', 25, 87], ['+', 55, 87], ['-', 85, 87]], pwr: ['+', '-'],
  init: () => ({ pressed: false }),
  draw: c => pcb(110, 96) + `<rect x="33" y="10" width="44" height="44" rx="4" fill="#2b2f33"/>
    <circle cx="37" cy="14" r="2" fill="#777"/><circle cx="73" cy="14" r="2" fill="#777"/><circle cx="37" cy="50" r="2" fill="#777"/><circle cx="73" cy="50" r="2" fill="#777"/>
    <circle id="${c.id}-cap" class="act" data-act="press" data-comp="${c.id}" cx="55" cy="32" r="14" fill="#e9edf0" stroke="#9aa4ad" stroke-width="2"/>` + hdr(12, 86),
  out: (c, s, t, io) => t === 'S' && io.powered() ? (s.pressed ? 1 : 0) : null,
  frame(c, s, io) { io.el('cap').setAttribute('r', s.pressed ? 11 : 14); }
};

P.pot = {
  label: '가변저항', w: 110, h: 140, terms: [['+', 25, 87], ['S', 55, 87], ['-', 85, 87]],
  init: () => ({ pos: .5 }),
  draw: c => pcb(110, 96) + `<g class="act" data-act="knob" data-comp="${c.id}"><circle cx="55" cy="38" r="28" fill="#1d2226"/><circle cx="55" cy="38" r="23" fill="#39424b"/>
    <g id="${c.id}-knob"><line x1="55" y1="38" x2="55" y2="19" stroke="#fff" stroke-width="4" stroke-linecap="round"/></g></g>` + hdr(12, 86) +
    `<text id="${c.id}-val" class="val" x="55" y="134" text-anchor="middle"></text>`,
  act: (s, dx, dy) => { s.pos = clamp(s.pos + (dx - dy) / 220, 0, 1); },
  analog(c, s, t, io) {
    if (t !== 'S') return null;
    const top = io.volt('+'), bot = io.volt('-');
    if (top === null || bot === null) return null;
    return bot + (top - bot) * s.pos;
  },
  frame(c, s, io) {
    io.el('knob').setAttribute('transform', `rotate(${-135 + 270 * s.pos} 55 38)`);
    const top = io.volt('+'), bot = io.volt('-');
    io.el('val').textContent = top !== null && bot !== null ? `${(bot + (top - bot) * s.pos).toFixed(2)} V` : '노브를 끌어서 돌리세요';
  }
};

P.servo = {
  label: '서보 SG90', w: 150, h: 160, terms: [['S', 70, 108], ['+', 95, 108], ['-', 120, 108]], pwr: ['+', '-'],
  init: () => ({ angle: 90 }),
  draw: c => `<rect class="body" x="0" y="36" width="150" height="16" rx="4" fill="#2a63c4"/><rect class="body" x="12" y="18" width="126" height="58" rx="6" fill="#2f6fd6"/>
    <text x="108" y="52" fill="#fff" font-size="13" font-weight="700" text-anchor="middle" font-family="sans-serif" pointer-events="none">SG90</text>
    <path d="M85 76 C85 92 70 92 70 100" fill="none" stroke="#f28c28" stroke-width="4"/><path d="M95 76V100" stroke="#d63a2f" stroke-width="4"/><path d="M105 76C105 92 120 92 120 100" fill="none" stroke="#6b4428" stroke-width="4"/>
    <rect x="58" y="99" width="74" height="18" rx="2" fill="${HDR}"/><circle cx="45" cy="47" r="15" fill="#e6e9ec"/>
    <g id="${c.id}-arm"><rect x="38" y="-2" width="14" height="56" rx="7" fill="#f7f8f9" stroke="#b8c0c7" stroke-width="1.5"/><circle cx="45" cy="6" r="2.5" fill="#b8c0c7"/><circle cx="45" cy="18" r="2.5" fill="#b8c0c7"/></g>
    <circle cx="45" cy="47" r="4.5" fill="#8e979f"/><text id="${c.id}-val" class="val" x="95" y="154" text-anchor="middle"></text>`,
  frame(c, s, io, dt) {
    let target = s.angle, note = '';
    if (!io.powered()) note = '전원 연결 안 됨';
    else { const d = io.drive('S'); if (d && d.pulse !== null && d.pulse >= 400) target = clamp((d.pulse - 500) / 2000 * 180, 0, 180); else if (io.running) note = '신호 없음'; }
    s.angle += (target - s.angle) * Math.min(1, dt * 7);
    io.el('arm').setAttribute('transform', `rotate(${(s.angle - 90).toFixed(1)} 45 47)`);
    io.el('val').textContent = note || `${Math.round(s.angle)}°`;
    if (io.running && !note) { io.stats.servoMin = Math.min(io.stats.servoMin, s.angle); io.stats.servoMax = Math.max(io.stats.servoMax, s.angle); }
  }
};

P.relay = {
  label: '릴레이', w: 220, h: 120, terms: [['S', 25, 87], ['+', 55, 87], ['-', 85, 87]], pwr: ['+', '-'],
  init: () => ({ on: false }),
  draw: c => pcb(118, 96) + `<rect x="14" y="10" width="62" height="50" rx="3" fill="#1f6fd1"/><text x="45" y="32" fill="#fff" font-size="9" text-anchor="middle" font-family="sans-serif" pointer-events="none">SRD-05VDC</text>
    <text x="45" y="46" fill="#cfe1ff" font-size="8" text-anchor="middle" font-family="sans-serif" pointer-events="none">10A 250VAC</text>
    <circle id="${c.id}-ind" cx="98" cy="22" r="5" fill="#3b2020"/><rect x="86" y="40" width="26" height="22" rx="2" fill="#2c7a3a"/>
    <path d="M112 50 H150 M112 56 H140 V70" stroke="#c9a227" stroke-width="3" fill="none"/>` + hdr(12, 86) +
    `<circle id="${c.id}-glow" cx="180" cy="40" r="44" fill="url(#glow)" style="color:#ffd76a" opacity="0"/>
    <path d="M168 62h24v10h-24z" fill="#9aa3ab"/><circle id="${c.id}-bulb" cx="180" cy="40" r="22" fill="#f4f1e8" stroke="#c9c2ad" stroke-width="2"/>
    <path d="M172 46l4-10 4 8 4-8 4 10" fill="none" stroke="#b8a56a" stroke-width="1.5"/><text class="val" x="180" y="98" text-anchor="middle">램프</text>`,
  frame(c, s, io) {
    const on = io.powered() && hi(io, 'S') > .5;
    if (on !== s.on) { s.on = on; if (io.running) io.stats.relayToggles++; io.click && io.click(); }
    io.el('ind').setAttribute('fill', on ? '#ff3b30' : '#3b2020');
    io.el('glow').setAttribute('opacity', on ? .95 : 0); io.el('bulb').setAttribute('fill', on ? '#fff3c4' : '#f4f1e8');
  }
};

P.buzzer = {
  label: '부저(수동)', w: 90, h: 140, terms: [['+', 30, 104], ['-', 60, 104]],
  init: () => ({ f: 0 }),
  draw: c => `<g id="${c.id}-waves" opacity="0" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-linecap="round"><path d="M80 24a22 22 0 0 1 0 30"/><path d="M88 16a34 34 0 0 1 0 46"/><path d="M10 24a22 22 0 0 0 0 30"/><path d="M2 16a34 34 0 0 0 0 46"/></g>
    <circle class="body" cx="45" cy="39" r="30" fill="#17191b"/><circle cx="45" cy="39" r="24" fill="#222528"/><circle cx="45" cy="39" r="5" fill="#000"/>
    <line x1="30" y1="69" x2="30" y2="100" stroke="#9aa3ab" stroke-width="3"/><line x1="60" y1="69" x2="60" y2="100" stroke="#9aa3ab" stroke-width="3"/>
    <text id="${c.id}-val" class="val" x="45" y="138" text-anchor="middle"></text>`,
  frame(c, s, io) {
    let f = 0;
    if (io.gnd('-')) { const d = io.drive('+'); if (d && d.pwm && d.level > .02 && d.level < .98 && d.freq >= 30 && d.freq <= 12000) f = d.freq; }
    s.f = f; io.sound(f);
    io.el('waves').setAttribute('opacity', f ? .9 : 0);
    io.el('val').textContent = f ? `${Math.round(f)} Hz ${noteName(f)}` : '소리 없음';
    if (io.running && f) io.stats.buzzFreqs.add(Math.round(f / 10));
  }
};

P.hcsr04 = {
  label: '초음파 HC-SR04', w: 170, h: 150, terms: [['VCC', 40, 87], ['TRIG', 70, 87], ['ECHO', 100, 87], ['GND', 130, 87]], pwr: ['VCC', 'GND'],
  init: () => ({ dist: 25, th: 0, es: -1, ee: -1, trig: false }),
  draw: c => pcb(170, 96, '#1d5fa8') + `${[45, 125].map(x => `<circle cx="${x}" cy="38" r="27" fill="#c7cdd2"/><circle cx="${x}" cy="38" r="21" fill="#2a2d30"/><circle cx="${x}" cy="38" r="17" fill="none" stroke="#555" stroke-dasharray="2 2"/>`).join('')}
    <rect x="76" y="12" width="18" height="10" rx="2" fill="#c7cdd2"/>` + hdr(24, 122) +
    `<g class="act" data-act="slide" data-comp="${c.id}"><rect x="0" y="134" width="170" height="16" fill="transparent"/><line x1="8" y1="142" x2="162" y2="142" stroke="var(--line)" stroke-width="4" stroke-linecap="round"/>
    <rect id="${c.id}-obj" x="0" y="132" width="14" height="20" rx="3" fill="#e4572e"/></g><text id="${c.id}-val" class="val" x="85" y="172" text-anchor="middle"></text>`,
  act: (s, dx) => { s.dist = clamp(s.dist + dx * 1.6, 2, 300); },
  onWrite(c, s, io, now) {
    const t = io.powered() && hi(io, 'TRIG') > .5;
    if (t && !s.trig) s.th = now;
    if (!t && s.trig) { s.es = now + .45; s.ee = s.es + (s.dist > 400 ? 38 : s.dist * .0583); if (io.running) io.stats.pings++; }
    s.trig = t;
  },
  out: (c, s, t, io, now) => t === 'ECHO' && io.powered() ? (now >= s.es && now < s.ee ? 1 : 0) : null,
  frame(c, s, io) {
    io.el('obj').setAttribute('x', (8 + (s.dist - 2) / 298 * 140).toFixed(1));
    io.el('val').textContent = `물체 거리 ${Math.round(s.dist)} cm · 빨간 블록을 끌어 조절`;
  }
};

P.dht11 = {
  label: '온습도 DHT11', w: 120, h: 150, terms: [['+', 25, 87], ['DATA', 60, 87], ['-', 95, 87]], pwr: ['+', '-'],
  init: () => ({ t: 24, h: 55 }),
  draw: c => pcb(120, 96) + `<g class="act" data-act="xy" data-comp="${c.id}"><rect x="30" y="6" width="60" height="64" rx="4" fill="#5cb6e6"/>
    ${Array.from({ length: 12 }, (_, i) => `<rect x="${37 + (i % 4) * 12}" y="${14 + Math.floor(i / 4) * 16}" width="7" height="9" rx="1.5" fill="#2f7fae"/>`).join('')}</g>` + hdr(12, 96) +
    `<text id="${c.id}-val" class="val" x="60" y="134" text-anchor="middle"></text><text class="val" x="60" y="150" text-anchor="middle" font-size="11">센서를 끌면 온도(↕)·습도(↔)</text>`,
  act: (s, dx, dy) => { s.t = clamp(s.t - dy / 6, 0, 50); s.h = clamp(s.h + dx / 4, 20, 90); },
  frame(c, s, io) { io.el('val').textContent = `${Math.round(s.t)}°C · ${Math.round(s.h)}%`; }
};

P.seg7 = {
  label: '7세그먼트', w: 236, h: 140, terms: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp', 'COM'].map((t, i) => [t, 20 + i * 24, 116]),
  init: () => ({}),
  draw: c => {
    const S = { a: 'M78 8h40l-5 7h-30z', b: 'M121 11l5 6v34l-5 4-5-4V18z', c: 'M121 59l5 4v34l-5 6-5-6V63z', d: 'M78 104h40l-5-7h-30z', e: 'M75 59l5 4v34l-5 6-5-6V63z', f: 'M75 11l5 6v34l-5 4-5-4V18z', g: 'M80 57l5-4h26l5 4-5 4H85z' };
    return `<rect class="body" x="50" y="0" width="96" height="110" rx="4" fill="#1b1d1f"/>` +
      Object.entries(S).map(([k, d]) => `<path id="${c.id}-${k}" d="${d}" fill="#3a1d1d"/>`).join('') + `<circle id="${c.id}-dp" cx="132" cy="100" r="4" fill="#3a1d1d"/>` +
      `<rect x="6" y="104" width="226" height="22" rx="2" fill="${HDR}"/><text class="val" x="196" y="40" text-anchor="middle">공통</text><text class="val" x="196" y="56" text-anchor="middle">캐소드</text>`;
  },
  frame(c, s, io) {
    const g = io.gnd('COM'); let pat = 0;
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'].forEach((k, i) => { const on = g && hi(io, k) > .5; if (on && i < 7) pat |= 1 << i; io.el(k).setAttribute('fill', on ? '#ff3b30' : '#3a1d1d'); });
    if (io.running && SEG[pat] !== undefined) io.stats.digits.add(SEG[pat]);
  }
};

P.lcd = {
  label: 'LCD 16x2 (I2C)', w: 270, h: 140, terms: [['GND', 40, 112], ['VCC', 75, 112], ['SDA', 110, 112], ['SCL', 145, 112]], pwr: ['VCC', 'GND'], i2c: 0x27,
  init: () => ({ lines: ['', ''] }),
  draw: c => `<rect class="body" width="270" height="100" rx="6" fill="#1f7a3a"/><rect x="12" y="12" width="246" height="66" rx="3" fill="#111"/>
    <rect id="${c.id}-bl" x="18" y="18" width="234" height="54" fill="#3a4a1c"/>
    <text id="${c.id}-l0" x="24" y="40" class="lcd" xml:space="preserve"></text><text id="${c.id}-l1" x="24" y="64" class="lcd" xml:space="preserve"></text>
    <rect x="22" y="100" width="140" height="22" rx="2" fill="${HDR}"/><text class="val" x="215" y="118" text-anchor="middle">I2C 0x27</text>`,
  frame(c, s, io) {
    const p = io.powered();
    io.el('bl').setAttribute('fill', p ? '#9bc53d' : '#3a4a1c');
    io.el('l0').textContent = p ? s.lines[0] : ''; io.el('l1').textContent = p ? s.lines[1] : '';
  }
};

P.oled = {
  label: 'OLED 0.96" (I2C)', w: 150, h: 150, terms: [['GND', 30, 116], ['VCC', 60, 116], ['SCL', 90, 116], ['SDA', 120, 116]], pwr: ['VCC', 'GND'], i2c: 0x3C,
  init: () => ({ url: '' }),
  draw: c => `<rect class="body" width="150" height="104" rx="6" fill="#1d3557"/><rect x="8" y="16" width="134" height="72" rx="2" fill="#050608"/>
    <image id="${c.id}-img" x="11" y="20" width="128" height="64" style="image-rendering:pixelated"/>
    <rect x="16" y="104" width="118" height="22" rx="2" fill="${HDR}"/><text class="val" x="75" y="146" text-anchor="middle">I2C 0x3C · 128×64</text>`,
  frame(c, s, io) { if (!io.powered()) io.el('img').setAttribute('href', ''); else if (s.url) io.el('img').setAttribute('href', s.url); }
};

P.dcmotor = {
  label: 'DC 모터 + L298N + 엔코더', w: 290, h: 190,
  terms: [['ENA', 18, 140], ['IN1', 52, 140], ['IN2', 86, 140], ['+', 120, 140], ['-', 154, 140], ['A', 214, 140], ['B', 254, 140]], pwr: ['+', '-'],
  init: () => ({ w: 0, pos: 0, load: 0, lt: performance.now() }),
  draw: c => `<rect class="body" x="0" y="0" width="172" height="128" rx="6" fill="#b3202a"/>
    <g fill="#1b1d1f">${Array.from({ length: 7 }, (_, i) => `<rect x="${44 + i * 12}" y="8" width="8" height="54" rx="1"/>`).join('')}</g>
    <text x="86" y="84" fill="#fff" font-size="13" font-weight="800" text-anchor="middle" font-family="sans-serif" pointer-events="none">L298N</text>
    <text x="86" y="100" fill="#ffd9dc" font-size="10" text-anchor="middle" font-family="sans-serif" pointer-events="none">듀얼 H-브리지 드라이버</text>
    <rect x="4" y="128" width="166" height="22" rx="2" fill="${HDR}"/>
    <path d="M172 40 H196" stroke="#d63a2f" stroke-width="3"/><path d="M172 52 H196" stroke="#222" stroke-width="3"/>
    <rect class="body" x="194" y="22" width="90" height="48" rx="6" fill="#c9ced3"/><rect x="194" y="70" width="90" height="10" fill="#9aa3ab"/>
    <g class="act" data-act="load" data-comp="${c.id}"><circle cx="239" cy="46" r="40" fill="#25292d" opacity=".001"/><circle cx="239" cy="46" r="34" fill="#2b2f33"/><circle cx="239" cy="46" r="27" fill="#ffcc33"/>
    <g id="${c.id}-wheel">${[0, 60, 120].map(a => `<rect x="236" y="20" width="6" height="52" rx="3" fill="#b38a00" transform="rotate(${a} 239 46)"/>`).join('')}</g><circle cx="239" cy="46" r="6" fill="#555"/></g>
    <rect x="200" y="128" width="72" height="22" rx="2" fill="${HDR}"/><text class="val" x="236" y="124" text-anchor="middle" font-size="10">엔코더</text>
    <text id="${c.id}-val" class="val" x="145" y="186" text-anchor="middle"></text>`,
  act: (s, dx, dy) => { s.load = clamp(s.load + (dx - dy) / 250, 0, 1); },
  update(c, s, io, now) {
    let dt = (now - s.lt) / 1000; s.lt = now; if (dt <= 0) return; dt = Math.min(dt, .25);
    let V = 0;
    if (io.powered()) {
      const ena = hi(io, 'ENA'), a = hi(io, 'IN1') > .5, b = hi(io, 'IN2') > .5;
      V = (a && !b ? 1 : !a && b ? -1 : 0) * ena;
    }
    let target = V * 240;
    if (target) target = Math.sign(target) * Math.max(0, Math.abs(target) - s.load * 170);
    s.w += (target - s.w) * (1 - Math.exp(-dt / .15));
    s.pos += s.w / 60 * dt;
  },
  encoder: s => s.pos * 1320,
  out(c, s, t) { if (t !== 'A' && t !== 'B') return null; const ph = ((Math.floor(s.pos * 1320) % 4) + 4) % 4; return t === 'A' ? (ph === 1 || ph === 2 ? 1 : 0) : (ph >= 2 ? 1 : 0); },
  frame(c, s, io, dt, now) {
    P.dcmotor.update(c, s, io, now);
    io.el('wheel').setAttribute('transform', `rotate(${((s.pos * 360) % 360).toFixed(1)} 239 46)`);
    io.el('val').textContent = `${s.w.toFixed(0)} rpm · 위치 ${(s.pos * 360).toFixed(0)}° · 부하 ${Math.round(s.load * 100)}% (바퀴를 끌어 조절)`;
    const st = io.stats; if (!io.running) return;
    st.rpmMax = Math.max(st.rpmMax, Math.abs(s.w)); if (s.w < -20) st.rpmRev = true;
    st.hold = s.load >= .3 && Math.abs(s.w - 120) < 6 ? st.hold + dt : 0; st.holdMax = Math.max(st.holdMax, st.hold);
    st.posHold = Math.abs(s.pos * 360 - 360) < 5 && Math.abs(s.w) < 3 ? st.posHold + dt : 0; st.posHoldMax = Math.max(st.posHoldMax, st.posHold);
  }
};

P.stepper = {
  label: '스텝 모터 28BYJ-48 + ULN2003', w: 240, h: 175,
  terms: [['IN1', 18, 128], ['IN2', 46, 128], ['IN3', 74, 128], ['IN4', 102, 128], ['+', 150, 128], ['-', 190, 128]], pwr: ['+', '-'],
  init: () => ({ steps: 0, idx: -1, lt: 0, coils: 0 }),
  draw: c => `<rect class="body" width="124" height="116" rx="6" fill="#16653a"/><rect x="18" y="14" width="44" height="66" rx="2" fill="#111"/><text x="40" y="52" fill="#ccc" font-size="8" text-anchor="middle" transform="rotate(-90 40 50)" font-family="sans-serif" pointer-events="none">ULN2003</text>
    ${[0, 1, 2, 3].map(i => `<circle id="${c.id}-c${i}" cx="${80 + (i % 2) * 22}" cy="${24 + Math.floor(i / 2) * 22}" r="6" fill="#3b2020"/><text class="val" x="${80 + (i % 2) * 22}" y="${40 + Math.floor(i / 2) * 22}" font-size="9" text-anchor="middle" fill="#cfe">${'ABCD'[i]}</text>`).join('')}
    <rect x="4" y="116" width="116" height="22" rx="2" fill="${HDR}"/><rect x="136" y="116" width="68" height="22" rx="2" fill="${HDR}"/>
    <circle class="body" cx="185" cy="56" r="46" fill="#c9ced3"/><circle cx="185" cy="56" r="40" fill="#b5bcc2"/><circle cx="185" cy="40" r="10" fill="#e6c34a"/>
    <g id="${c.id}-shaft"><path d="M185 30 l7 10 h-14z" fill="#2b2f33" transform="translate(0 0)"/><line x1="185" y1="40" x2="185" y2="16" stroke="#2b2f33" stroke-width="4"/></g>
    <text id="${c.id}-val" class="val" x="120" y="170" text-anchor="middle"></text>`,
  onWrite(c, s, io, now) {
    if (!io.powered()) return;
    let pat = 0; ['IN1', 'IN2', 'IN3', 'IN4'].forEach((t, i) => { if (hi(io, t) > .5) pat |= 1 << i; });
    s.coils = pat;
    const idx = STEP_SEQ.indexOf(pat);
    if (idx < 0) return;
    if (s.idx >= 0 && idx !== s.idx) {
      const d = (idx - s.idx + 8) % 8;
      const mv = d === 1 ? 1 : d === 2 ? 2 : d === 7 ? -1 : d === 6 ? -2 : 0;
      if (now - s.lt < .6) io.warn('stepfast', '스텝 간격이 너무 짧아 모터가 따라가지 못해요(탈조). 하프스텝당 1ms 이상 기다리세요.');
      else s.steps += mv;
      s.lt = now;
    }
    s.idx = idx;
  },
  frame(c, s, io) {
    for (let i = 0; i < 4; i++) io.el('c' + i).setAttribute('fill', io.powered() && (s.coils >> i & 1) ? '#ff3b30' : '#3b2020');
    const deg = s.steps * 360 / 4096;
    io.el('shaft').setAttribute('transform', `rotate(${deg.toFixed(1)} 185 40)`);
    io.el('val').textContent = io.powered() ? `${deg.toFixed(1)}° · ${s.steps} 하프스텝` : '전원 연결 안 됨 (+ → 5V)';
    if (io.running) { io.stats.stepMin = Math.min(io.stats.stepMin, deg); io.stats.stepMax = Math.max(io.stats.stepMax, deg); }
  }
};

P.esc = {
  label: 'BLDC 모터 + ESC', w: 250, h: 175, terms: [['S', 30, 128], ['-', 60, 128]], pwr: null,
  init: () => ({ rpm: 0, armed: false, low: 0, lost: 0, ang: 0, msg: '' }),
  draw: c => `<rect class="body" x="0" y="20" width="100" height="62" rx="8" fill="#2b2f33"/><text x="50" y="48" fill="#fff" font-size="13" font-weight="800" text-anchor="middle" font-family="sans-serif" pointer-events="none">ESC 30A</text>
    <text id="${c.id}-st" x="50" y="66" fill="#9aa3ab" font-size="10" text-anchor="middle" font-family="sans-serif" pointer-events="none"></text>
    <path d="M100 40 H150 M100 51 H150 M100 62 H150" stroke-width="3" stroke="#d6a032"/><path d="M30 82 V116 M60 82 V116" stroke-width="3" stroke="#f28c28"/><path d="M60 82 V116" stroke-width="3" stroke="#6b4428"/>
    <rect x="14" y="116" width="62" height="22" rx="2" fill="${HDR}"/>
    <circle class="body" cx="196" cy="51" r="30" fill="#5b6168"/><circle cx="196" cy="51" r="22" fill="#7d858c"/>
    <circle id="${c.id}-blur" cx="196" cy="51" r="52" fill="#9aa3ab" opacity="0"/>
    <g id="${c.id}-prop"><path d="M196 51 C188 30 190 6 196 0 C202 6 204 30 196 51 C204 72 202 96 196 102 C190 96 188 72 196 51z" fill="#2f6fd6" opacity=".9"/></g><circle cx="196" cy="51" r="5" fill="#ddd"/>
    <text id="${c.id}-val" class="val" x="125" y="170" text-anchor="middle"></text>`,
  frame(c, s, io, dt, now) {
    let msg;
    if (!io.gnd('-')) { s.armed = false; s.rpm *= .9; msg = 'GND 연결 안 됨'; }
    else {
      const d = io.drive('S'); const p = d && d.pulse && d.freq > 30 && d.freq < 500 ? d.pulse : null;
      if (p === null) { if (!s.lost) s.lost = now; if (now - s.lost > 500) s.armed = false; msg = '신호 없음'; }
      else {
        s.lost = 0;
        if (!s.armed) {
          if (p <= 1080) { s.low = s.low || now; msg = '시동 중…'; if (now - s.low > 1500) { s.armed = true; io.beep && io.beep(); } }
          else { s.low = 0; msg = '스로틀을 최저(1000µs)로 내려야 시동'; }
        }
        if (s.armed) { const tgt = clamp((p - 1080) / 860, 0, 1) * 9000; s.rpm += (tgt - s.rpm) * (1 - Math.exp(-dt / .35)); msg = `준비 완료 · 펄스 ${Math.round(p)}µs`; }
      }
    }
    if (!s.armed) s.rpm += (0 - s.rpm) * (1 - Math.exp(-dt / .5));
    s.ang = (s.ang + Math.min(s.rpm, 700) * 6 * dt) % 360;
    io.el('prop').setAttribute('transform', `rotate(${s.ang.toFixed(1)} 196 51)`);
    io.el('blur').setAttribute('opacity', Math.min(.35, s.rpm / 9000).toFixed(2));
    io.el('st').textContent = s.armed ? 'ARMED' : 'DISARMED';
    io.el('val').textContent = `${Math.round(s.rpm)} rpm · ${msg}`;
    if (io.running) { io.stats.escMax = Math.max(io.stats.escMax, s.rpm); if (s.armed) io.stats.escArmed = true; }
  }
};

window.PARTS = P;
})();
