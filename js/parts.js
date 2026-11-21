// 부품 라이브러리(전기적 동작 + 상태). 3D 모양은 scene3d.js가 그린다.
// 크기·좌표 단위는 mm, 단자 [이름, x, z]는 부품 중심 기준(앞쪽 +z).
// io: drive(t) gnd(t) volt(t) powered() edge(k,on) stats running sound(f) warn(k,msg) beep()
(function () {
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hi = (io, t) => { const d = io.drive(t); return d ? d.level : 0; };
const row = (names, z, x0 = 0, pitch = 2.54) => names.map((n, i) => [n, x0 + (i - (names.length - 1) / 2) * pitch, z]);
const NOTES = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시'];
const noteName = f => { if (!f) return ''; const n = Math.round(12 * Math.log2(f / 261.63)); return NOTES[((n % 12) + 12) % 12] + (4 + Math.floor(n / 12)); };
const SEG = { 0x3F: 0, 0x06: 1, 0x5B: 2, 0x4F: 3, 0x66: 4, 0x6D: 5, 0x7D: 6, 0x07: 7, 0x7F: 8, 0x6F: 9 };
const STEP_SEQ = [0b0001, 0b0011, 0b0010, 0b0110, 0b0100, 0b1100, 0b1000, 0b1001];

const P = {};

P.led = {
  label: 'LED', w: 16, d: 20, terms: row(['+', '-'], 7.5), status: false,
  init: () => ({ lv: 0, lit: false }),
  step(c, s, io) {
    s.lv = io.gnd('-') ? hi(io, '+') : 0;
    const lit = s.lv > .5; if (lit !== s.lit) { io.edge(c.id, lit); s.lit = lit; }
    if (io.running && s.lv > 0) (io.stats.ledLevels[c.id] = io.stats.ledLevels[c.id] || new Set()).add(Math.round(s.lv * 20));
  }
};

P.rgb = {
  label: 'RGB LED', w: 18, d: 20, terms: row(['R', 'G', 'B', '-'], 7.5),
  init: () => ({ r: 0, g: 0, b: 0 }),
  step(c, s, io) {
    const g = io.gnd('-');
    s.r = g ? hi(io, 'R') : 0; s.g = g ? hi(io, 'G') : 0; s.b = g ? hi(io, 'B') : 0;
    if (io.running && Math.max(s.r, s.g, s.b) > .05) io.stats.rgbColors.add(`${Math.round(s.r * 4)}${Math.round(s.g * 4)}${Math.round(s.b * 4)}`);
  }
};

P.button = {
  label: '버튼 모듈', w: 24, d: 20, terms: row(['S', '+', '-'], 7.5), pwr: ['+', '-'],
  init: () => ({ pressed: false }),
  out: (c, s, t, io) => t === 'S' && io.powered() ? (s.pressed ? 1 : 0) : null,
  step() {}
};

P.pot = {
  label: '가변저항', w: 24, d: 26, terms: row(['+', 'S', '-'], 9.5),
  init: () => ({ pos: .5, status: '' }),
  act: (s, dx, dy) => { s.pos = clamp(s.pos + (dx - dy) / 220, 0, 1); },
  analog(c, s, t, io) {
    if (t !== 'S') return null;
    const top = io.volt('+'), bot = io.volt('-');
    return top === null || bot === null ? null : bot + (top - bot) * s.pos;
  },
  step(c, s, io) {
    const top = io.volt('+'), bot = io.volt('-');
    s.status = top !== null && bot !== null ? `${(bot + (top - bot) * s.pos).toFixed(2)} V · 노브를 끌어 돌리기` : '노브를 끌어 돌리기';
  }
};

P.servo = {
  label: '서보 SG90', w: 33, d: 13, terms: row(['S', '+', '-'], 24), pwr: ['+', '-'],
  init: () => ({ angle: 90, status: '' }),
  step(c, s, io, dt) {
    let target = s.angle, note = '';
    if (!io.powered()) note = '전원 연결 안 됨';
    else { const d = io.drive('S'); if (d && d.pulse !== null && d.pulse >= 400) target = clamp((d.pulse - 500) / 2000 * 180, 0, 180); else if (io.running) note = '신호 없음'; }
    s.angle += (target - s.angle) * Math.min(1, dt * 7);
    s.status = note || `${Math.round(s.angle)}°`;
    if (io.running && !note) { io.stats.servoMin = Math.min(io.stats.servoMin, s.angle); io.stats.servoMax = Math.max(io.stats.servoMax, s.angle); }
  }
};

P.relay = {
  label: '릴레이 + 램프', w: 76, d: 26, terms: row(['S', '+', '-'], 10, -32), pwr: ['+', '-'],
  init: () => ({ on: false }),
  step(c, s, io) {
    const on = io.powered() && hi(io, 'S') > .5;
    if (on !== s.on) { s.on = on; if (io.running) io.stats.relayToggles++; }
  }
};

P.buzzer = {
  label: '수동 부저', w: 16, d: 20, terms: row(['+', '-'], 7.5),
  init: () => ({ f: 0, status: '' }),
  step(c, s, io) {
    let f = 0;
    if (io.gnd('-')) { const d = io.drive('+'); if (d && d.pwm && d.level > .02 && d.level < .98 && d.freq >= 30 && d.freq <= 12000) f = d.freq; }
    s.f = f; io.sound(f);
    s.status = f ? `${Math.round(f)} Hz ${noteName(f)}` : '소리 없음';
    if (io.running && f) io.stats.buzzFreqs.add(Math.round(f / 10));
  }
};

P.hcsr04 = {
  label: '초음파 HC-SR04', w: 45, d: 20, terms: row(['VCC', 'TRIG', 'ECHO', 'GND'], 8.5), pwr: ['VCC', 'GND'],
  init: () => ({ dist: 25, th: 0, es: -1, ee: -1, trig: false, status: '' }),
  act: (s, dx, dy) => { s.dist = clamp(s.dist - dy * 1.2 + dx * .3, 2, 300); },
  onWrite(c, s, io, now) {
    const t = io.powered() && hi(io, 'TRIG') > .5;
    if (t && !s.trig) s.th = now;
    if (!t && s.trig) { s.es = now + .45; s.ee = s.es + (s.dist > 400 ? 38 : s.dist * .0583); if (io.running) io.stats.pings++; }
    s.trig = t;
  },
  out: (c, s, t, io, now) => t === 'ECHO' && io.powered() ? (now >= s.es && now < s.ee ? 1 : 0) : null,
  step(c, s) { s.status = `물체 ${Math.round(s.dist)} cm · 빨간 블록을 끌어 조절`; }
};

P.dht11 = {
  label: '온습도 DHT11', w: 22, d: 26, terms: row(['+', 'DATA', '-'], 10.5, 0, 3.81), pwr: ['+', '-'],
  init: () => ({ t: 24, h: 55, status: '' }),
  act: (s, dx, dy) => { s.t = clamp(s.t - dy / 6, 0, 50); s.h = clamp(s.h + dx / 4, 20, 90); },
  step(c, s) { s.status = `${Math.round(s.t)}°C · ${Math.round(s.h)}% · 끌어서 온도↕ 습도↔`; }
};

P.seg7 = {
  label: '7세그먼트', w: 26, d: 26, terms: row(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp', 'COM'], 10.5),
  init: () => ({ segs: 0 }),
  step(c, s, io) {
    const g = io.gnd('COM'); let pat = 0;
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'].forEach((k, i) => { if (g && hi(io, k) > .5) pat |= 1 << i; });
    s.segs = pat;
    if (io.running && SEG[pat & 0x7F] !== undefined && (pat & 0x7F)) io.stats.digits.add(SEG[pat & 0x7F]);
    else if (io.running && (pat & 0x7F) === 0x3F) io.stats.digits.add(0);
  }
};

P.lcd = {
  label: 'LCD 16x2 (I2C)', w: 80, d: 36, terms: row(['GND', 'VCC', 'SDA', 'SCL'], 16, -28), pwr: ['VCC', 'GND'], i2c: 0x27,
  init: () => ({ lines: ['', ''], on: false }),
  step(c, s, io) { s.on = io.powered(); }
};

P.oled = {
  label: 'OLED 0.96" (I2C)', w: 27, d: 28, terms: row(['GND', 'VCC', 'SCL', 'SDA'], 11.5), pwr: ['VCC', 'GND'], i2c: 0x3C,
  init: () => ({ buf: null, ver: 0, on: false }),
  step(c, s, io) { s.on = io.powered(); }
};

P.dcmotor = {
  label: 'DC 모터 + L298N + 엔코더', w: 104, d: 46, pwr: ['+', '-'],
  terms: [...row(['ENA', 'IN1', 'IN2', '+', '-'], 21, -30, 4.2), ...row(['A', 'B'], 21, 34, 4.2)],
  init: () => ({ w: 0, pos: 0, load: 0, lt: performance.now(), status: '' }),
  act: (s, dx, dy) => { s.load = clamp(s.load + (dx - dy) / 250, 0, 1); },
  update(c, s, io, now) {
    let dt = (now - s.lt) / 1000; s.lt = now; if (dt <= 0) return; dt = Math.min(dt, .25);
    let V = 0;
    if (io.powered()) { const ena = hi(io, 'ENA'), a = hi(io, 'IN1') > .5, b = hi(io, 'IN2') > .5; V = (a && !b ? 1 : !a && b ? -1 : 0) * ena; }
    let target = V * 240;
    if (target) target = Math.sign(target) * Math.max(0, Math.abs(target) - s.load * 170);
    s.w += (target - s.w) * (1 - Math.exp(-dt / .15));
    s.pos += s.w / 60 * dt;
  },
  encoder: s => s.pos * 1320,
  out(c, s, t) { if (t !== 'A' && t !== 'B') return null; const ph = ((Math.floor(s.pos * 1320) % 4) + 4) % 4; return t === 'A' ? (ph === 1 || ph === 2 ? 1 : 0) : (ph >= 2 ? 1 : 0); },
  step(c, s, io, dt, now) {
    P.dcmotor.update(c, s, io, now);
    s.status = `${s.w.toFixed(0)} rpm · ${(s.pos * 360).toFixed(0)}° · 부하 ${Math.round(s.load * 100)}% (바퀴를 끌어 조절)`;
    const st = io.stats; if (!io.running) return;
    st.rpmMax = Math.max(st.rpmMax, Math.abs(s.w)); if (s.w < -20) st.rpmRev = true;
    st.hold = s.load >= .3 && Math.abs(s.w - 120) < 6 ? st.hold + dt : 0; st.holdMax = Math.max(st.holdMax, st.hold);
    st.posHold = Math.abs(s.pos * 360 - 360) < 5 && Math.abs(s.w) < 3 ? st.posHold + dt : 0; st.posHoldMax = Math.max(st.posHoldMax, st.posHold);
  }
};

P.stepper = {
  label: '스텝 모터 28BYJ-48 + ULN2003', w: 76, d: 36, pwr: ['+', '-'],
  terms: [...row(['IN1', 'IN2', 'IN3', 'IN4'], 16, -26, 3.2), ...row(['+', '-'], 16, -10, 3.2)],
  init: () => ({ steps: 0, idx: -1, lt: 0, coils: 0, status: '' }),
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
  step(c, s, io) {
    if (!io.powered()) s.coils = 0;
    const deg = s.steps * 360 / 4096;
    s.status = io.powered() ? `${deg.toFixed(1)}° · ${s.steps} 하프스텝` : '전원 연결 안 됨 (+ → 5V)';
    if (io.running) { io.stats.stepMin = Math.min(io.stats.stepMin, deg); io.stats.stepMax = Math.max(io.stats.stepMax, deg); }
  }
};

P.esc = {
  label: 'BLDC 모터 + ESC', w: 70, d: 46, terms: row(['S', '-'], 21, -22),
  init: () => ({ rpm: 0, armed: false, low: 0, lost: 0, ang: 0, status: '' }),
  step(c, s, io, dt, now) {
    let msg;
    if (!io.gnd('-')) { s.armed = false; msg = 'GND 연결 안 됨'; }
    else {
      const d = io.drive('S'); const p = d && d.pulse && d.freq > 30 && d.freq < 500 ? d.pulse : null;
      if (p === null) { if (!s.lost) s.lost = now; if (now - s.lost > 500) s.armed = false; msg = '신호 없음'; }
      else {
        s.lost = 0;
        if (!s.armed) {
          if (p <= 1080) { s.low = s.low || now; msg = '시동 중…'; if (now - s.low > 1500) { s.armed = true; io.beep(); } }
          else { s.low = 0; msg = '스로틀을 최저(1000µs)로 내려야 시동'; }
        }
        if (s.armed) { const tgt = clamp((p - 1080) / 860, 0, 1) * 9000; s.rpm += (tgt - s.rpm) * (1 - Math.exp(-dt / .35)); msg = `준비 완료 · ${Math.round(p)}µs`; }
      }
    }
    if (!s.armed) s.rpm += (0 - s.rpm) * (1 - Math.exp(-dt / .5));
    s.ang = (s.ang + Math.min(s.rpm, 900) * 6 * dt) % 360;
    s.status = `${Math.round(s.rpm)} rpm · ${s.armed ? 'ARMED' : 'DISARMED'} · ${msg}`;
    if (io.running) { io.stats.escMax = Math.max(io.stats.escMax, s.rpm); if (s.armed) io.stats.escArmed = true; }
  }
};

window.PARTS = P;
})();
