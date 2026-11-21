// C(HAL) 부분집합 → JavaScript 변환기 + STM32F401 가상 주변장치
(function () {
'use strict';

/* ---------- 1. 변환기 ---------- */
const TYPES = ['GPIO_InitTypeDef', 'ADC_ChannelConfTypeDef', 'TIM_OC_InitTypeDef', 'GPIO_PinState',
  'HAL_StatusTypeDef', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t',
  'int64_t', 'size_t', 'unsigned\\s+long', 'unsigned\\s+int', 'unsigned\\s+char', 'unsigned',
  'long', 'short', 'float', 'double', 'char', 'bool', 'int'];
const T = '(?:' + TYPES.join('|') + ')';
const TV = '(?:' + TYPES.join('|') + '|void)';
const MOD = '(?:(?:static|const|volatile|inline|extern)\\s+)*';
const KW = new Set(['if', 'while', 'for', 'switch', 'return', 'function', 'catch', 'typeof', 'await', 'do', 'else', 'case']);

function transpile(src) {
  const lits = [];
  // 문자열·문자 리터럴 보호, 주석 제거
  let code = src.replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, m => {
    if (m.startsWith('//')) return '';
    if (m.startsWith('/*')) return m.replace(/[^\n]/g, '');
    lits.push(m); return '__L' + (lits.length - 1) + '__';
  });
  const fns = [];
  code = code
    .replace(/^[ \t]*#\s*include[^\n]*/gm, '')
    .replace(/^[ \t]*#\s*define[ \t]+([A-Za-z_]\w*)[ \t]+([^\n]+)/gm, 'const $1 = $2;')
    .replace(/^[ \t]*#\s*define[ \t]+([A-Za-z_]\w*)[ \t]*$/gm, 'const $1 = 1;')
    .replace(/^[ \t]*#[^\n]*/gm, '')
    .replace(new RegExp('(?<![\\w\\])\\]]\\s*)\\(\\s*(?:const\\s+)?(?:volatile\\s+)?' + TV + '\\s*\\*?\\s*\\)', 'g'), '')
    .replace(/\b(0[xX][0-9a-fA-F]+)[uUlL]+\b/g, '$1')
    .replace(/\b(\d+(?:\.\d+)?)[uUlLfF]+\b/g, '$1')
    .replace(/->/g, '.')
    .replace(new RegExp('^[ \\t]*' + MOD + TV + '\\s*\\*?\\s*[A-Za-z_]\\w*\\s*\\([^;{)]*\\)\\s*;', 'gm'), '')
    .replace(new RegExp(MOD + TV + '\\s*\\*?\\s+([A-Za-z_]\\w*)\\s*\\(([^)]*)\\)\\s*\\{', 'g'), (m, name, params) => {
      fns.push(name);
      const ps = params.split(',').map(p => p.trim()).filter(p => p && p !== 'void')
        .map(p => (p.match(/([A-Za-z_]\w*)\s*(?:\[\s*\w*\s*\])?$/) || [, '_'])[1]);
      return 'async function ' + name + '(' + ps.join(', ') + ') {';
    })
    .replace(/\bchar\s*\*?\s*([A-Za-z_]\w*)\s*\[[^\]]*\]\s*;/g, 'let $1 = "";')
    .replace(/\bchar\s+([A-Za-z_]\w*)\s*\[[^\]]*\]\s*=/g, 'let $1 =')
    .replace(new RegExp('\\b' + MOD + T + '\\s+([A-Za-z_]\\w*)\\s*\\[[^\\]]*\\]\\s*=\\s*\\{([^}]*)\\}', 'g'), 'let $1 = [$2]')
    .replace(new RegExp('\\b' + MOD + T + '\\s+([A-Za-z_]\\w*)\\s*\\[([^\\]]+)\\]\\s*;', 'g'), 'let $1 = new Array($2).fill(0);')
    .replace(/=\s*\{\s*0\s*\}/g, '= {}')
    .replace(new RegExp('\\b' + MOD + T + '\\b(?:\\s*\\*\\s*|\\s+)(?=[A-Za-z_])', 'g'), 'let ')
    .replace(/([(,=]\s*)&(?=[A-Za-z_])/g, '$1')
    .replace(/\b(sprintf|snprintf)\s*\(\s*([A-Za-z_]\w*)\s*,/g, '$2 = $1(');
  // snprintf(buf, n, fmt, ...) → buf = snprintf(n, fmt, ...)
  code = insertTicks(code);
  code = code.replace(/(?<![\w$.])(?<!function\s+)(?<!new\s+)([A-Za-z_]\w*)\s*\(/g, (m, n) => KW.has(n) ? m : 'await ' + m);
  code = code.replace(/__L(\d+)__/g, (m, i) => lits[+i]);
  return { js: code, fns };
}

// while/for/do 블록 안에 양보 지점 삽입(무한 루프에서도 화면이 멈추지 않게)
function insertTicks(c) {
  const edits = [];
  const re = /\b(while|for)\s*\(|\bdo\s*\{/g;
  let m;
  while ((m = re.exec(c))) {
    if (m[0].startsWith('do')) { edits.push([m.index + m[0].length, 0, ' await __tick();']); continue; }
    let i = m.index + m[0].length, depth = 1;
    while (i < c.length && depth) { if (c[i] === '(') depth++; else if (c[i] === ')') depth--; i++; }
    let j = i; while (/\s/.test(c[j] || '')) j++;
    if (c[j] === '{') edits.push([j + 1, 0, ' await __tick();']);
    else if (c[j] === ';' && m[1] === 'while') {
      let k = m.index - 1; while (k >= 0 && /\s/.test(c[k])) k--;
      if (c[k] !== '}') edits.push([j, 1, '{ await __tick(); }']);
    }
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
    let v = args[ai++], s;
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

/* ---------- 3. 가상 MCU ---------- */
class Stop extends Error {}

function createRuntime(hw) {
  // hw: { readPin(p), analog(p), onSerial(text, kind), onWarn(msg), now() }
  const st = { clk: {}, pins: {}, pwm: {}, adc: { ready: false, ch: 0 }, uart: false, stopped: false, t0: performance.now() };
  const warned = new Set();
  const warn = (k, msg) => { if (!warned.has(k)) { warned.add(k); hw.onWarn(msg); } };
  const check = () => { if (st.stopped) throw new Stop(); };
  let tickN = 0;

  const api = {};
  for (let i = 0; i < 16; i++) api['GPIO_PIN_' + i] = 1 << i;
  Object.assign(api, {
    GPIO_PIN_All: 0xFFFF, GPIOA: { n: 'A' }, GPIOB: { n: 'B' }, GPIOC: { n: 'C' }, GPIOD: { n: 'D' }, GPIOH: { n: 'H' },
    GPIO_MODE_INPUT: 'in', GPIO_MODE_OUTPUT_PP: 'out', GPIO_MODE_OUTPUT_OD: 'out', GPIO_MODE_AF_PP: 'af', GPIO_MODE_AF_OD: 'af',
    GPIO_MODE_ANALOG: 'an', GPIO_MODE_IT_RISING: 'in', GPIO_MODE_IT_FALLING: 'in', GPIO_MODE_IT_RISING_FALLING: 'in',
    GPIO_NOPULL: 0, GPIO_PULLUP: 1, GPIO_PULLDOWN: 2,
    GPIO_SPEED_FREQ_LOW: 0, GPIO_SPEED_FREQ_MEDIUM: 1, GPIO_SPEED_FREQ_HIGH: 2, GPIO_SPEED_FREQ_VERY_HIGH: 3,
    GPIO_PIN_SET: 1, GPIO_PIN_RESET: 0, HAL_OK: 0, HAL_ERROR: 1, HAL_MAX_DELAY: 0xFFFFFFFF,
    true: true, false: false, NULL: 0,
    TIM_CHANNEL_1: 1, TIM_CHANNEL_2: 2, TIM_CHANNEL_3: 3, TIM_CHANNEL_4: 4,
    ADC_SAMPLETIME_3CYCLES: 0, ADC_SAMPLETIME_15CYCLES: 1, ADC_SAMPLETIME_28CYCLES: 2, ADC_SAMPLETIME_56CYCLES: 3,
    ADC_SAMPLETIME_84CYCLES: 4, ADC_SAMPLETIME_112CYCLES: 5, ADC_SAMPLETIME_144CYCLES: 6, ADC_SAMPLETIME_480CYCLES: 7,
    LD2_Pin: 1 << 5, LD2_GPIO_Port: null, B1_Pin: 1 << 13, B1_GPIO_Port: null,
    USART_TX_Pin: 1 << 2, USART_RX_Pin: 1 << 3,
    hadc1: { name: 'ADC1' }, huart2: { name: 'USART2' },
    htim3: { name: 'TIM3', arr: 999, ccr: {}, map: { 1: 'PA6', 2: 'PA7' } },
    htim1: { name: 'TIM1', arr: 19999, ccr: {}, map: { 1: 'PA8', 2: 'PA9' } },
  });
  const ADC_CH = { 0: 'PA0', 1: 'PA1', 4: 'PA4', 8: 'PB0', 10: 'PC0', 11: 'PC1' };
  for (let i = 0; i < 19; i++) api['ADC_CHANNEL_' + i] = i;
  api.LD2_GPIO_Port = api.GPIOA; api.B1_GPIO_Port = api.GPIOC;
  const pinsOf = (port, mask) => { const r = []; for (let i = 0; i < 16; i++) if (mask & (1 << i)) r.push('P' + port.n + i); return r; };
  const portOk = (port, fn) => {
    if (!port || !port.n) throw new Error(fn + ': 포트 인자가 올바르지 않습니다 (예: GPIOA)');
    if (!st.clk[port.n]) { warn('clk' + port.n, `GPIO${port.n} 클럭이 꺼져 있어요. __HAL_RCC_GPIO${port.n}_CLK_ENABLE()을 먼저 호출하세요.`); return false; }
    return true;
  };
  const setPin = (p, o) => { st.pins[p] = Object.assign(st.pins[p] || { mode: 'reset', pull: 0, out: 0 }, o); };

  Object.assign(api, {
    __tick: async () => { check(); if (++tickN % 300 === 0) { await new Promise(r => setTimeout(r, 0)); check(); } },
    HAL_Init: () => 0, SystemClock_Config: () => 0, Error_Handler: () => { throw new Error('Error_Handler() 호출됨'); },
    HAL_GetTick: () => Math.floor(performance.now() - st.t0),
    HAL_Delay: async ms => {
      check(); const end = performance.now() + Math.max(0, Number(ms) || 0);
      while (performance.now() < end) { await new Promise(r => setTimeout(r, Math.min(50, end - performance.now()))); check(); }
    },
    HAL_GPIO_Init: (port, init) => {
      if (!portOk(port, 'HAL_GPIO_Init')) return;
      if (!init || init.Pin === undefined) throw new Error('HAL_GPIO_Init: Pin이 설정되지 않았습니다');
      if (init.Mode === undefined) warn('mode', 'GPIO_InitStruct.Mode가 비어 있어 입력 모드로 설정됩니다.');
      for (const p of pinsOf(port, init.Pin)) setPin(p, { mode: init.Mode || 'in', pull: init.Pull || 0 });
    },
    HAL_GPIO_DeInit: (port, mask) => { for (const p of pinsOf(port, mask)) setPin(p, { mode: 'reset' }); },
    HAL_GPIO_WritePin: (port, mask, v) => {
      if (!portOk(port, 'HAL_GPIO_WritePin')) return;
      for (const p of pinsOf(port, mask)) {
        setPin(p, { out: v ? 1 : 0 });
        if (st.pins[p].mode !== 'out') warn('nout' + p, `${p}가 출력 모드가 아니에요. HAL_GPIO_Init에서 GPIO_MODE_OUTPUT_PP로 설정하세요.`);
      }
    },
    HAL_GPIO_TogglePin: (port, mask) => {
      if (!portOk(port, 'HAL_GPIO_TogglePin')) return;
      for (const p of pinsOf(port, mask)) {
        setPin(p, { out: (st.pins[p]?.out ? 0 : 1) });
        if (st.pins[p].mode !== 'out') warn('nout' + p, `${p}가 출력 모드가 아니에요. HAL_GPIO_Init에서 GPIO_MODE_OUTPUT_PP로 설정하세요.`);
      }
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
    MX_ADC1_Init: () => { st.adc.ready = true; st.clk.A = true; setPin('PA0', { mode: 'an' }); st.adc.ch = 0; },
    MX_TIM3_Init: () => { st.clk.A = true; setPin('PA6', { mode: 'af' }); },
    MX_TIM1_Init: () => { st.clk.A = true; setPin('PA8', { mode: 'af' }); },
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
      const v = Math.round(hw.analog(ADC_CH[st.adc.ch]));
      hw.onAdc && hw.onAdc(v); return v;
    },
    HAL_TIM_PWM_Start: (h, ch) => {
      const p = h && h.map && h.map[ch];
      if (!p) throw new Error('HAL_TIM_PWM_Start: 지원하지 않는 타이머/채널입니다');
      if (st.pins[p]?.mode !== 'af') warn('af' + p, `${p}가 타이머 기능(AF)으로 설정되지 않았어요. ${h.name === 'TIM3' ? 'MX_TIM3_Init()' : 'MX_TIM1_Init()'}을 먼저 호출하세요.`);
      st.pwm[p] = { h, ch, on: true }; return 0;
    },
    HAL_TIM_PWM_Stop: (h, ch) => { const p = h.map[ch]; if (st.pwm[p]) st.pwm[p].on = false; return 0; },
    HAL_TIM_Base_Start: () => 0,
    __HAL_TIM_SET_COMPARE: (h, ch, v) => { h.ccr[ch] = Math.max(0, Number(v) || 0); },
    __HAL_TIM_GET_COMPARE: (h, ch) => h.ccr[ch] || 0,
    __HAL_TIM_GET_AUTORELOAD: h => h.arr,
    __HAL_TIM_SET_AUTORELOAD: (h, v) => { h.arr = Number(v) || 0; },
    HAL_UART_Transmit: (h, buf, len) => {
      if (!st.uart) { warn('uart', 'USART2가 초기화되지 않았어요. MX_USART2_UART_Init()을 먼저 호출하세요.'); return 1; }
      let s = Array.isArray(buf) ? buf.map(x => String.fromCharCode(x)).join('') : String(buf);
      hw.onSerial(s.slice(0, len)); return 0;
    },
    printf: (fmt, ...a) => {
      if (!st.uart) { warn('uart', 'USART2가 초기화되지 않아 printf 출력이 나가지 않아요. MX_USART2_UART_Init()을 호출하세요.'); return 0; }
      const s = cfmt(fmt, a); hw.onSerial(s); return s.length;
    },
    puts: s => api.printf('%s\n', s),
    sprintf: (fmt, ...a) => cfmt(fmt, a),
    snprintf: (n, fmt, ...a) => cfmt(fmt, a).slice(0, Math.max(0, n - 1)),
    strlen: s => String(s).length, sizeof: x => (typeof x === 'string' || Array.isArray(x)) ? Math.max(x.length, 1) : 4,
    abs: Math.abs, fabs: Math.abs, sqrt: Math.sqrt, pow: Math.pow, sin: Math.sin, cos: Math.cos,
    memset: () => 0,
  });
  ['A', 'B', 'C', 'D', 'H'].forEach(n => { api[`__HAL_RCC_GPIO${n}_CLK_ENABLE`] = () => { st.clk[n] = true; }; });
  ['ADC1', 'TIM1', 'TIM2', 'TIM3', 'TIM4', 'USART2', 'USART1'].forEach(n => { api[`__HAL_RCC_${n}_CLK_ENABLE`] = () => 0; });

  function compile(src) {
    const { js } = transpile(src);
    const keys = Object.keys(api).filter(k => /^[A-Za-z_]\w*$/.test(k) && k !== 'true' && k !== 'false');
    const body = 'return (async function(){\n' + js + '\n;if (typeof main !== "function") throw new Error("main() 함수가 없습니다.");\nreturn await main();\n})();';
    const fn = new Function(...keys, body);
    return () => fn(...keys.map(k => api[k]));
  }

  // 외부에서 보는 핀 상태
  function drive(p) {
    const s = st.pins[p];
    if (!s) return null;
    const pw = st.pwm[p];
    if (pw && pw.on && s.mode === 'af') {
      const ccr = pw.h.ccr[pw.ch] || 0;
      return { level: Math.min(1, ccr / (pw.h.arr + 1)), pulse: ccr, pwm: true };
    }
    if (s.mode === 'out') return { level: s.out, pulse: null };
    return null;
  }
  return { st, api, compile, drive, stop: () => { st.stopped = true; }, Stop };
}

window.STM = { transpile, cfmt, createRuntime, Stop };
})();
