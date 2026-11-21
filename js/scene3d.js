// 3D 작업대: Black Pill STM32F411CEU6(실측 치수 기반 모델링), 부품, 점퍼선, 조작
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from '../vendor/CSS2DRenderer.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';

/* ---------- Black Pill STM32F411CEU6 핀 배치 (mm, 보드 중심, USB-C는 -x 쪽) ---------- */
const P = 2.54, ROWZ = 7.62;
const NEAR = ['PB12:B12', 'PB13:B13', 'PB14:B14', 'PB15:B15', 'PA8:A8', 'PA9:A9', 'PA10:A10', 'PA11:A11', 'PA12:A12', 'PA15:A15', 'PB3:B3', 'PB4:B4', 'PB5:B5', 'PB6:B6', 'PB7:B7', 'PB8:B8', 'PB9:B9', '5V_2:5V', 'GND2:G', '3V3_2:3.3'];
const FAR = ['5V:5V', 'GND1:G', '3V3:3.3', 'PB10:B10', 'PB2:B2', 'PB1:B1', 'PB0:B0', 'PA7:A7', 'PA6:A6', 'PA5:A5', 'PA4:A4', 'PA3:A3', 'PA2:A2', 'PA1:A1', 'PA0:A0', 'NRST:R', 'PC15:C15', 'PC14:C14', 'PC13:C13', 'VBAT:VB'];
const KIND = { '5V': 'pwr', '5V_2': 'pwr', '3V3': 'pwr', '3V3_2': 'pwr', GND1: 'gnd', GND2: 'gnd', NRST: 'nc', VBAT: 'nc' };
export const BOARD = [];
NEAR.forEach((s, i) => { const [id, lab] = s.split(':'); BOARD.push({ id, lab, x: -24.13 + i * P, z: ROWZ, side: 'N', kind: KIND[id] || 'io' }); });
FAR.forEach((s, i) => { const [id, lab] = s.split(':'); BOARD.push({ id, lab, x: -24.13 + i * P, z: -ROWZ, side: 'F', kind: KIND[id] || 'io' }); });

const BW = 53.34, BL = 20.83, BY = 3;          // 보드 길이(x)·폭(z), PCB 아랫면 높이
const TOP = BY + 1.2, PIN_TOP = TOP + 2.5 + 6;  // PCB 윗면, 핀 끝

/* ---------- 유틸 ---------- */
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: 0, ...o });
const MAT = {
  black: M('#18191b', { roughness: .45 }), plastic: M('#101113', { roughness: .6 }), gold: M('#d8b55b', { metalness: 1, roughness: .28 }),
  silver: M('#c9ced3', { metalness: 1, roughness: .3 }), pcbBlue: M('#1d4f97', { roughness: .45 }), pcbGreen: M('#196c3b', { roughness: .45 }),
  pcbRed: M('#a8202a', { roughness: .45 }), pcbBlack: M('#1c1e21', { roughness: .45 }), pcbNavy: M('#1d2f4f', { roughness: .45 }),
  white: M('#f2f2ee', { roughness: .5 }), beige: M('#d9c9a3'), chip: M('#141516', { roughness: .35 }),
  blueCase: M('#2f6fd6', { roughness: .5 }), dark: M('#2a2d31'), rubber: M('#1a1a1a', { roughness: .9 }), brass: M('#c89b3c', { metalness: .9, roughness: .35 })
};
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m); return m;
}
const box = (w, h, d, mat, x, y, z, p) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, p);
const cyl = (r, h, mat, x, y, z, p, seg = 32, r2) => mesh(new THREE.CylinderGeometry(r, r2 ?? r, h, seg), mat, x, y + h / 2, z, p);
function label(text, cls, parent, x, y, z) {
  const el = document.createElement('div'); el.className = 'l3 ' + cls;
  const sp = document.createElement('span'); sp.textContent = text; el.append(sp);
  const o = new CSS2DObject(el); o.position.set(x, y, z); parent.add(o); return o;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.userData = { c, g }; return t;
}
let glowTex;
function glowSprite(color) {
  glowTex = glowTex || canvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  s.scale.set(10, 10, 1); s.renderOrder = 5; return s;
}
const tag = (o, data) => { o.traverse(m => { if (m.isMesh) m.userData = { ...data }; }); return o; };

/* ---------- 씬 ---------- */
export function createScene(host, cb) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.append(renderer.domElement);
  const css = new CSS2DRenderer(); css.domElement.className = 'css2d'; host.append(css.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1c1713'); scene.fog = new THREE.Fog('#1c1713', 500, 1300);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;

  const camera = new THREE.PerspectiveCamera(34, 1, 2, 4000);
  camera.position.set(40, 230, 250);

  // 조명
  scene.add(new THREE.HemisphereLight('#fff3e2', '#3a2e22', .7));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.position.set(-120, 260, 160); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, near: 10, far: 800 });
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .4; scene.add(sun);

  // 작업 매트
  const matTex = canvasTex(1024, 1024, (g, w) => {
    g.fillStyle = '#2a221b'; g.fillRect(0, 0, w, w);
    for (let i = 0; i <= 16; i++) { const p = i * w / 16; g.strokeStyle = i % 4 ? 'rgba(232,206,160,.10)' : 'rgba(232,206,160,.28)'; g.lineWidth = i % 4 ? 2 : 3; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, w); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
  });
  matTex.wrapS = matTex.wrapT = THREE.RepeatWrapping; matTex.repeat.set(15, 15);
  const ground = mesh(new THREE.PlaneGeometry(2400, 2400), M('#ffffff', { map: matTex, roughness: .9 }), 60, 0, 0, scene);
  ground.rotation.x = -Math.PI / 2; ground.castShadow = false; ground.userData = { kind: 'ground' };

  const controls = { enabled: true };
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(30, 0, 0); orbit.enableDamping = true; orbit.dampingFactor = .12; orbit.screenSpacePanning = false;
  orbit.maxPolarAngle = Math.PI * .47; orbit.minDistance = 25; orbit.maxDistance = 900;
  orbit.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  orbit.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  const pick = [];          // 레이캐스트 대상
  const anchors = new Map(); // 단자 id → Vector3 (꽂히는 지점)
  const termObjs = new Map();

  /* ---------- 보드: Black Pill STM32F411CEU6 ---------- */
  const board = new THREE.Group(); scene.add(board);
  const TS = 40, TX = x => (x + BW / 2) * TS, TZ = z => (z + BL / 2) * TS;
  const pcbTex = canvasTex(Math.round(BW * TS), Math.round(BL * TS), (g, w, h) => {
    g.fillStyle = '#16181b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = 7;
    for (let i = 0; i < 40; i++) { g.beginPath(); let x = Math.random() * w, y = TZ(-5) + Math.random() * TZ(10) - TZ(-5); g.moveTo(x, y); for (let k = 0; k < 3; k++) { Math.random() < .5 ? x += (Math.random() - .5) * 500 : y += (Math.random() - .5) * 200; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = '#ecebe6'; g.strokeStyle = '#ecebe6'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${1.05 * TS}px "JetBrains Mono", "DejaVu Sans Mono", monospace`;
    for (const p of BOARD) { g.save(); g.translate(TX(p.x), TZ(p.side === 'N' ? p.z - 2.35 : p.z + 2.35)); g.rotate(-Math.PI / 2); g.fillText(p.lab, 0, 0); g.restore(); }
    g.lineWidth = .16 * TS; for (const z of [ROWZ, -ROWZ]) g.strokeRect(TX(-25.4), TZ(z - 1.27), 50.8 * TS, 2.54 * TS);
    g.font = `800 ${1.5 * TS}px sans-serif`; g.fillText('STM32F411', TX(15), TZ(-3.1));
    g.font = `600 ${1 * TS}px sans-serif`; g.fillText('100MHz · 512KB', TX(15), TZ(-.9)); g.fillText('CORE BOARD', TX(15), TZ(3.6));
    g.font = `700 ${.85 * TS}px sans-serif`;
    [['BOOT0', -16.5, 5.2], ['NRST', -16.5, -5.2], ['KEY', -10.5, 5.2], ['PWR', -11, -5.4], ['C13', -8.1, -5.4], ['25M', -4.5, 1.9], ['SWD', 22.4, -4.6]].forEach(([t, x, z]) => g.fillText(t, TX(x), TZ(z)));
    g.font = `700 ${.7 * TS}px sans-serif`;
    ['3V3', 'DIO', 'CLK', 'GND'].forEach((t, i) => { g.save(); g.translate(TX(21.6), TZ(-3.81 + i * 2.54)); g.fillText(t, 0, 0); g.restore(); });
    g.fillStyle = '#c9a440'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(TX(23.9), TZ(-3.81 + i * 2.54), .75 * TS, 0, Math.PI * 2); g.fill(); g.fillStyle = '#0d0e10'; g.beginPath(); g.arc(TX(23.9), TZ(-3.81 + i * 2.54), .45 * TS, 0, Math.PI * 2); g.fill(); g.fillStyle = '#c9a440'; }
  });
  const pcbSide = M('#121315', { roughness: .5 });
  const pcb = mesh(new THREE.BoxGeometry(BW, 1.2, BL), [pcbSide, pcbSide, M('#ffffff', { map: pcbTex, roughness: .42, metalness: .05 }), pcbSide, pcbSide, pcbSide], 0, BY + .6, 0, board);
  pcb.userData = { kind: 'board' };
  // 핀 헤더 20×2 (위로 꽂는 수 핀)
  for (const z of [ROWZ, -ROWZ]) box(50.8, 2.5, 2.54, MAT.plastic, 0, TOP, z, board);
  const pinH = PIN_TOP, pinGeo = new THREE.BoxGeometry(.64, pinH, .64);
  const pins = new THREE.InstancedMesh(pinGeo, MAT.gold, BOARD.length); const mtx = new THREE.Matrix4();
  BOARD.forEach((p, i) => { mtx.makeTranslation(p.x, pinH / 2, p.z); pins.setMatrixAt(i, mtx); });
  pins.castShadow = true; board.add(pins);
  // USB-C
  const usb = new THREE.Group(); usb.position.set(-BW / 2 + 3.2, TOP, 0); board.add(usb);
  const usbM = M('#cfd4d8', { metalness: 1, roughness: .25 });
  mesh(new THREE.CapsuleGeometry(1.63, 5.7, 6, 16), usbM, 0, 1.63, 0, usb).rotation.x = Math.PI / 2;
  box(7.35, 3.26, 5.8, usbM, 0, 0, 0, usb);
  const hole = box(.2, 1.4, 6.6, MAT.black, -3.7, .9, 0, usb); hole.castShadow = false;
  // 버튼 3개
  const btn = (x, z, id, col) => {
    box(3.5, 1.6, 4.6, MAT.silver, x, TOP, z, board); box(3.9, .4, 5, MAT.black, x, TOP, z, board);
    const cap = box(1.7, 1, 2.6, M(col, { roughness: .4 }), x, TOP + 1.6, z, board); cap.userData = { kind: 'press', id }; pick.push(cap); return cap;
  };
  const caps = { BOOT0: btn(-16.5, 3, 'BOOT0', '#2b2e33'), NRST: btn(-16.5, -3, 'NRST', '#2b2e33'), KEY: btn(-10.5, 3, 'KEY', '#2b2e33') };
  // LED: PWR(빨강), C13(파랑)
  box(1, .45, .55, M('#ff7b6e', { emissive: '#ff2a1a', emissiveIntensity: 2.4 }), -11, TOP, -3.6, board);
  const pwrG = glowSprite('#ff4030'); pwrG.position.set(-11, TOP + .8, -3.6); pwrG.material.opacity = .6; pwrG.scale.set(6, 6, 1); board.add(pwrG);
  const ldMat = M('#b9d6ff', { emissive: '#3b8cff', emissiveIntensity: 0, roughness: .3 });
  box(1, .45, .55, ldMat, -8.1, TOP, -3.6, board);
  const ldGlow = glowSprite('#4f9dff'); ldGlow.position.set(-8.1, TOP + .9, -3.6); board.add(ldGlow);
  // MCU QFN48 (45° 회전)
  const mcu = new THREE.Group(); mcu.position.set(3, TOP, 0); mcu.rotation.y = Math.PI / 4; board.add(mcu);
  box(7, .85, 7, MAT.chip, 0, 0, 0, mcu);
  const mcuLbl = canvasTex(256, 256, (g) => { g.fillStyle = '#141516'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#b9bec4'; g.textAlign = 'center'; g.font = '800 44px sans-serif'; g.fillText('STM32', 128, 105); g.font = '600 26px monospace'; g.fillText('F411CEU6', 128, 145); g.fillText('ARM', 128, 182); g.beginPath(); g.arc(40, 40, 12, 0, Math.PI * 2); g.fill(); });
  mesh(new THREE.PlaneGeometry(6.8, 6.8), M('#ffffff', { map: mcuLbl, roughness: .45 }), 0, .86, 0, mcu).rotation.x = -Math.PI / 2;
  // 크리스털·레귤레이터·수동소자
  box(3.2, .9, 2.5, MAT.silver, -4.5, TOP, 4.2, board);
  box(2, .6, 1.2, MAT.silver, 10.5, TOP, -4.2, board);
  box(2.9, 1, 1.6, MAT.chip, -12.8, TOP, -.2, board);
  const smdPos = [];
  for (let i = 0; i < 6; i++) smdPos.push([9 + i * 1.6, 1.2, 0], [9 + i * 1.6, 4.6, 0], [-2.5 + i * 1.3, -4.6, 1]);
  for (let i = 0; i < 4; i++) smdPos.push([-7, -1.6 + i * 1.4, 1], [-1.5, -1.6 + i * 1.4, 1]);
  const smdGeo = new THREE.BoxGeometry(1, .35, .5); const smd = new THREE.InstancedMesh(smdGeo, MAT.beige, smdPos.length);
  smdPos.forEach(([x, z, r], i) => { const q = new THREE.Object3D(); q.position.set(x, TOP + .18, z); q.rotation.y = r ? Math.PI / 2 : 0; q.updateMatrix(); smd.setMatrixAt(i, q.matrix); });
  board.add(smd);
  // 단자
  for (const p of BOARD) if (p.kind !== 'nc') addTerm('B:' + p.id, new THREE.Vector3(p.x, PIN_TOP, p.z), board);

  // 핫스팟(홈 화면 설명 라벨)
  const HOT = [
    ['gpio', 'GPIO 핀', '#ff7a1a', -24.13 + 5 * P, PIN_TOP + 1, -ROWZ, 'l'],
    ['mcu', 'STM32F411 MCU', '#e8b04a', 3, TOP + 1.2, 0, 'r'],
    ['usb', 'USB-C', '#5aa9ff', -BW / 2 + 1, TOP + 3.5, 0, 'l'],
    ['led', 'C13 LED', '#3fd1a5', -8.1, TOP + 1, -3.6, 'r'],
    ['key', 'KEY 버튼', '#ffcf5a', -10.5, TOP + 2.8, 3, 'r'],
    ['reset', 'NRST · BOOT0', '#c58cff', -16.5, TOP + 2.8, -3, 'l'],
    ['xtal', '25MHz 크리스털', '#d8cfc2', -4.5, TOP + 1, 4.2, 'r'],
    ['power', '3V3 · GND', '#ff5a4e', 24.13 - P, PIN_TOP + 1, ROWZ, 'r'],
    ['swd', 'SWD 디버그', '#8fd14f', 23.9, TOP + .3, 0, 'r']
  ];
  const hots = HOT.map(([key, text, col, x, y, z, side]) => {
    const el = document.createElement('div'); el.className = 'hs ' + side; el.style.setProperty('--c', col);
    el.innerHTML = `<i></i><b><em></em>${text}</b>`; el.onclick = e => { e.stopPropagation(); cb.onHotspot && cb.onHotspot(key); };
    const o = new CSS2DObject(el); o.position.set(x, y, z); o.visible = false; board.add(o); return o;
  });
  const setHotspots = on => hots.forEach(o => { o.visible = on; o.element.style.display = on ? '' : 'none'; });
  setHotspots(false);

  function addTerm(id, pos, parent, small) {
    const hit = mesh(new THREE.SphereGeometry(small ? 1.5 : 1.6, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffd200', transparent: true, opacity: 0, depthWrite: false }), pos.x, pos.y, pos.z, parent);
    hit.castShadow = false; hit.userData = { kind: 'term', id }; pick.push(hit); termObjs.set(id, hit);
    hit.renderOrder = 6;
  }

  /* ---------- 부품 3D 모델 ---------- */
  const B = {};
  const modulePcb = (g, w, d, mat, x = 0, z = 0, h = 3) => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(.9, h, MAT.silver, x + sx * (w / 2 - 2), 0, z + sz * (d / 2 - 2), g, 8);
    const p = box(w, 1.6, d, mat, x, h, z, g); p.userData = { kind: 'body' }; return h + 1.6;
  };
  const header = (g, terms, top, id) => {
    for (const [t, x, z] of terms) {
      box(2.54, 2.5, 2.54, MAT.plastic, x, top, z, g); cyl(.32, 6, MAT.gold, x, top + 2.5, z, g, 6);
      addTerm(id + ':' + t, new THREE.Vector3(x, top + 8.5, z), g, true);
      label(t === '-' ? '−' : t, 'term', g, x, top + 10.5, z + 2.2);
    }
  };
  const miniBB = (g, w, d, x = 0, z = 0) => { const b = box(w, 8, d, M('#f1f1ec', { roughness: .7 }), x, 0, z, g); b.userData = { kind: 'body' }; return 8; };

  B.led = (c, g) => {
    const top = modulePcb(g, 16, 20, MAT.pcbBlack);
    const col = { red: '#ff3b30', green: '#22d160', yellow: '#ffc400', blue: '#2f8cff', white: '#f4f4f4' }[c.color || 'red'];
    const mat = new THREE.MeshPhysicalMaterial({ color: col, emissive: col, emissiveIntensity: 0, roughness: .15, transmission: .2, transparent: true, opacity: .82, clearcoat: 1 });
    cyl(2.9, 1, mat, 0, top, -2, g); cyl(2.5, 5.6, mat, 0, top + 1, -2, g);
    mesh(new THREE.SphereGeometry(2.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat, 0, top + 6.6, -2, g);
    const glow = glowSprite(col); glow.position.set(0, top + 6, -2); g.add(glow);
    header(g, PARTS.led.terms, top, c.id);
    return s => { mat.emissiveIntensity = s.lv * 3.2; glow.material.opacity = s.lv * .95; const k = 8 + s.lv * 30; glow.scale.set(k, k, 1); };
  };
  B.rgb = (c, g) => {
    const top = modulePcb(g, 18, 20, MAT.pcbBlack);
    const mat = new THREE.MeshPhysicalMaterial({ color: '#f1f3f5', emissive: '#000', roughness: .3, transparent: true, opacity: .9 });
    cyl(2.9, 1, mat, 0, top, -2, g); cyl(2.5, 5.6, mat, 0, top + 1, -2, g); mesh(new THREE.SphereGeometry(2.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat, 0, top + 6.6, -2, g);
    const glow = glowSprite('#ffffff'); glow.position.set(0, top + 6, -2); g.add(glow);
    header(g, PARTS.rgb.terms, top, c.id);
    return s => { const m = Math.max(s.r, s.g, s.b); mat.emissive.setRGB(s.r, s.g, s.b); mat.emissiveIntensity = 2.5; glow.material.color.setRGB(s.r || .001, s.g || .001, s.b || .001); glow.material.opacity = m; const k = 8 + m * 30; glow.scale.set(k, k, 1); };
  };
  B.button = (c, g) => {
    const top = modulePcb(g, 24, 20, MAT.pcbBlue);
    box(12, 3.5, 12, MAT.black, 0, top, -2, g);
    for (const [x, z] of [[-4.5, -6.5], [4.5, -6.5], [-4.5, 2.5], [4.5, 2.5]]) cyl(.6, .6, MAT.silver, x, top + 3.5, z, g, 8);
    const cap = cyl(4.4, 3.2, M('#e9c23a', { roughness: .4 }), 0, top + 3.5, -2, g, 32); cap.userData = { kind: 'press', id: c.id }; pick.push(cap);
    header(g, PARTS.button.terms, top, c.id);
    const y0 = cap.position.y; return s => { cap.position.y = y0 - (s.pressed ? 1.2 : 0); };
  };
  B.pot = (c, g) => {
    const top = modulePcb(g, 24, 26, MAT.pcbBlue);
    box(10, 5, 10, MAT.blueCase, 0, top, -3, g); cyl(3.6, 1.5, MAT.silver, 0, top + 5, -3, g);
    const knob = new THREE.Group(); knob.position.set(0, top + 6.5, -3); g.add(knob);
    cyl(5.5, 9, M('#2b2f33', { roughness: .7 }), 0, 0, 0, knob, 24); box(1, .4, 4.5, M('#ffffff'), 0, 9, -2.4, knob);
    const hitG = cyl(9, 12, new THREE.MeshBasicMaterial({ visible: false }), 0, -2, 0, knob); hitG.castShadow = false;
    tag(knob, { kind: 'act', comp: c.id }); knob.traverse(m => m.isMesh && pick.push(m));
    header(g, PARTS.pot.terms, top, c.id);
    return s => { knob.rotation.y = -(-135 + 270 * s.pos) * Math.PI / 180; };
  };
  B.servo = (c, g) => {
    const bd = box(23, 22.5, 12.2, MAT.blueCase, 0, 0, -4, g); bd.userData = { kind: 'body' };
    box(32.5, 2.5, 12.2, MAT.blueCase, 0, 15.5, -4, g);
    cyl(5.8, 4, MAT.blueCase, -5.5, 22.5, -4, g); cyl(2.4, 3, M('#f4f4f2'), -5.5, 26.5, -4, g);
    const horn = new THREE.Group(); horn.position.set(-5.5, 29.5, -4); g.add(horn);
    const hm = M('#f7f8f9', { roughness: .4 }); cyl(3.4, 1.6, hm, 0, 0, 0, horn);
    box(4.6, 1.6, 17, hm, 0, 0, -8.5, horn); cyl(2.3, 1.6, hm, 0, 0, -17, horn);
    const cbl = [['#f28c28', -2.54], ['#d63a2f', 0], ['#6b4428', 2.54]];
    for (const [col, x] of cbl) { const cv = new THREE.CubicBezierCurve3(new THREE.Vector3(x * .6 + 4, 3, 2), new THREE.Vector3(x * .6 + 4, 2, 12), new THREE.Vector3(x, 2, 16), new THREE.Vector3(x, 3, 21)); mesh(new THREE.TubeGeometry(cv, 20, .5, 6), M(col), 0, 0, 0, g); }
    const top = miniBB(g, 12, 8, 0, 24);
    header(g, PARTS.servo.terms, top, c.id);
    return s => { horn.rotation.y = (90 - s.angle) * Math.PI / 180; };
  };
  B.relay = (c, g) => {
    const top = modulePcb(g, 50, 26, MAT.pcbBlue, -13, 0);
    box(19, 15.5, 15, M('#1f6fd1', { roughness: .4 }), -18, top, -3, g);
    box(14, 10, 8, M('#1d8f4a'), 2, top, -3, g);
    for (const x of [-2.5, 2.5]) cyl(1.6, .6, MAT.silver, 2 + x, top + 10, -3, g, 12);
    const ind = box(1.6, .7, .8, M('#ff6b5e', { emissive: '#ff2a1a', emissiveIntensity: 0 }), -30, top, -8, g);
    cyl(6, 7, MAT.dark, 28, 0, -2, g); cyl(4.5, 4, MAT.silver, 28, 7, -2, g);
    const bulbM = new THREE.MeshPhysicalMaterial({ color: '#fffaf0', emissive: '#ffd27a', emissiveIntensity: 0, roughness: .1, transmission: .6, transparent: true, opacity: .55 });
    mesh(new THREE.SphereGeometry(8.5, 32, 16), bulbM, 28, 19, -2, g);
    const fil = cyl(.3, 6, M('#b8a56a', { emissive: '#ffb040', emissiveIntensity: 0 }), 28, 14, -2, g, 6);
    const glow = glowSprite('#ffcf70'); glow.position.set(28, 19, -2); g.add(glow);
    const light = new THREE.PointLight('#ffcc77', 0, 120, 2); light.position.set(28, 22, -2); g.add(light);
    for (const dz of [-1, 1]) { const cv = new THREE.CubicBezierCurve3(new THREE.Vector3(6, top + 7, -3 + dz), new THREE.Vector3(14, top + 12, -3 + dz), new THREE.Vector3(20, 6, -2 + dz), new THREE.Vector3(24, 3, -2 + dz)); mesh(new THREE.TubeGeometry(cv, 16, .6, 6), M(dz < 0 ? '#c0392b' : '#222'), 0, 0, 0, g); }
    header(g, PARTS.relay.terms, top, c.id);
    return s => { const k = s.on ? 1 : 0; ind.material.emissiveIntensity = k * 3; bulbM.emissiveIntensity = k * 1.6; fil.material.emissiveIntensity = k * 4; glow.material.opacity = k * .9; glow.scale.set(60, 60, 1); light.intensity = k * 900; };
  };
  B.buzzer = (c, g) => {
    const top = modulePcb(g, 16, 20, MAT.pcbBlack);
    cyl(6, 8, MAT.black, 0, top, -2, g, 32); cyl(1.2, .05, M('#000'), 0, top + 8.01, -2, g, 16);
    const ring = mesh(new THREE.TorusGeometry(8, .35, 6, 48), new THREE.MeshBasicMaterial({ color: '#9fb4c8', transparent: true, opacity: 0 }), 0, top + 8.5, -2, g); ring.rotation.x = Math.PI / 2; ring.castShadow = false;
    header(g, PARTS.buzzer.terms, top, c.id);
    let ph = 0; return (s, dt) => { ph = (ph + dt * 2.5) % 1; const on = s.f ? 1 : 0; ring.scale.setScalar(1 + ph * 1.6); ring.material.opacity = on * (1 - ph) * .8; };
  };
  B.hcsr04 = (c, g) => {
    const top = miniBB(g, 45, 20);
    const brd = box(45, 20, 1.6, MAT.pcbBlue, 0, top, -4, g); brd.userData = { kind: 'body' };
    for (const x of [-13, 13]) { const t = mesh(new THREE.CylinderGeometry(8, 8, 12, 32, 1, true), MAT.silver, x, top + 10, -10.8, g); t.rotation.x = Math.PI / 2; const m = mesh(new THREE.CircleGeometry(7.6, 32), M('#2a2d30', { roughness: .9 }), x, top + 10, -16.7, g); m.rotation.y = Math.PI; }
    box(5, 3, 2, MAT.silver, 0, top + 15, -5.5, g);
    const obj = box(36, 26, 5, M('#e4572e', { roughness: .6 }), 0, 0, -30, g); tag(obj, { kind: 'act', comp: c.id }); pick.push(obj);
    header(g, PARTS.hcsr04.terms, top, c.id);
    return s => { obj.position.z = -22 - s.dist * .55; };
  };
  B.dht11 = (c, g) => {
    const top = modulePcb(g, 22, 26, MAT.pcbBlue);
    const cs = box(15.5, 20, 6, M('#5cb6e6', { roughness: .6 }), 0, top, -5, g);
    const grid = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 2.8, .4), M('#2f7fae'), 16); const q = new THREE.Object3D();
    for (let i = 0; i < 16; i++) { q.position.set(-4.8 + (i % 4) * 3.2, top + 4 + Math.floor(i / 4) * 4, -1.9); q.updateMatrix(); grid.setMatrixAt(i, q.matrix); }
    g.add(grid); tag(cs, { kind: 'act', comp: c.id }); pick.push(cs);
    header(g, PARTS.dht11.terms, top, c.id);
    return () => {};
  };
  B.seg7 = (c, g) => {
    const top = miniBB(g, 26, 26);
    box(12.7, 8, 19, MAT.black, 0, top, -3, g);
    const off = M('#3a1616', { roughness: .5 }), segM = [];
    const S = { a: [0, -6.4, 5, 1.1], b: [2.9, -3.2, 1.1, 5], c: [2.9, 3.2, 1.1, 5], d: [0, 6.4, 5, 1.1], e: [-2.9, 3.2, 1.1, 5], f: [-2.9, -3.2, 1.1, 5], g: [0, 0, 5, 1.1] };
    Object.entries(S).forEach(([k, [x, z, w, d]]) => { const m = M('#3a1616', { emissive: '#ff2a1a', emissiveIntensity: 0 }); segM.push(m); box(w, .1, d, m, x, top + 8, z - 3, g); });
    const dpM = M('#3a1616', { emissive: '#ff2a1a', emissiveIntensity: 0 }); segM.push(dpM); cyl(.6, .1, dpM, 4.6, top + 8, 4, g, 12);
    header(g, PARTS.seg7.terms, top, c.id);
    return s => segM.forEach((m, i) => { const on = s.segs >> i & 1; m.emissiveIntensity = on ? 3 : 0; m.color.set(on ? '#ff6b5e' : '#3a1616'); });
  };
  B.lcd = (c, g) => {
    const top = modulePcb(g, 80, 36, MAT.pcbGreen, 0, 0, 9);
    box(71, 7, 24, MAT.black, 0, top, -2, g);
    const tex = canvasTex(512, 112, () => {}); const scr = mesh(new THREE.PlaneGeometry(64.5, 14), M('#ffffff', { map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: .35 }), 0, top + 7.02, -2, g); scr.rotation.x = -Math.PI / 2;
    box(42, 1.6, 19, MAT.pcbBlack, -14, 3.5, 2, g); box(4, 4, 10, MAT.chip, -14, 5.1, 4, g);
    const pinsTop = miniBB(g, 14, 6, -28, 16) ;
    header(g, PARTS.lcd.terms, pinsTop, c.id);
    let last = '';
    return s => {
      const key = (s.on ? 1 : 0) + s.lines.join('|'); if (key === last) return; last = key;
      const { g: x } = tex.userData;
      x.fillStyle = s.on ? '#9bc53d' : '#3b4a20'; x.fillRect(0, 0, 512, 112);
      for (let r = 0; r < 2; r++) for (let i = 0; i < 16; i++) { x.fillStyle = s.on ? 'rgba(0,0,0,.06)' : 'rgba(0,0,0,.15)'; x.fillRect(10 + i * 31.4, 10 + r * 50, 28, 42); }
      if (s.on) { x.fillStyle = '#16210a'; x.font = '600 40px "DejaVu Sans Mono", Menlo, Consolas, monospace'; x.textBaseline = 'top'; for (let r = 0; r < 2; r++) { const L = (s.lines[r] || '').padEnd(16).slice(0, 16); for (let i = 0; i < 16; i++) x.fillText(L[i], 12 + i * 31.4, 12 + r * 50); } }
      tex.needsUpdate = true;
    };
  };
  B.oled = (c, g) => {
    const top = modulePcb(g, 27, 28, MAT.pcbNavy);
    box(26, 1.4, 19, M('#050608', { roughness: .15, metalness: .3 }), 0, top, -2.5, g);
    const data = new Uint8Array(128 * 64 * 4); const tex = new THREE.DataTexture(data, 128, 64); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = true; tex.needsUpdate = true;
    const scr = mesh(new THREE.PlaneGeometry(23.7, 11.9), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, top + 1.42, -3, g); scr.rotation.x = -Math.PI / 2;
    header(g, PARTS.oled.terms, top, c.id);
    let ver = -1, on = null;
    return s => {
      if (s.ver === ver && s.on === on) return; ver = s.ver; on = s.on;
      for (let i = 0; i < 128 * 64; i++) { const v = s.on && s.buf && s.buf[i]; data[i * 4] = v ? 140 : 4; data[i * 4 + 1] = v ? 220 : 5; data[i * 4 + 2] = v ? 255 : 8; data[i * 4 + 3] = 255; }
      tex.needsUpdate = true;
    };
  };
  B.dcmotor = (c, g) => {
    const top = modulePcb(g, 43, 43, MAT.pcbRed, -30.5, -1);
    const hs = new THREE.Group(); hs.position.set(-30.5, top, -8); g.add(hs);
    box(16, 4, 15, MAT.chip, 0, 0, 0, hs); for (let i = 0; i < 7; i++) box(1.2, 14, 15, MAT.black, -7 + i * 2.33, 4, 0, hs);
    for (const x of [-48, -13]) box(8, 9, 12, M('#2f6fd6'), x, top, -4, g);
    // 기어드 모터 + 바퀴
    const mot = new THREE.Group(); mot.position.set(20, 22, -4); g.add(mot);
    box(26, 10, 22, MAT.dark, 4, -22, 0, mot);
    const can = cyl(12.5, 30, MAT.silver, 0, 0, 0, mot, 32); can.rotation.z = Math.PI / 2; can.position.set(-6, 0, 0);
    const gb = cyl(12.5, 18, M('#c9a43a', { metalness: .9, roughness: .35 }), 0, 0, 0, mot, 32); gb.rotation.z = Math.PI / 2; gb.position.set(17, 0, 0);
    const enc = cyl(11, 3, MAT.pcbGreen, 0, 0, 0, mot, 32); enc.rotation.z = Math.PI / 2; enc.position.set(-22.5, 0, 0);
    const wheel = new THREE.Group(); wheel.position.set(34, 0, 0); mot.add(wheel);
    const tire = mesh(new THREE.TorusGeometry(17, 4.2, 16, 48), MAT.rubber, 0, 0, 0, wheel); tire.rotation.y = Math.PI / 2;
    const hub = cyl(14, 5, M('#ffcc33', { roughness: .5 }), 0, 0, 0, wheel, 32); hub.rotation.z = Math.PI / 2; hub.position.set(-2.5, 0, 0);
    for (let k = 0; k < 3; k++) { const sp = box(6.2, 4, 26, M('#b38a00'), 0, -2, 0, wheel); sp.rotation.x = k * Math.PI / 3; sp.position.set(0, 0, 0); }
    const hitW = mesh(new THREE.SphereGeometry(20, 12, 8), new THREE.MeshBasicMaterial({ visible: false }), 0, 0, 0, wheel); hitW.castShadow = false;
    tag(wheel, { kind: 'act', comp: c.id }); wheel.traverse(m => m.isMesh && pick.push(m));
    const encTop = miniBB(g, 12, 6, 34, 21);
    for (const [col, dz] of [['#d63a2f', -1.2], ['#222', 1.2]]) { const cv = new THREE.CubicBezierCurve3(new THREE.Vector3(-46, top + 9, -4 + dz), new THREE.Vector3(-46, top + 24, -20), new THREE.Vector3(-8, 30, -20), new THREE.Vector3(-1, 22, -4 + dz)); mesh(new THREE.TubeGeometry(cv, 24, .7, 6), M(col), 0, 0, 0, g); }
    for (const [col, x] of [['#ffcc33', 32.7], ['#1d7fd6', 36.9]]) { const cv = new THREE.CubicBezierCurve3(new THREE.Vector3(-2, 22, 7), new THREE.Vector3(-2, 14, 16), new THREE.Vector3(x, 14, 18), new THREE.Vector3(x, encTop, 21)); mesh(new THREE.TubeGeometry(cv, 20, .45, 6), M(col), 0, 0, 0, g); }
    header(g, PARTS.dcmotor.terms.slice(0, 5), top, c.id);
    header(g, PARTS.dcmotor.terms.slice(5), encTop, c.id);
    return s => { wheel.rotation.x = -(s.pos * Math.PI * 2) % (Math.PI * 2); };
  };
  B.stepper = (c, g) => {
    const top = modulePcb(g, 35, 32, MAT.pcbGreen, -20.5, 0);
    box(19, 4, 6.5, MAT.chip, -24, top, -6, g);
    const leds = [0, 1, 2, 3].map(i => box(1.6, .7, .8, M('#ff6b5e', { emissive: '#ff2a1a', emissiveIntensity: 0 }), -10 + (i % 2) * 4, top, -9 + Math.floor(i / 2) * 4, g));
    box(12, 6, 5, M('#f1efe6'), -8, top, 6, g);
    const mot = new THREE.Group(); mot.position.set(20, 0, -2); g.add(mot);
    cyl(14, 19, MAT.silver, 0, 0, 0, mot, 40); cyl(14.1, 3, M('#2b5fbf'), 0, 19, 0, mot, 40);
    box(42, 1, 7, MAT.silver, 0, 17.5, 0, mot); cyl(4.6, 1.5, MAT.silver, 0, 22, -8, mot, 24);
    const shaft = new THREE.Group(); shaft.position.set(0, 23.5, -8); mot.add(shaft);
    cyl(2.5, 9, MAT.brass, 0, 0, 0, shaft, 16); box(2, 2, 16, M('#ffffff'), 0, 7.5, -7, shaft); box(4, 2, 4, M('#e4572e'), 0, 7.5, -15, shaft);
    const cv = new THREE.CubicBezierCurve3(new THREE.Vector3(9, 6, 11), new THREE.Vector3(10, 4, 22), new THREE.Vector3(-8, 4, 22), new THREE.Vector3(-8, top + 3, 8.5));
    mesh(new THREE.TubeGeometry(cv, 24, 1.6, 8), M('#3a6fd8'), 0, 0, 0, g);
    header(g, PARTS.stepper.terms, top, c.id);
    return s => { shaft.rotation.y = -s.steps * Math.PI * 2 / 4096; leds.forEach((l, i) => l.material.emissiveIntensity = (s.coils >> i & 1) ? 3 : 0); };
  };
  B.esc = (c, g) => {
    const e = box(24, 10, 45, M('#20242a', { roughness: .4 }), -22, 0, -4, g); e.userData = { kind: 'body' };
    const lt = canvasTex(128, 256, (x) => { x.fillStyle = '#20242a'; x.fillRect(0, 0, 128, 256); x.fillStyle = '#e8eef4'; x.font = '800 34px sans-serif'; x.textAlign = 'center'; x.fillText('ESC', 64, 110); x.font = '600 24px sans-serif'; x.fillText('30A', 64, 150); });
    mesh(new THREE.PlaneGeometry(22, 40), M('#fff', { map: lt }), -22, 10.02, -4, g).rotation.x = -Math.PI / 2;
    for (const [i, col] of [[0, '#2b2b2b'], [1, '#2b2b2b'], [2, '#2b2b2b']]) { const cv = new THREE.CubicBezierCurve3(new THREE.Vector3(-10, 5, -12 + i * 4), new THREE.Vector3(0, 5, -12 + i * 4), new THREE.Vector3(8, 5, -6 + i * 2), new THREE.Vector3(14, 8, -4 + i * 2)); mesh(new THREE.TubeGeometry(cv, 16, .9, 6), M(col), 0, 0, 0, g); }
    const mot = new THREE.Group(); mot.position.set(22, 0, -4); g.add(mot);
    cyl(15, 4, MAT.dark, 0, 0, 0, mot, 32); const bell = cyl(14, 14, M('#9aa3ab', { metalness: .9, roughness: .3 }), 0, 4, 0, mot, 32);
    const prop = new THREE.Group(); prop.position.set(0, 21, 0); mot.add(prop); cyl(3, 4, MAT.silver, 0, -3, 0, prop, 16);
    const pm = M('#2f6fd6', { roughness: .35 });
    for (const sx of [-1, 1]) { const b = box(6, 1, 32, pm, 0, 0, sx * 18, prop); b.rotation.x = sx * .18; }
    const blur = mesh(new THREE.CircleGeometry(36, 48), new THREE.MeshBasicMaterial({ color: '#7ba5e8', transparent: true, opacity: 0, depthWrite: false }), 0, 1.2, 0, prop); blur.rotation.x = -Math.PI / 2; blur.castShadow = false;
    const top = miniBB(g, 8, 6, -22, 21);
    const cv = new THREE.CubicBezierCurve3(new THREE.Vector3(-22, 5, 18), new THREE.Vector3(-22, 4, 20), new THREE.Vector3(-22, 5, 21), new THREE.Vector3(-22, 8, 21));
    mesh(new THREE.TubeGeometry(cv, 8, .8, 6), M('#f28c28'), 0, 0, 0, g);
    header(g, PARTS.esc.terms, top, c.id);
    return s => { prop.rotation.y = -s.ang * Math.PI / 180; blur.material.opacity = Math.min(.35, s.rpm / 9000); bell.rotation.y = prop.rotation.y; };
  };

  /* ---------- 부품 배치 ---------- */
  const compRoot = new THREE.Group(); scene.add(compRoot);
  const built = new Map();
  function clearComps() {
    // 레이캐스트 목록에서 먼저 빼고(부모 연결이 살아 있을 때) 장면에서 제거
    for (let i = pick.length - 1; i >= 0; i--) { let p = pick[i]; while (p && p !== compRoot) p = p.parent; if (p === compRoot) pick.splice(i, 1); }
    for (const [id, b] of built) {
      b.group.traverse(o => { if (o.isCSS2DObject) o.element.remove(); if (o.isMesh && !o.geometry.userData.shared) o.geometry.dispose(); });
      compRoot.remove(b.group);
    }
    built.clear();
    for (const id of [...termObjs.keys()]) if (!id.startsWith('B:')) termObjs.delete(id);
  }
  function setComps(comps, sandbox) {
    clearComps();
    for (const c of comps) {
      const g = new THREE.Group(); g.position.set(c.X, 0, c.Z); compRoot.add(g);
      const upd = B[c.type](c, g);
      g.traverse(m => { if (m.isMesh && m.userData.kind === 'body') { m.userData.comp = c.id; pick.push(m); } });
      const bb = new THREE.Box3().setFromObject(g); const hgt = bb.max.y;
      label(c.name, 'name', g, 0, hgt + 6, -PARTS[c.type].d / 2);
      const st = label('', 'status', g, 0, 0, PARTS[c.type].d / 2 + 9);
      if (sandbox) { const del = label('×', 'del', g, PARTS[c.type].w / 2 + 4, hgt + 6, -PARTS[c.type].d / 2); del.element.style.pointerEvents = 'auto'; del.element.onclick = e => { e.stopPropagation(); cb.onDelete(c.id); }; }
      built.set(c.id, { group: g, upd, st, c });
    }
    refreshAnchors();
  }
  function refreshAnchors() {
    anchors.clear(); scene.updateMatrixWorld(true);
    for (const [id, o] of termObjs) anchors.set(id, o.getWorldPosition(new THREE.Vector3()));
  }

  /* ---------- 점퍼선 ---------- */
  const wireRoot = new THREE.Group(); scene.add(wireRoot);
  const housingGeo = new THREE.BoxGeometry(2.5, 14, 2.5); housingGeo.userData.shared = true;
  let wireList = [];
  function setWires(wires, colorOf) {
    wireList = wires;
    for (const m of [...wireRoot.children]) { wireRoot.remove(m); m.traverse(o => { if (o.isMesh) { if (o.geometry !== housingGeo) o.geometry.dispose(); if (o.material !== MAT.black) o.material.dispose(); const i = pick.indexOf(o); if (i >= 0) pick.splice(i, 1); } }); }
    wires.forEach(([a, b], i) => {
      const A = anchors.get(a), Bp = anchors.get(b); if (!A || !Bp) return;
      const col = colorOf(a, b, i), mat = M(col, { roughness: .45 });
      const g = new THREE.Group(); wireRoot.add(g);
      const a1 = A.clone().add(new THREE.Vector3(0, 14, 0)), b1 = Bp.clone().add(new THREE.Vector3(0, 14, 0));
      const h = 14 + a1.distanceTo(b1) * .32;
      const curve = new THREE.CubicBezierCurve3(a1, a1.clone().add(new THREE.Vector3(0, h, 0)), b1.clone().add(new THREE.Vector3(0, h, 0)), b1);
      const tube = mesh(new THREE.TubeGeometry(curve, 40, .62, 8), mat, 0, 0, 0, g); tube.userData = { kind: 'wire', i }; pick.push(tube);
      for (const p of [A, Bp]) { const hs = mesh(housingGeo, MAT.black, p.x, p.y + 7 - 1.5, p.z, g); hs.userData = { kind: 'wire', i }; pick.push(hs); }
    });
  }

  /* ---------- 강조 · 대기선 ---------- */
  const rubberMat = new THREE.LineDashedMaterial({ color: '#ffd200', dashSize: 3, gapSize: 2 });
  const rubber = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), rubberMat); rubber.visible = false; scene.add(rubber);
  let pendingId = null, hl = new Set(), hoverId = null;
  function paintTerms() {
    for (const [id, o] of termObjs) {
      const on = id === pendingId || hl.has(id) || id === hoverId;
      o.material.opacity = on ? .85 : 0; o.material.color.set(hl.has(id) ? '#ff4d3d' : '#ffd200');
      o.scale.setScalar(on ? 1.25 : 1);
    }
  }
  const setPending = id => { pendingId = id; rubber.visible = !!id; paintTerms(); };
  const highlight = ids => { hl = new Set(ids); paintTerms(); };

  /* ---------- 입력 ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const el = renderer.domElement;
  function hit(e) {
    const r = el.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera); const h = ray.intersectObjects(pick, false).filter(x => board.visible || !isBoardObj(x.object)); for (const k of ['press', 'term', 'act']) { const f = h.find(x => x.object.userData.kind === k); if (f) return f; } return h[0] || null;
  }
  function isBoardObj(o) { while (o) { if (o === board) return true; o = o.parent; } return false; }
  function groundAt(e, y = 0) { plane.constant = -y; const p = new THREE.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : null; }
  let drag = null, down = null;
  el.addEventListener('pointerdown', e => {
    const h = hit(e); down = { x: e.clientX, y: e.clientY, h };
    if (!h || e.button !== 0) return;
    const u = h.object.userData;
    if (u.kind === 'press') { orbit.enabled = false; drag = { press: u.id }; cb.onPress(u.id, true); el.setPointerCapture(e.pointerId); }
    else if (u.kind === 'act') { orbit.enabled = false; drag = { act: u.comp, x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); }
    else if (u.kind === 'body' && u.comp) { const b = built.get(u.comp); const p = groundAt(e); if (p) { orbit.enabled = false; drag = { move: u.comp, dx: p.x - b.group.position.x, dz: p.z - b.group.position.z, sx: e.clientX, sy: e.clientY, moved: false }; el.setPointerCapture(e.pointerId); } }
  }, true);
  el.addEventListener('pointermove', e => {
    if (drag && drag.act) { cb.onAct(drag.act, e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; return; }
    if (drag && drag.move) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true; const r = el.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera);
      const p = groundAt(e); if (!p) return; const b = built.get(drag.move);
      b.group.position.set(p.x - drag.dx, 0, p.z - drag.dz); refreshAnchors(); cb.onMove(drag.move, b.group.position.x, b.group.position.z, false); return;
    }
    if (drag) return;
    const h = hit(e); const id = h && h.object.userData.kind === 'term' ? h.object.userData.id : null;
    if (id !== hoverId) { hoverId = id; paintTerms(); cb.onHover(id); }
    el.style.cursor = h && ['term', 'wire', 'press', 'act', 'body'].includes(h.object.userData.kind) ? (h.object.userData.kind === 'body' ? 'grab' : 'pointer') : '';
    if (pendingId) { const A = anchors.get(pendingId); const p = groundAt(e, A.y); if (p) { rubber.geometry.setFromPoints([A, p]); rubber.computeLineDistances(); } }
  });
  el.addEventListener('pointerup', e => {
    if (drag && drag.press) cb.onPress(drag.press, false);
    if (drag && drag.move && drag.moved) { const b = built.get(drag.move); cb.onMove(drag.move, b.group.position.x, b.group.position.z, true); }
    const wasDrag = drag && (drag.act || (drag.move && drag.moved));
    drag = null; orbit.enabled = true;
    if (!down || wasDrag || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    const h = down.h; down = null;
    const u = h ? h.object.userData : {};
    if (u.kind === 'term') cb.onTerm(u.id); else if (u.kind === 'wire') cb.onWire(u.i); else if (u.kind !== 'press') cb.onEmpty();
  });
  el.addEventListener('contextmenu', e => e.preventDefault());

  // 키보드: WASD 이동, Q/E 회전, R/F 확대
  const keys = new Set();
  addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return; const k = e.key.toLowerCase(); if ('wasdqerf'.includes(k) && k.length === 1) { keys.add(k); } });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  function keyMove(dt) {
    if (!keys.size) return;
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const sp = camera.position.distanceTo(orbit.target) * dt * .9, mv = new THREE.Vector3();
    if (keys.has('w')) mv.add(fwd); if (keys.has('s')) mv.sub(fwd); if (keys.has('d')) mv.add(right); if (keys.has('a')) mv.sub(right);
    mv.multiplyScalar(sp); camera.position.add(mv); orbit.target.add(mv);
    if (keys.has('q') || keys.has('e')) { const ang = (keys.has('q') ? 1 : -1) * dt * 1.4; const off = camera.position.clone().sub(orbit.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang); camera.position.copy(orbit.target).add(off); }
    if (keys.has('r') || keys.has('f')) { const off = camera.position.clone().sub(orbit.target).multiplyScalar(keys.has('r') ? 1 - dt * 1.2 : 1 + dt * 1.2); if (off.length() > 40 && off.length() < 900) camera.position.copy(orbit.target).add(off); }
  }

  /* ---------- 시점 ---------- */
  let anim = null;
  function view(name) {
    const bb = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 6, 0), new THREE.Vector3(BW, 12, BL));
    if (name !== 'board' && name !== 'home') for (const b of built.values()) bb.expandByObject(b.group);
    if (!board.visible) { bb.makeEmpty(); for (const b of built.values()) bb.expandByObject(b.group); if (bb.isEmpty()) bb.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(40, 20, 40)); }
    bb.min.y = 0; bb.max.y = Math.min(bb.max.y, 45);
    const tgt = bb.getCenter(new THREE.Vector3()).setY(0);
    const dir = name === 'top' ? new THREE.Vector3(0, 1, .02).normalize() : name === 'home' ? (camera.aspect < .9 ? new THREE.Vector3(-.78, .6, .32) : new THREE.Vector3(-.42, .72, .55)).normalize() : (camera.aspect < .9 ? new THREE.Vector3(-.66, .74, .08) : new THREE.Vector3(0, .78, .62)).normalize();
    const corners = []; for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const cam = camera.clone(); let d = 15;
    for (; d < 1200; d *= 1.06) {
      cam.position.copy(tgt).addScaledVector(dir, d); cam.lookAt(tgt); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      if (corners.every(c => { const v = c.clone().project(cam); return Math.abs(v.x) < (name === 'home' ? .62 : .9) && v.y < (name === 'home' ? .72 : .86) && v.y > (name === 'home' ? -.62 : -.6); })) break;
    }
    anim = { from: camera.position.clone(), to: tgt.clone().addScaledVector(dir, d), tf: orbit.target.clone(), tt: tgt, t: 0 };
  }

  /* ---------- 갱신·그리기 ---------- */
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    css.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(() => resize()); ro.observe(host); resize();
  function mount(el) { if (el !== host) { ro.unobserve(host); host = el; el.append(renderer.domElement, css.domElement); ro.observe(el); } resize(); }
  function setBoard(on) { board.visible = on; }
  function quality(hq) { renderer.setPixelRatio(hq ? Math.min(devicePixelRatio, 1.75) : 1); sun.castShadow = hq; resize(); }
  function rotate(dir) { const off = camera.position.clone().sub(orbit.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), dir * Math.PI / 8); anim = { from: camera.position.clone(), to: orbit.target.clone().add(off), tf: orbit.target.clone(), tt: orbit.target.clone(), t: 0 }; }
  function zoom(f) { const off = camera.position.clone().sub(orbit.target).multiplyScalar(f); if (off.length() < 25 || off.length() > 900) return; anim = { from: camera.position.clone(), to: orbit.target.clone().add(off), tf: orbit.target.clone(), tt: orbit.target.clone(), t: 0 }; }
  let last = performance.now(), slow = 0, lowQ = false;
  function render(state) {
    const t = performance.now(), dt = Math.min(.1, (t - last) / 1000); last = t;
    if (!lowQ) { slow = dt > .045 ? slow + 1 : Math.max(0, slow - 1); if (slow > 45) { lowQ = true; renderer.setPixelRatio(1); sun.shadow.mapSize.set(1024, 1024); sun.shadow.map && sun.shadow.map.dispose(); sun.shadow.map = null; resize(); } }
    if (anim) { anim.t = Math.min(1, anim.t + dt * 2.2); const k = 1 - Math.pow(1 - anim.t, 3); camera.position.lerpVectors(anim.from, anim.to, k); orbit.target.lerpVectors(anim.tf, anim.tt, k); if (anim.t >= 1) anim = null; }
    keyMove(dt); orbit.update();
    if (state) {
      ldMat.emissiveIntensity = state.led * 3.5; ldMat.color.set(state.led > .05 ? '#dbe9ff' : '#b9d6ff'); ldGlow.material.opacity = state.led * .95; const k = 5 + state.led * 16; ldGlow.scale.set(k, k, 1);
      for (const id in caps) caps[id].position.y = TOP + 2.1 - (state.press[id] ? .5 : 0);
      for (const [id, b] of built) { const s = state.parts[id]; if (s) { b.upd(s, dt); const txt = s.status || ''; const sp = b.st.element.firstChild; if (sp.textContent !== txt) sp.textContent = txt; sp.style.visibility = txt ? '' : 'hidden'; } }
    }
    const far = camera.position.distanceTo(orbit.target);
    host.classList.toggle('far', far > 170); host.classList.toggle('vfar', far > 480);
    if (window.__norender) return;
    renderer.render(scene, camera); css.render(scene, camera);
  }

  function screenPos(id) { const a = anchors.get(id); if (!a) return null; const v = a.clone().project(camera); const r = el.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; }
  function objPos(fn) { let r = null; scene.traverse(o => { if (!r && o.isMesh && fn(o.userData)) { const v = o.getWorldPosition(new THREE.Vector3()).project(camera); const b = el.getBoundingClientRect(); r = { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height }; } }); return r; }
  return { setComps, setWires, setPending, highlight, render, view, refreshAnchors, anchors, resize, screenPos, objPos, mount, setBoard, setHotspots, rotate, zoom, quality, _pick: pick, _project: (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); const r = el.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; } };
}
