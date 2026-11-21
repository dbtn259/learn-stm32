// C(HAL) 부분집합 → JavaScript 변환기 + STM32F411 가상 주변장치
(function () {
'use strict';

/* ---------- 1. 변환기 ---------- */
const BASE_STRUCT = ['GPIO_InitTypeDef', 'ADC_ChannelConfTypeDef', 'TIM_OC_InitTypeDef', 'DHT11_Data', 'FontDef'];
const HANDLE_T = ['GPIO_TypeDef', 'TIM_HandleTypeDef', 'UART_HandleTypeDef', 'I2C_HandleTypeDef', 'ADC_HandleTypeDef'];
// 정수형 → 잘라내기 함수
const INT_T = [['uint8_t', '__u8'], ['uint16_t', '__u16'], ['uint32_t', '__u32'], ['uint64_t', '__s32'], ['int8_t', '__s8'], ['int16_t', '__s16'],
  ['int32_t', '__s32'], ['int64_t', '__s32'], ['size_t', '__u32'], ['unsigned\\s+long', '__u32'], ['unsigned\\s+int', '__u32'], ['unsigned\\s+char', '__u8'],
  ['unsigned\\s+short', '__u16'], ['unsigned', '__u32'], ['long\\s+long', '__s32'], ['long', '__s32'], ['short', '__s16'], ['char', '__s8'], ['bool', '__b'], ['int', '__s32'],
  ['GPIO_PinState', '__s32'], ['HAL_StatusTypeDef', '__s32'], ['SSD1306_COLOR', '__s32']];
const FLOAT_T = ['float', 'double'];
const MOD = '(?:(?:static|const|volatile|inline|extern|register)\\s+)*';
const PTR = '(?:\\s*\\*\\s*|\\s+)';
const KW = new Set(['if', 'while', 'for', 'switch', 'return', 'function', 'catch', 'typeof', 'await', 'do', 'else', 'case', 'async']);
const esc = s => s.replace(/\\\\s\+/g, ' ');

// 식 하나의 끝 찾기: 깊이 0에서 ; , 또는 닫는 괄호
function exprEnd(c, i) {
  let d = 0;
  for (; i < c.length; i++) {
    const ch = c[i];
    if (ch === '(' || ch === '[' || ch === '{') d++;
    else if (ch === ')' || ch === ']' || ch === '}') { if (d === 0) return i; d--; }
    else if ((ch === ';' || ch === ',') && d === 0) return i;
  }
  return i;
}
// 캐스트 뒤 피연산자 끝 찾기
function operandEnd(c, i) {
  while (/\s/.test(c[i] || '')) i++;
  if ('-+!~'.includes(c[i])) return operandEnd(c, i + 1);
  const close = j => { let d = 0; for (; j < c.length; j++) { if ('([{'.includes(c[j])) d++; else if (')]}'.includes(c[j])) { d--; if (!d) return j + 1; } } return j; };
  if (c[i] === '(') i = close(i);
  else { const m = /^[A-Za-z_]\w*|^\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|^0[xX][0-9a-fA-F]+/.exec(c.slice(i)); if (!m) return i; i += m[0].length; }
  for (;;) {
    const m = /^\s*(\.|\[|\()/.exec(c.slice(i)); if (!m) break;
    const j = i + m[0].length - 1;
    if (c[j] === '.') { const n = /^\.\s*[A-Za-z_]\w*/.exec(c.slice(j)); if (!n) break; i = j + n[0].length; }
    else i = close(j);
  }
  return i;
}

function transpile(src) {
  const lits = [];
  let code = src.replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, m => {
    if (m.startsWith('//')) return '';
    if (m.startsWith('/*')) return m.replace(/[^\n]/g, '');
    if (m[0] === "'") { let v = 0; try { v = String(new Function('return ' + m)()).charCodeAt(0) || 0; } catch (e) {} lits.push(String(v)); }
    else lits.push(m);
    return '__L' + (lits.length - 1) + '__';
  });
  if (/\(\s*\*\s*[A-Za-z_]\w*\s*\)|[;{}]\s*\*\s*[A-Za-z_]\w*\s*(?:=[^=]|\+\+|--|[-+*/]=)/.test(code))
    throw new SyntaxError('포인터 역참조(*p)는 이 실습실에서 지원하지 않아요. 값을 돌려받으려면 return이나 전역 변수·배열을 쓰세요');
  // 전처리기
  code = code
    .replace(/\\\n/g, ' ')
    .replace(/^[ \t]*#\s*include[^\n]*/gm, '')
    .replace(/^[ \t]*#\s*define[ \t]+([A-Za-z_]\w*)\(([^)]*)\)[ \t]+([^\n]+)/gm, 'const $1 = async ($2) => ($3);')
    .replace(/^[ \t]*#\s*define[ \t]+([A-Za-z_]\w*)[ \t]+([^\n]+)/gm, 'const $1 = $2;')
    .replace(/^[ \t]*#\s*define[ \t]+([A-Za-z_]\w*)[ \t]*$/gm, 'const $1 = 1;')
    .replace(/^[ \t]*#[^\n]*/gm, '');
  // enum → 상수, struct 정의 → 타입 등록
  const userStruct = [], userEnum = [];
  const enumConsts = body => { let v = -1; return body.split(',').map(s => s.trim()).filter(Boolean).map(s => { const m = s.match(/^([A-Za-z_]\w*)\s*(?:=\s*(.+))?$/); if (!m) return ''; v = m[2] !== undefined ? `(${m[2]})` : `(${v}) + 1`; const r = `const ${m[1]} = ${v};`; v = m[1]; return r; }).join(' '); };
  code = code
    .replace(/typedef\s+enum\s*\w*\s*\{([^}]*)\}\s*([A-Za-z_]\w*)\s*;/g, (m, b, n) => { userEnum.push(n); return enumConsts(b); })
    .replace(/\benum\s*(\w*)\s*\{([^}]*)\}\s*;/g, (m, n, b) => { if (n) userEnum.push(n); return enumConsts(b); })
    .replace(/typedef\s+struct\s*\w*\s*\{[^}]*\}\s*([A-Za-z_]\w*)\s*;/g, (m, n) => { userStruct.push(n); return ''; })
    .replace(/\bstruct\s+([A-Za-z_]\w*)\s*\{[^}]*\}\s*;/g, (m, n) => { userStruct.push(n); return ''; })
    .replace(/\b(?:struct|enum)\s+([A-Za-z_]\w*)/g, '$1');
  const STRUCT = [...BASE_STRUCT, ...userStruct];
  const INTS = [...INT_T, ...userEnum.map(n => [n, '__s32'])];
  const ALL = [...INTS.map(x => x[0]), ...FLOAT_T, ...STRUCT, ...HANDLE_T];
  const T = '(?:' + ALL.join('|') + ')', TV = '(?:' + ALL.join('|') + '|void)';
  const fnOf = t => { t = t.replace(/\s+/g, ' '); for (const [k, f] of INTS) if (new RegExp('^' + k + '$').test(t)) return f; return null; };
  const isStruct = t => STRUCT.includes(t);

  // 함수 안 static 변수 → 전역으로 끌어올림(이름 충돌 방지 위해 접미사)
  {
    const hoisted = []; let out = '', i = 0, n = 0;
    const re = new RegExp('(?:async\\s+function|' + TV + PTR + ')\\s*[A-Za-z_]\\w*\\s*\\([^)]*\\)\\s*\\{', 'g');
    let m;
    while ((m = re.exec(code))) {
      if (m.index < i) continue;
      let j = m.index + m[0].length, d = 1;
      while (j < code.length && d) { if (code[j] === '{') d++; else if (code[j] === '}') d--; j++; }
      let body = code.slice(m.index, j);
      const sre = new RegExp('\\bstatic\\s+(?:(?:const|volatile)\\s+)*(' + T + ')' + PTR + '([A-Za-z_]\\w*)([^;]*);', 'g');
      body = body.replace(sre, (s, t, name, rest) => { const nn = name + '__s' + (++n); hoisted.push(`${t} ${nn}${rest};`); return `\u0001${name}\u0002${nn}\u0003`; });
      body.replace(/\u0001(\w+)\u0002(\w+)\u0003/g, (s, a, b) => { body = body.replace(new RegExp('(?<![.\\w])' + a + '\\b', 'g'), b); });
      body = body.replace(/\u0001\w+\u0002\w+\u0003/g, '');
      out += code.slice(i, m.index) + body; i = j; re.lastIndex = j;
    }
    code = hoisted.join('\n') + '\n' + out + code.slice(i);
  }

  // 캐스트: 정수형은 잘라내기 함수로, 실수·포인터는 제거
  {
    const re = new RegExp('\\(\\s*(?:const\\s+)?(?:volatile\\s+)?(' + TV + ')\\s*(\\*)?\\s*\\)(?=\\s*[\\w(!~\\-+])', 'g');
    let m, guard = 0;
    while ((m = re.exec(code)) && guard++ < 5000) {
      const f = !m[2] && fnOf(m[1]);
      const s = m.index, e = m.index + m[0].length;
      if (f) { const oe = operandEnd(code, e); code = code.slice(0, s) + f + '(' + code.slice(e, oe) + ')' + code.slice(oe); }
      else code = code.slice(0, s) + code.slice(e);
      re.lastIndex = s;
    }
  }
  code = code
    .replace(/\b(0[xX][0-9a-fA-F]+)[uUlL]+\b/g, '$1')
    .replace(/\b(\d+(?:\.\d+)?)[uUlLfF]+\b/g, '$1')
    .replace(/->/g, '.')
    .replace(new RegExp('^[ \\t]*' + MOD + TV + PTR + '[A-Za-z_]\\w*\\s*\\([^;{)]*\\)\\s*;', 'gm'), '')
    .replace(new RegExp(MOD + TV + PTR + '([A-Za-z_]\\w*)\\s*\\(([^)]*)\\)\\s*\\{', 'g'), (m, name, params) => {
      const ps = params.split(',').map(p => p.trim()).filter(p => p && p !== 'void')
        .map(p => (p.match(/([A-Za-z_]\w*)\s*(?:\[\s*\w*\s*\])?$/) || [, '_'])[1]);
      return 'async function ' + name + '(' + ps.join(', ') + ') {';
    });

  // 변수 선언 다시 쓰기 + 정수 변수 기록
  const varType = {}, conflict = new Set();
  const note = (n, f) => { if (n in varType && varType[n] !== f) conflict.add(n); varType[n] = f; };
  {
    const re = new RegExp('(?<![\\w.])' + MOD + '(' + T + ')\\b(' + PTR + ')(?=[A-Za-z_])', 'g');
    let m, guard = 0;
    while ((m = re.exec(code)) && guard++ < 5000) {
      const t = m[1].replace(/\s+/g, ' '), ptr = m[2].includes('*');
      const start = m.index, dStart = m.index + m[0].length, end = exprEndStmt(code, dStart);
      const decls = splitTop(code.slice(dStart, end)).map(d => {
        const dm = d.match(/^\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\])*)\s*(?:=\s*([\s\S]*))?$/);
        if (!dm) return d;
        const [, name, arr, init] = dm; const f = fnOf(t);
        if (arr) {
          const size = (arr.match(/\[([^\]]*)\]/) || [])[1];
          if (init !== undefined) {
            const v = init.trim();
            if (v.startsWith('{')) return `${name} = [${v.slice(1, -1)}]`;
            return `${name} = ${v}`;
          }
          if (t === 'char' || t === 'unsigned char' && false) return `${name} = ""`;
          if (isStruct(t)) return `${name} = Array.from({ length: ${size || 0} }, () => ({}))`;
          return `${name} = new Array(${size || 0}).fill(0)`;
        }
        if (ptr) { note(name, null); return init !== undefined ? `${name} = ${init}` : `${name} = ${t === 'char' ? '""' : 'null'}`; }
        if (isStruct(t) || HANDLE_T.includes(t)) { note(name, null); if (init === undefined || /^\s*\{/.test(init)) return `${name} = {}`; return `${name} = __cp(${init})`; }
        if (f) { note(name, f); return init !== undefined ? `${name} = ${f}(${init})` : `${name} = 0`; }
        note(name, null); return init !== undefined ? `${name} = ${init}` : `${name} = 0`;
      });
      const rep = 'let ' + decls.join(', ');
      code = code.slice(0, start) + rep + code.slice(end);
      re.lastIndex = start + rep.length;
    }
  }
  code = code
    .replace(/([(,=!?:]\s*)&(?=[A-Za-z_])/g, '$1')
    .replace(/\b(sprintf|snprintf)\s*\(\s*([A-Za-z_]\w*)\s*,/g, '$2 = $1(');

  // 정수 변수에 대입할 때 잘라내기
  {
    const names = Object.keys(varType).filter(n => varType[n] && !conflict.has(n));
    if (names.length) {
      const re = new RegExp('(?<![\\w.\\]])(' + names.join('|') + ')\\s*(\\+|-|\\*|\\/|%|<<|>>|&|\\||\\^)?=(?!=)', 'g');
      let m, guard = 0;
      while ((m = re.exec(code)) && guard++ < 20000) {
        const before = code.slice(Math.max(0, m.index - 4), m.index);
        if (/let\s$/.test(before)) continue;
        const prev = code.slice(0, m.index).trimEnd().slice(-1);
        if ('=!<>'.includes(prev) && prev) { /* 비교식 일부 */ }
        const s = m.index + m[0].length, e = exprEnd(code, s);
        const rhs = code.slice(s, e), f = varType[m[1]];
        const rep = `${m[1]} = ${f}(${m[2] ? `${m[1]} ${m[2]} (${rhs})` : rhs})`;
        code = code.slice(0, m.index) + rep + code.slice(e);
        re.lastIndex = m.index + rep.length;
      }
    }
  }
  code = insertTicks(code);
  code = code.replace(/(?<![\w$.])(?<!function\s+)(?<!new\s+)([A-Za-z_]\w*)\s*\(/g, (m, n) => KW.has(n) ? m : 'await ' + m);
  code = code.replace(/__L(\d+)__/g, (m, i) => lits[+i]);
  return { js: code };
}
// 선언문 끝: 깊이 0의 ; 또는 깊이 -1의 )
function exprEndStmt(c, i) {
  let d = 0;
  for (; i < c.length; i++) {
    const ch = c[i];
    if ('([{'.includes(ch)) d++;
    else if (')]}'.includes(ch)) { if (d === 0) return i; d--; }
    else if (ch === ';' && d === 0) return i;
  }
  return i;
}
function splitTop(s) {
  const r = []; let d = 0, last = 0;
  for (let i = 0; i < s.length; i++) { const ch = s[i]; if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--; else if (ch === ',' && d === 0) { r.push(s.slice(last, i)); last = i + 1; } }
  r.push(s.slice(last)); return r;
}

function insertTicks(c) {
  const edits = [];
  const re = /\b(while|for)\s*\(|\bdo\s*\{/g;
  let m;
  while ((m = re.exec(c))) {
    if (m[0].startsWith('do')) { edits.push([m.index + m[0].length, 0, ' await __tick();']); continue; }
    let i = m.index + m[0].length, depth = 1;
    while (i < c.length && depth) { if (c[i] === '(') depth++; else if (c[i] === ')') depth--; i++; }
    let j = i; while (/\s/.test(c[j] || '')) j++;
    if (c[j] === '{') { edits.push([j + 1, 0, ' await __tick();']); continue; }
    if (c[j] === ';') {
      if (m[1] === 'while') { let k = m.index - 1; while (k >= 0 && /\s/.test(c[k])) k--; if (c[k] === '}') continue; }  // do { } while(); 의 끝
      edits.push([j, 1, '{ await __tick(); }']); continue;
    }
    // 중괄호 없는 한 줄 본문: 단순 문장이면 블록으로 감싸 양보 지점을 넣는다
    if (/^(if|for|while|switch|do|else)\b/.test(c.slice(j))) continue;
    const e = exprEnd(c, j);
    if (c[e] === ';') { edits.push([e + 1, 0, ' }']); edits.push([j, 0, '{ await __tick(); ']); }
  }
  edits.sort((a, b) => b[0] - a[0]);
  for (const [p, d, t] of edits) c = c.slice(0, p) + t + c.slice(p + d);
  return c;
}

/* ---------- 2. printf ---------- */
function cfmt(fmt, args) {
  let ai = 0;
  return String(fmt).replace(/%([-0+ ]*)(\d*)(?:\.(\d+))?(?:hh|h|ll|l|z)?([diuxXfcsp%])/g, (m, fl, w, pr, t) => {
    if (t === '%') return '%';
    const v = args[ai++]; let s;
    switch (t) {
      case 'd': case 'i': s = String(Math.trunc(Number(v) || 0)); break;
      case 'u': s = String(Math.trunc(Number(v) || 0) >>> 0); break;
      case 'x': s = (Math.trunc(Number(v) || 0) >>> 0).toString(16); break;
      case 'X': s = (Math.trunc(Number(v) || 0) >>> 0).toString(16).toUpperCase(); break;
      case 'f': s = (Number(v) || 0).toFixed(pr === undefined ? 6 : +pr); break;
      case 'c': s = typeof v === 'number' ? String.fromCharCode(v) : String(v ?? ''); break;
      case 'p': s = '0x20000000'; break;
      default: s = Array.isArray(v) ? v.map(x => String.fromCharCode(x)).join('').replace(/\0.*$/, '') : String(v ?? '');
    }
    const width = +w || 0;
    if (s.length < width) {
      if (fl.includes('-')) s = s.padEnd(width);
      else if (fl.includes('0') && t !== 's') s = (s[0] === '-' ? '-' + s.slice(1).padStart(width - 1, '0') : s.padStart(width, '0'));
      else s = s.padStart(width);
    }
    return s;
  });
}
const toStr = b => Array.isArray(b) ? b.map(x => typeof x === 'number' ? String.fromCharCode(x) : String(x)).join('').replace(/\0[\s\S]*$/, '') : String(b ?? '');

/* ---------- 3. 빠른 양보(setTimeout 4ms 제한 회피) ---------- */
const mc = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const waiters = [];
if (mc) mc.port1.onmessage = () => { const w = waiters.shift(); w && w(); };
const yieldNow = () => new Promise(r => { if (mc) { waiters.push(r); mc.port2.postMessage(0); } else setTimeout(r, 0); });

/* ---------- 4. 가상 MCU ---------- */
class Stop extends Error {}
const CLK = 100e6;   // STM32F411 @100MHz, 타이머 클럭 100MHz

function createRuntime(hw) {
  const now = () => performance.now();
  const st = { clk: {}, pins: {}, pwm: {}, adc: { ready: false, ch: 0 }, uart: false, i2c: false, stopped: false, t0: now(),
    nvic: {}, isr: {}, rxq: [], rxIT: null, q: [], busy: false, lcd: null, fb: null };
  const warned = new Set();
  const warn = (k, msg) => { if (!warned.has(k)) { warned.add(k); hw.onWarn(msg); } };
  const check = () => { if (st.stopped) throw new Stop(); };
  let lastYield = now();

  const api = {};
  for (let i = 0; i < 16; i++) api['GPIO_PIN_' + i] = 1 << i;
  const TIMX = {}; for (const n of [1, 2, 3, 4, 5, 9, 10, 11]) TIMX[n] = api['TIM' + n] = { n: 'TIM' + n };
  const mkTim = (n, psc, arr, map, extra) => Object.assign({ name: 'TIM' + n, Instance: TIMX[n], psc, arr, map, ccr: {}, t0: now(), off: 0, it: false, started: false,
    get tick() { return CLK / (this.psc + 1); } }, extra || {});
  Object.assign(api, {
    GPIO_PIN_All: 0xFFFF, GPIOA: { n: 'A' }, GPIOB: { n: 'B' }, GPIOC: { n: 'C' }, GPIOD: { n: 'D' }, GPIOH: { n: 'H' },
    GPIO_MODE_INPUT: 'in', GPIO_MODE_OUTPUT_PP: 'out', GPIO_MODE_OUTPUT_OD: 'out', GPIO_MODE_AF_PP: 'af', GPIO_MODE_AF_OD: 'af',
    GPIO_MODE_ANALOG: 'an', GPIO_MODE_IT_RISING: 'it_r', GPIO_MODE_IT_FALLING: 'it_f', GPIO_MODE_IT_RISING_FALLING: 'it_rf',
    GPIO_NOPULL: 0, GPIO_PULLUP: 1, GPIO_PULLDOWN: 2,
    GPIO_SPEED_FREQ_LOW: 0, GPIO_SPEED_FREQ_MEDIUM: 1, GPIO_SPEED_FREQ_HIGH: 2, GPIO_SPEED_FREQ_VERY_HIGH: 3,
    GPIO_PIN_SET: 1, GPIO_PIN_RESET: 0, SET: 1, RESET: 0, HAL_OK: 0, HAL_ERROR: 1, HAL_BUSY: 2, HAL_TIMEOUT: 3, HAL_MAX_DELAY: 0xFFFFFFFF,
    NULL: 0, TIM_CHANNEL_1: 1, TIM_CHANNEL_2: 2, TIM_CHANNEL_3: 3, TIM_CHANNEL_4: 4, TIM_CHANNEL_ALL: 0x3C,
    EXTI0_IRQn: 6, EXTI1_IRQn: 7, EXTI2_IRQn: 8, EXTI3_IRQn: 9, EXTI4_IRQn: 10, EXTI9_5_IRQn: 23, EXTI15_10_IRQn: 40,
    TIM1_TRG_COM_TIM11_IRQn: 26, TIM2_IRQn: 28, TIM3_IRQn: 29, TIM4_IRQn: 30, USART2_IRQn: 38,
    LED_Pin: 1 << 13, KEY_Pin: 1 << 0, USART_TX_Pin: 1 << 2, USART_RX_Pin: 1 << 3,
    hadc1: { name: 'ADC1' }, huart2: { name: 'USART2', Instance: { n: 'USART2' } }, hi2c1: { name: 'I2C1' },
    htim1: mkTim(1, 99, 19999, { 1: 'PA8', 2: 'PA9' }),
    htim2: mkTim(2, 0, 0xFFFFFFFF, { 1: 'PA15', 2: 'PB3' }, { enc: false }),
    htim3: mkTim(3, 99, 999, { 1: 'PA6', 2: 'PA7', 3: 'PB0', 4: 'PB1' }),
    htim4: mkTim(4, 99, 999, { 1: 'PB6', 2: 'PB7' }),
    htim5: mkTim(5, 99, 0xFFFFFFFF, {}),
    htim11: mkTim(11, 9999, 99, {}),
    White: 1, Black: 0, Font_6x8: { w: 6, h: 8 }, Font_7x10: { w: 7, h: 10 }, Font_11x18: { w: 11, h: 18 }, Font_16x26: { w: 16, h: 26 },
    SSD1306_WIDTH: 128, SSD1306_HEIGHT: 64, M_PI: Math.PI,
  });
  api.USART2 = api.huart2.Instance;
  api.LED_GPIO_Port = api.GPIOC; api.KEY_GPIO_Port = api.GPIOA;
  const ADC_CH = { 0: 'PA0', 1: 'PA1', 2: 'PA2', 3: 'PA3', 4: 'PA4', 5: 'PA5', 6: 'PA6', 7: 'PA7', 8: 'PB0', 9: 'PB1' };
  for (let i = 0; i < 19; i++) api['ADC_CHANNEL_' + i] = i;
  for (const k of ['3', '15', '28', '56', '84', '112', '144', '480']) api['ADC_SAMPLETIME_' + k + 'CYCLES'] = 0;
  const TIMS = [api.htim1, api.htim2, api.htim3, api.htim4, api.htim5, api.htim11];
  const pinsOf = (port, mask) => { const r = []; for (let i = 0; i < 16; i++) if (mask & (1 << i)) r.push('P' + port.n + i); return r; };
  const portOk = (port, fn) => {
    if (!port || !port.n) throw new Error(fn + ': 포트 인자가 올바르지 않습니다 (예: GPIOA)');
    if (!st.clk[port.n]) { warn('clk' + port.n, `GPIO${port.n} 클럭이 꺼져 있어요. __HAL_RCC_GPIO${port.n}_CLK_ENABLE()을 먼저 호출하세요.`); return false; }
    return true;
  };
  const setPin = (p, o) => { st.pins[p] = Object.assign(st.pins[p] || { mode: 'reset', pull: 0, out: 0 }, o); };
  const exLine = p => +p.slice(2);
  const irqOf = n => n <= 4 ? 6 + n : n <= 9 ? 23 : 40;

  async function drain() {
    if (st.busy) return; st.busy = true;
    try {
      while (st.q.length && !st.stopped) {
        const f = st.q.shift();
        try { await f(); } catch (e) { if (!(e instanceof Stop)) { st.stopped = true; hw.onError(e); } }
      }
    } finally { st.busy = false; }
  }
  const raise = f => { if (st.q.length < 32) { st.q.push(f); drain(); } };

  const lastLv = {};
  function service() {
    if (st.stopped) return;
    const t = now();
    for (const h of TIMS) {
      if (!h.it) continue;
      const period = (h.arr + 1) * 1000 / h.tick;
      if (t - h.next > period * 20) h.next = t;
      let n = 0;
      while (t >= h.next && n++ < 4) { h.next += period; hw.onIrq && hw.onIrq('tim'); if (st.isr.tim) raise(() => st.isr.tim(h)); }
    }
    for (const p in st.pins) {
      const s = st.pins[p]; if (!s.mode.startsWith('it')) continue;
      const lv = hw.readPin(p, s.pull, true) ? 1 : 0;
      if (lastLv[p] !== undefined && lv !== lastLv[p]) {
        const rise = lv === 1;
        if (s.mode === 'it_rf' || (s.mode === 'it_r' && rise) || (s.mode === 'it_f' && !rise)) {
          if (!st.nvic[irqOf(exLine(p))]) warn('nvic' + p, `${p} 인터럽트가 NVIC에서 꺼져 있어요. HAL_NVIC_EnableIRQ(EXTI..._IRQn)을 호출하세요.`);
          else { hw.onIrq && hw.onIrq('exti'); if (st.isr.exti) raise(() => st.isr.exti(1 << exLine(p))); }
        }
      }
      lastLv[p] = lv;
    }
  }
  const sched = setInterval(() => { if (st.stopped) return clearInterval(sched); service(); }, 1);
  setTimeout(() => { if (st.stopped) return; for (const p in st.pins) if (st.pins[p].mode === 'reset' && st.pins[p].wrote) warn('nout' + p, `${p}에 값을 썼지만 출력 모드로 설정되지 않았어요. HAL_GPIO_Init에서 GPIO_MODE_OUTPUT_PP로 설정하세요.`); }, 1200);

  function rxPump() {
    if (st.rxIT && st.rxq.length >= st.rxIT.n) {
      const { buf, n } = st.rxIT; st.rxIT = null;
      for (let i = 0; i < n; i++) buf[i] = st.rxq.shift();
      if (st.isr.rx) raise(() => st.isr.rx(api.huart2));
    }
  }
  const pwmChange = () => hw.onPwm && hw.onPwm();

  const fbNew = () => ({ buf: new Uint8Array(128 * 64), x: 0, y: 0 });
  let txtCanvas = null;
  function drawText(str, font, color) {
    const fb = st.fb; if (!fb) return;
    if (typeof document === 'undefined') { fb.x += str.length * font.w; return; }
    txtCanvas = txtCanvas || document.createElement('canvas');
    const w = Math.max(1, str.length * font.w), h = font.h;
    txtCanvas.width = w; txtCanvas.height = h;
    const g = txtCanvas.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; g.textBaseline = 'top';
    g.font = `${Math.round(h * (font.h <= 8 ? 1.05 : 0.98))}px "DejaVu Sans Mono", Menlo, Consolas, monospace`;
    for (let i = 0; i < str.length; i++) g.fillText(str[i], i * font.w, 0, font.w);
    const d = g.getImageData(0, 0, w, h).data;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      if (d[(yy * w + xx) * 4 + 3] > 110) px(fb.x + xx, fb.y + yy, color);
    }
    fb.x += w;
  }
  function px(x, y, c) {
    const fb = st.fb; x = Math.round(x); y = Math.round(y);
    if (!fb || x < 0 || y < 0 || x >= 128 || y >= 64) return;
    fb.buf[y * 128 + x] = c ? 1 : 0;
  }
  function line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (let k = 0; k < 400; k++) { px(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  const i2cOk = (addr, what) => {
    if (!st.i2c) { warn('i2c', 'I2C1이 초기화되지 않았어요. MX_I2C1_Init()을 먼저 호출하세요.'); return false; }
    if (!hw.i2cReady(addr)) { warn('i2c' + addr, `I2C 주소 0x${addr.toString(16).toUpperCase()}(${what})에서 응답이 없어요. SDA→B9, SCL→B8, 전원 배선을 확인하세요.`); return false; }
    return true;
  };

  Object.assign(api, {
    __tick: async () => { check(); if (now() - lastYield > 2) { service(); await yieldNow(); lastYield = now(); check(); } },
    __reg: o => { st.isr = o; },
    HAL_Init: () => 0, SystemClock_Config: () => 0, Error_Handler: () => { throw new Error('Error_Handler() 호출됨'); },
    HAL_GetTick: () => Math.floor(now() - st.t0),
    HAL_Delay: async ms => {
      check(); const end = now() + Math.max(0, Number(ms) || 0);
      while (now() < end) { service(); await new Promise(r => setTimeout(r, Math.min(20, Math.max(0, end - now())))); check(); }
      service(); lastYield = now();
    },
    HAL_NVIC_SetPriority: () => 0, HAL_NVIC_EnableIRQ: n => { st.nvic[n] = true; }, HAL_NVIC_DisableIRQ: n => { st.nvic[n] = false; },
    __disable_irq: () => 0, __enable_irq: () => 0,
    HAL_GPIO_Init: (port, init) => {
      if (!portOk(port, 'HAL_GPIO_Init')) return;
      if (!init || init.Pin === undefined) throw new Error('HAL_GPIO_Init: Pin이 설정되지 않았습니다');
      for (const p of pinsOf(port, init.Pin)) setPin(p, { mode: init.Mode || 'in', pull: init.Pull || 0 });
    },
    HAL_GPIO_DeInit: (port, mask) => { for (const p of pinsOf(port, mask)) setPin(p, { mode: 'reset' }); },
    HAL_GPIO_WritePin: (port, mask, v) => {
      if (!portOk(port, 'HAL_GPIO_WritePin')) return;
      for (const p of pinsOf(port, mask)) {
        setPin(p, { out: v ? 1 : 0, wrote: true });
        if (st.pins[p].mode !== 'out' && st.pins[p].mode !== 'reset') warn('nout' + p, `${p}가 출력 모드가 아니에요. HAL_GPIO_Init에서 GPIO_MODE_OUTPUT_PP로 설정하세요.`);
      }
      hw.onWrite && hw.onWrite();
    },
    HAL_GPIO_TogglePin: (port, mask) => {
      if (!portOk(port, 'HAL_GPIO_TogglePin')) return;
      for (const p of pinsOf(port, mask)) {
        setPin(p, { out: st.pins[p]?.out ? 0 : 1, wrote: true });
        if (st.pins[p].mode !== 'out' && st.pins[p].mode !== 'reset') warn('nout' + p, `${p}가 출력 모드가 아니에요. HAL_GPIO_Init에서 GPIO_MODE_OUTPUT_PP로 설정하세요.`);
      }
      hw.onWrite && hw.onWrite();
    },
    HAL_GPIO_ReadPin: (port, mask) => {
      if (!portOk(port, 'HAL_GPIO_ReadPin')) return 0;
      const p = pinsOf(port, mask)[0]; const s = st.pins[p];
      if (!s || s.mode === 'reset' || s.mode === 'an') { warn('nin' + p, `${p}가 입력으로 설정되지 않았어요. GPIO_MODE_INPUT으로 초기화하세요.`); return 0; }
      if (s.mode === 'out') return s.out;
      return hw.readPin(p, s.pull) ? 1 : 0;
    },
    MX_GPIO_Init: () => { warn('mxgpio', 'MX_GPIO_Init()을 직접 작성하지 않아 아무 핀도 설정되지 않았어요.'); },
    MX_USART2_UART_Init: () => { st.uart = true; setPin('PA2', { mode: 'af' }); setPin('PA3', { mode: 'af' }); },
    MX_ADC1_Init: () => { st.adc.ready = true; st.clk.A = true; setPin('PA1', { mode: 'an' }); st.adc.ch = 1; },
    MX_TIM1_Init: () => { setPin('PA8', { mode: 'af' }); setPin('PA9', { mode: 'af' }); },
    MX_TIM2_Init: () => { setPin('PA15', { mode: 'af' }); setPin('PB3', { mode: 'af' }); },
    MX_TIM3_Init: () => { setPin('PA6', { mode: 'af' }); setPin('PA7', { mode: 'af' }); setPin('PB0', { mode: 'af' }); },
    MX_TIM4_Init: () => { setPin('PB6', { mode: 'af' }); },
    MX_TIM5_Init: () => 0, MX_TIM11_Init: () => { st.nvic[26] = true; },
    MX_I2C1_Init: () => { st.i2c = true; setPin('PB8', { mode: 'af' }); setPin('PB9', { mode: 'af' }); },
    HAL_ADC_ConfigChannel: (h, cfg) => {
      const p = ADC_CH[cfg && cfg.Channel];
      if (!p) throw new Error('이 보드 헤더에 없는 ADC 채널입니다: ' + (cfg && cfg.Channel));
      st.adc.ch = cfg.Channel; setPin(p, { mode: 'an' }); return 0;
    },
    HAL_ADC_Start: () => { if (!st.adc.ready) warn('adc', 'ADC가 초기화되지 않았어요. MX_ADC1_Init()을 먼저 호출하세요.'); st.adc.started = true; return 0; },
    HAL_ADC_PollForConversion: () => 0, HAL_ADC_Stop: () => { st.adc.started = false; return 0; },
    HAL_ADC_GetValue: () => {
      if (!st.adc.ready) return 0;
      if (!st.adc.started) warn('adcs', 'HAL_ADC_Start()를 호출하지 않고 값을 읽었어요.');
      const v = Math.round(hw.analog(ADC_CH[st.adc.ch])); hw.onAdc && hw.onAdc(v); return v;
    },
    HAL_TIM_PWM_Start: (h, ch) => {
      const p = h && h.map && h.map[ch];
      if (!p) throw new Error(`HAL_TIM_PWM_Start: ${h && h.name} 채널 ${ch}는 이 실습실에서 PWM 핀이 없어요`);
      if (st.pins[p]?.mode !== 'af') warn('af' + p, `${p}가 타이머 기능(AF)으로 설정되지 않았어요. MX_${h.name}_Init()을 먼저 호출하세요.`);
      st.pwm[p] = { h, ch, on: true }; h.started = true; pwmChange(); return 0;
    },
    HAL_TIM_PWM_Stop: (h, ch) => { const p = h.map[ch]; if (st.pwm[p]) st.pwm[p].on = false; pwmChange(); return 0; },
    HAL_TIM_Base_Start: h => { h.started = true; h.t0 = now(); return 0; },
    HAL_TIM_Base_Stop: h => { h.started = false; return 0; },
    HAL_TIM_Base_Start_IT: h => { h.started = true; h.t0 = now(); h.it = true; h.next = now() + (h.arr + 1) * 1000 / h.tick; return 0; },
    HAL_TIM_Base_Stop_IT: h => { h.it = false; return 0; },
    HAL_TIM_Encoder_Start: h => {
      if (h !== api.htim2) throw new Error('엔코더 모드는 이 실습실에서 htim2(A15/B3)만 지원해요');
      if (st.pins.PA15?.mode !== 'af') warn('enc', 'A15/B3이 타이머 기능으로 설정되지 않았어요. MX_TIM2_Init()을 먼저 호출하세요.');
      h.enc = true; h.off = hw.encoder(); return 0;
    },
    __HAL_TIM_SET_COMPARE: (h, ch, v) => { pwmChange(); h.ccr[ch] = Math.max(0, Number(v) || 0); pwmChange(); },
    __HAL_TIM_GET_COMPARE: (h, ch) => h.ccr[ch] || 0,
    __HAL_TIM_GET_AUTORELOAD: h => h.arr,
    __HAL_TIM_SET_AUTORELOAD: (h, v) => { pwmChange(); h.arr = Math.max(1, Number(v) || 1); pwmChange(); },
    __HAL_TIM_SET_PRESCALER: (h, v) => { pwmChange(); h.psc = Math.max(0, Number(v) || 0); pwmChange(); },
    __HAL_TIM_GET_COUNTER: h => {
      if (h.enc) return Math.round(hw.encoder() - h.off);
      if (!h.started) { warn('tstart' + h.name, `${h.name}이 시작되지 않았어요. HAL_TIM_Base_Start(&h${h.name.toLowerCase()})를 먼저 호출하세요.`); return 0; }
      const c = Math.floor((now() - h.t0) * h.tick / 1000);
      return h.arr >= 0xFFFFFFFF ? c : c % (h.arr + 1);
    },
    __HAL_TIM_SET_COUNTER: (h, v) => { if (h.enc) h.off = hw.encoder() - (Number(v) || 0); else h.t0 = now() - (Number(v) || 0) * 1000 / h.tick; },
    HAL_UART_Transmit: (h, buf, len) => {
      if (!st.uart) { warn('uart', 'USART2가 초기화되지 않았어요. MX_USART2_UART_Init()을 먼저 호출하세요.'); return 1; }
      hw.onSerial((Array.isArray(buf) ? buf.map(x => String.fromCharCode(x)).join('') : String(buf)).slice(0, len)); return 0;
    },
    HAL_UART_Receive: async (h, buf, n, timeout) => {
      if (!st.uart) { warn('uart', 'USART2가 초기화되지 않았어요.'); return 1; }
      if (!Array.isArray(buf)) throw new Error('수신 버퍼는 uint8_t 배열로 선언하세요 (예: uint8_t rx[1];)');
      const end = now() + Math.min(Number(timeout) || 0, 1e9);
      while (st.rxq.length < n) { if (now() >= end) return 3; await new Promise(r => setTimeout(r, 2)); check(); }
      for (let i = 0; i < n; i++) buf[i] = st.rxq.shift();
      return 0;
    },
    HAL_UART_Receive_IT: (h, buf, n) => {
      if (!Array.isArray(buf)) throw new Error('수신 버퍼는 uint8_t 배열로 선언하세요 (예: uint8_t rx[1];)');
      st.rxIT = { buf, n: n || 1 }; rxPump(); return 0;
    },
    printf: (fmt, ...a) => {
      if (!st.uart) { warn('uart', 'USART2가 초기화되지 않아 printf 출력이 나가지 않아요. MX_USART2_UART_Init()을 호출하세요.'); return 0; }
      const s = cfmt(fmt, a); hw.onSerial(s); return s.length;
    },
    puts: s => api.printf('%s\n', s),
    sprintf: (fmt, ...a) => cfmt(fmt, a),
    snprintf: (n, fmt, ...a) => cfmt(fmt, a).slice(0, Math.max(0, n - 1)),
    strlen: s => toStr(s).length, strcmp: (a, b) => toStr(a) < toStr(b) ? -1 : toStr(a) > toStr(b) ? 1 : 0,
    __s8: v => (Math.trunc(Number(v) || 0) << 24) >> 24, __u8: v => Math.trunc(Number(v) || 0) & 0xFF,
    __s16: v => (Math.trunc(Number(v) || 0) << 16) >> 16, __u16: v => Math.trunc(Number(v) || 0) & 0xFFFF,
    __s32: v => typeof v === 'number' && isFinite(v) ? Math.trunc(v) | 0 : typeof v === 'boolean' ? +v : (Number(v) | 0), __u32: v => Math.trunc(Number(v) || 0) >>> 0,
    __b: v => v ? 1 : 0, __cp: v => (v && typeof v === 'object' && !Array.isArray(v)) ? { ...v } : v,
    sizeof: x => (typeof x === 'string' || Array.isArray(x)) ? Math.max(x.length, 1) : 1,
    abs: Math.abs, fabs: Math.abs, sqrt: Math.sqrt, pow: Math.pow, sin: Math.sin, cos: Math.cos, atan2: Math.atan2,
    fminf: Math.min, fmaxf: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil, memset: () => 0,
    HAL_I2C_IsDeviceReady: (h, addr8) => { if (!st.i2c) { warn('i2c', 'I2C1이 초기화되지 않았어요. MX_I2C1_Init()을 먼저 호출하세요.'); return 1; } return hw.i2cReady((addr8 >> 1) & 0x7F) ? 0 : 1; },
    HAL_I2C_Master_Transmit: (h, addr8) => st.i2c && hw.i2cReady((addr8 >> 1) & 0x7F) ? 0 : 1,
    ssd1306_Init: () => { st.fb = fbNew(); if (i2cOk(0x3C, 'OLED')) hw.oledShow(st.fb.buf.slice()); },
    ssd1306_Fill: c => { if (st.fb) st.fb.buf.fill(c ? 1 : 0); },
    ssd1306_SetCursor: (x, y) => { if (st.fb) { st.fb.x = x; st.fb.y = y; } },
    ssd1306_WriteString: (s, font, c) => { drawText(toStr(s), font || api.Font_7x10, c === undefined ? 1 : c); return 0; },
    ssd1306_WriteChar: (ch, font, c) => { drawText(typeof ch === 'number' ? String.fromCharCode(ch) : String(ch), font || api.Font_7x10, c === undefined ? 1 : c); return ch; },
    ssd1306_DrawPixel: (x, y, c) => px(x, y, c),
    ssd1306_Line: (a, b, c2, d, col) => line(a, b, c2, d, col),
    ssd1306_DrawRectangle: (a, b, c2, d, col) => { line(a, b, c2, b, col); line(c2, b, c2, d, col); line(c2, d, a, d, col); line(a, d, a, b, col); },
    ssd1306_FillRectangle: (a, b, c2, d, col) => { for (let y = Math.min(b, d); y <= Math.max(b, d); y++) line(a, y, c2, y, col); },
    ssd1306_DrawCircle: (x, y, r, col) => { for (let k = 0; k < 120; k++) { const t = k / 120 * Math.PI * 2; px(x + r * Math.cos(t), y + r * Math.sin(t), col); } },
    ssd1306_FillCircle: (x, y, r, col) => { for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r) px(x + xx, y + yy, col); },
    ssd1306_UpdateScreen: () => { if (!st.fb) return warn('oledinit', 'ssd1306_Init()을 먼저 호출하세요.'); if (i2cOk(0x3C, 'OLED')) hw.oledShow(st.fb.buf.slice()); },
    lcd_init: () => { st.lcd = { l: [' '.repeat(16), ' '.repeat(16)], r: 0, c: 0 }; if (i2cOk(0x27, 'LCD')) hw.lcdShow(st.lcd.l); },
    lcd_clear: () => { if (!st.lcd) return; st.lcd.l = [' '.repeat(16), ' '.repeat(16)]; st.lcd.r = st.lcd.c = 0; if (i2cOk(0x27, 'LCD')) hw.lcdShow(st.lcd.l); },
    lcd_put_cur: (r, c) => { if (st.lcd) { st.lcd.r = Math.max(0, Math.min(1, r)); st.lcd.c = Math.max(0, Math.min(15, c)); } },
    lcd_send_string: s => {
      if (!st.lcd) return warn('lcdinit', 'lcd_init()을 먼저 호출하세요.');
      for (const ch of toStr(s)) { const L = st.lcd; if (L.c < 16) { L.l[L.r] = L.l[L.r].slice(0, L.c) + ch + L.l[L.r].slice(L.c + 1); L.c++; } }
      if (i2cOk(0x27, 'LCD')) hw.lcdShow(st.lcd.l);
    },
    lcd_send_data: ch => api.lcd_send_string(typeof ch === 'number' ? String.fromCharCode(ch) : String(ch)),
    lcd_send_cmd: c => { if (c === 0x01) api.lcd_clear(); },
    DHT11_Read: (port, mask) => {
      const p = pinsOf(port, mask)[0], t = now();
      if (st.lastDht && t - st.lastDht < 1000) { warn('dhtfast', 'DHT11은 1초에 한 번만 읽을 수 있어요. HAL_Delay(1000) 이상 간격을 두세요.'); return { ok: 0, Temperature: 0, Humidity: 0 }; }
      st.lastDht = t;
      const r = hw.dhtRead(p);
      if (!r) { warn('dht' + p, `${p}에서 DHT11 응답이 없어요. DATA 핀과 전원 배선을 확인하세요.`); return { ok: 0, Temperature: 0, Humidity: 0 }; }
      return { ok: 1, Temperature: r.t, Humidity: r.h };
    },
  });
  ['A', 'B', 'C', 'D', 'H'].forEach(n => { api[`__HAL_RCC_GPIO${n}_CLK_ENABLE`] = () => { st.clk[n] = true; }; });
  ['ADC1', 'TIM1', 'TIM2', 'TIM3', 'TIM4', 'TIM5', 'TIM11', 'USART2', 'USART1', 'I2C1'].forEach(n => { api[`__HAL_RCC_${n}_CLK_ENABLE`] = () => 0; });

  function compile(src) {
    const { js } = transpile(src);
    const keys = Object.keys(api).filter(k => /^[A-Za-z_]\w*$/.test(k));
    const body = 'return (async function(){\n' + js +
      '\n;__reg({exti: typeof HAL_GPIO_EXTI_Callback==="function"?HAL_GPIO_EXTI_Callback:null, tim: typeof HAL_TIM_PeriodElapsedCallback==="function"?HAL_TIM_PeriodElapsedCallback:null, rx: typeof HAL_UART_RxCpltCallback==="function"?HAL_UART_RxCpltCallback:null});' +
      '\nif (typeof main !== "function") throw new Error("main() 함수가 없습니다.");\nreturn await main();\n})();';
    const fn = new Function(...keys, body);
    return () => fn(...keys.map(k => api[k]));
  }

  function drive(p) {
    const s = st.pins[p];
    if (!s) return null;
    const pw = st.pwm[p];
    if (pw && pw.on && s.mode === 'af') {
      const h = pw.h, ccr = h.ccr[pw.ch] || 0;
      return { level: Math.min(1, ccr / (h.arr + 1)), pulse: ccr * 1e6 / h.tick, freq: h.tick / (h.arr + 1), pwm: true };
    }
    if (s.mode === 'out') return { level: s.out, pulse: null };
    return null;
  }
  function feed(str) { for (const ch of str) st.rxq.push(ch.charCodeAt(0) & 0xFF); rxPump(); }
  return { st, api, compile, drive, feed, stop: () => { st.stopped = true; clearInterval(sched); }, Stop };
}

window.STM = { transpile, cfmt, createRuntime, Stop };
})();
