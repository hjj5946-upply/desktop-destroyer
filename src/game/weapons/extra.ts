import type { DestroyEngine } from '../engine';
import { createCrack } from '../crack';
import { CELL } from '../grid';
import { burst, makeCanvas, particle, pick, rand, TAU, type Pt, type Weapon } from './util';

const ease3 = (p: number) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;
const smooth = (p: number) => p * p * (3 - 2 * p);

// ───────────── 21. 거대 프레스: 큰 철판이 내려와 화면을 누르고 주름과 균열이 생긴다 ─────────────

interface Slam {
  x: number;
  y: number;
  w: number;
  h: number;
  t: number;
  hit: boolean;
}

const P_DOWN = 0.35;
const P_HOLD = 0.3;
const P_UP = 0.45;

export class Press implements Weapon {
  private slams: Slam[] = [];

  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    if (this.slams.length >= 2) return false;
    const k = this.e.k;
    this.slams.push({ x, y, w: rand(320, 420) * k, h: rand(200, 260) * k, t: 0, hit: false });
    this.e.sfx.pressDown();
    return true;
  }

  /** 쾅! 철판 아래 화면이 납작하게 눌리고 주름·리벳 자국·균열이 남는다 */
  private crush(s: Slam) {
    const e = this.e;
    const k = e.k;
    const L = s.x - s.w / 2;
    const T = s.y - s.h / 2;
    e.flatten();

    // 세로로 눌려 납작해짐
    const b = e.bctx;
    const { c: tmp, ctx: tctx } = makeCanvas(s.w, s.h);
    tctx.drawImage(e.base, L, T, s.w, s.h, 0, 0, s.w, s.h);
    b.fillStyle = '#0a0a0c';
    b.fillRect(L, T, s.w, s.h);
    b.drawImage(tmp, 0, 0, s.w, s.h, L, T + s.h * 0.05, s.w, s.h * 0.9);

    // 접힌 주름 (어두운 골 + 밝은 능선)
    const fold = (pts: Pt[]) => {
      for (const [style, lw, off] of [
        ['rgba(0,0,0,0.38)', 3, 0],
        ['rgba(255,255,255,0.22)', 1.4, 2],
      ] as const) {
        b.strokeStyle = style;
        b.lineWidth = lw * k;
        b.beginPath();
        pts.forEach((p, i) => (i === 0 ? b.moveTo(p.x, p.y + off * k) : b.lineTo(p.x, p.y + off * k)));
        b.stroke();
      }
    };
    for (let i = 0; i < 7; i++) {
      const yy = T + rand(0.1, 0.9) * s.h;
      const amp = rand(3, 9) * k;
      const ph = Math.random() * TAU;
      const pts: Pt[] = [];
      for (let x = L; x <= L + s.w; x += 14 * k) pts.push({ x, y: yy + Math.sin((x - L) / (40 * k) + ph) * amp });
      fold(pts);
    }
    for (const [cx, cy] of [
      [L, T],
      [L + s.w, T],
      [L, T + s.h],
      [L + s.w, T + s.h],
    ]) {
      fold([
        { x: cx, y: cy },
        { x: cx + (s.x - cx) * 0.35, y: cy + (s.y - cy) * 0.35 },
      ]);
    }

    // 철판 테두리 자국 + 리벳 자국
    b.strokeStyle = 'rgba(0,0,0,0.5)';
    b.lineWidth = 4 * k;
    b.strokeRect(L, T, s.w, s.h);
    for (const [rx, ry] of [
      [L + 18 * k, T + 18 * k],
      [L + s.w - 18 * k, T + 18 * k],
      [L + 18 * k, T + s.h - 18 * k],
      [L + s.w - 18 * k, T + s.h - 18 * k],
    ]) {
      b.fillStyle = 'rgba(0,0,0,0.55)';
      b.beginPath();
      b.arc(rx, ry, 5 * k, 0, TAU);
      b.fill();
      b.strokeStyle = 'rgba(255,255,255,0.25)';
      b.lineWidth = 1.2 * k;
      b.stroke();
    }

    // 모서리와 변 가운데에서 뻗는 균열
    const scale = Math.min(e.w, e.h);
    for (const [px, py] of [
      [L, T],
      [L + s.w, T],
      [L, T + s.h],
      [L + s.w, T + s.h],
      [s.x, T],
      [s.x, T + s.h],
      [L, s.y],
      [L + s.w, s.y],
    ]) {
      e.addCrack(createCrack(px, py, scale * rand(0.07, 0.13), k, { rays: 4 + Math.floor(Math.random() * 3), width: 2, rings: false }));
    }

    // 옆으로 뿜어져 나오는 먼지
    for (let i = 0; i < 30; i++) {
      const side = Math.random() < 0.5 ? L : L + s.w;
      e.addParticle(
        particle({
          x: side,
          y: T + Math.random() * s.h,
          vx: (side === L ? -1 : 1) * rand(150, 450) * k,
          vy: rand(-80, 40) * k,
          life: rand(0.5, 1),
          size: rand(8, 16) * k,
          grow: 30 * k,
          drag: 3,
          color: '170,165,160',
          alpha: 0.35,
        }),
      );
    }

    e.grid.markRect(L, T, s.w, s.h, 1);
    e.impact(s.x, s.y, 0.6);
    e.shake = Math.max(e.shake, 32 * k);
    e.hits += 2;
    e.hitRoaches(s.x, s.y, Math.max(s.w, s.h) * 0.5, false, 600 * k);
    e.sfx.clang();
  }

  update(dt: number) {
    for (let i = this.slams.length - 1; i >= 0; i--) {
      const s = this.slams[i];
      s.t += dt;
      if (!s.hit && s.t >= P_DOWN) {
        s.hit = true;
        this.crush(s);
      }
      if (s.t >= P_DOWN + P_HOLD + P_UP) this.slams.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const k = this.e.k;
    for (const s of this.slams) {
      const L = s.x - s.w / 2;
      const T = s.y - s.h / 2;
      const off = -s.h - 60 * k; // 화면 위 대기 위치
      let top: number;
      let near: number; // 내려온 정도 0~1 (그림자 진하기)
      if (s.t < P_DOWN) {
        near = (s.t / P_DOWN) ** 2;
        top = off + (T - off) * near;
      } else if (s.t < P_DOWN + P_HOLD) {
        near = 1;
        top = T;
      } else {
        near = 1 - ease3((s.t - P_DOWN - P_HOLD) / P_UP);
        top = off + (T - off) * near;
      }

      // 그림자
      ctx.fillStyle = `rgba(0,0,0,${0.4 * near})`;
      ctx.fillRect(L - 10 * k, T - 6 * k, s.w + 20 * k, s.h + 16 * k);

      // 유압 기둥
      const rg = ctx.createLinearGradient(s.x - 22 * k, 0, s.x + 22 * k, 0);
      rg.addColorStop(0, '#4a4f55');
      rg.addColorStop(0.5, '#c8d0d8');
      rg.addColorStop(1, '#4a4f55');
      ctx.fillStyle = rg;
      ctx.fillRect(s.x - 22 * k, -10 * k, 44 * k, top + 10 * k);

      // 철판
      const g = ctx.createLinearGradient(0, top, 0, top + s.h);
      g.addColorStop(0, '#b5bdc6');
      g.addColorStop(1, '#5c636b');
      ctx.fillStyle = g;
      ctx.fillRect(L, top, s.w, s.h);
      ctx.strokeStyle = '#1d2329';
      ctx.lineWidth = 3 * k;
      ctx.strokeRect(L, top, s.w, s.h);
      // 아래쪽 경고 줄무늬
      const band = 20 * k;
      ctx.save();
      ctx.beginPath();
      ctx.rect(L, top + s.h - band, s.w, band);
      ctx.clip();
      ctx.fillStyle = '#ffd60a';
      ctx.fillRect(L, top + s.h - band, s.w, band);
      ctx.fillStyle = '#111';
      for (let x = L - band; x < L + s.w; x += band * 1.6) {
        ctx.beginPath();
        ctx.moveTo(x, top + s.h);
        ctx.lineTo(x + band * 0.8, top + s.h);
        ctx.lineTo(x + band * 1.6, top + s.h - band);
        ctx.lineTo(x + band * 0.8, top + s.h - band);
        ctx.fill();
      }
      ctx.restore();
      // 리벳
      ctx.fillStyle = '#7d858e';
      for (const [rx, ry] of [
        [L + 18 * k, top + 18 * k],
        [L + s.w - 18 * k, top + 18 * k],
        [L + 18 * k, top + s.h - band - 12 * k],
        [L + s.w - 18 * k, top + s.h - band - 12 * k],
      ]) {
        ctx.beginPath();
        ctx.arc(rx, ry, 6 * k, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#2a2d31';
        ctx.lineWidth = 1.5 * k;
        ctx.stroke();
      }
    }
  }

  reset() {
    this.slams = [];
  }
}

// ───────────── 22. 스티커 도배: 클릭할 때마다 귀여운 스티커가 붙는다 ─────────────

interface StickerDef {
  path: (R: number) => Path2D;
  fill: string;
  /** 얼굴 위치/크기 (R 대비) */
  face?: { y: number; s: number };
  extra?: (ctx: CanvasRenderingContext2D, R: number) => void;
}

function starPath(R: number) {
  const p = new Path2D();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? R : R * 0.5;
    if (i === 0) p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else p.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  p.closePath();
  return p;
}

function circles(list: [number, number, number][]) {
  return (R: number) => {
    const p = new Path2D();
    for (const [x, y, r] of list) {
      p.moveTo(x * R + r * R, y * R);
      p.arc(x * R, y * R, r * R, 0, TAU);
    }
    return p;
  };
}

const STICKERS: StickerDef[] = [
  { path: starPath, fill: '#ffd60a', face: { y: 0.1, s: 0.75 } },
  {
    path: (R) => {
      const p = new Path2D();
      p.moveTo(0, R * 0.85);
      p.bezierCurveTo(-R * 1.25, 0, -R * 0.6, -R, 0, -R * 0.35);
      p.bezierCurveTo(R * 0.6, -R, R * 1.25, 0, 0, R * 0.85);
      return p;
    },
    fill: '#ff6b9a',
    face: { y: 0, s: 0.8 },
  },
  { path: circles([[0, 0, 1]]), fill: '#ffcc33', face: { y: 0, s: 1 } },
  {
    // 고양이
    path: (R) => {
      const p = new Path2D();
      p.moveTo(R * 0.85, R * 0.1);
      p.arc(0, R * 0.1, R * 0.85, 0, TAU);
      p.moveTo(-R * 0.78, -R * 0.2);
      p.lineTo(-R * 0.6, -R * 1.0);
      p.lineTo(-R * 0.15, -R * 0.68);
      p.closePath();
      p.moveTo(R * 0.78, -R * 0.2);
      p.lineTo(R * 0.6, -R * 1.0);
      p.lineTo(R * 0.15, -R * 0.68);
      p.closePath();
      return p;
    },
    fill: '#ffa94d',
    face: { y: 0.15, s: 0.85 },
    extra: (ctx, R) => {
      ctx.strokeStyle = '#5a3a1a';
      ctx.lineWidth = R * 0.04;
      for (const side of [-1, 1]) {
        for (const dy of [-0.05, 0.08]) {
          ctx.beginPath();
          ctx.moveTo(side * R * 0.45, R * (0.3 + dy));
          ctx.lineTo(side * R * 0.95, R * (0.25 + dy * 2));
          ctx.stroke();
        }
      }
    },
  },
  {
    // 꽃
    path: circles([...Array.from({ length: 6 }, (_, i): [number, number, number] => [Math.cos((i * TAU) / 6) * 0.55, Math.sin((i * TAU) / 6) * 0.55, 0.45])]),
    fill: '#c084fc',
    face: { y: 0, s: 0.45 },
    extra: (ctx, R) => {
      ctx.fillStyle = '#fff3a3';
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.42, 0, TAU);
      ctx.fill();
    },
  },
  {
    // 구름
    path: circles([
      [-0.45, 0.15, 0.45],
      [0.05, -0.15, 0.55],
      [0.5, 0.15, 0.42],
      [0, 0.3, 0.45],
    ]),
    fill: '#f2f8ff',
    face: { y: 0.15, s: 0.7 },
  },
];

interface Placed {
  def: StickerDef;
  x: number;
  y: number;
  R: number;
  rot: number;
  t: number;
}

/** 귀여운 얼굴: 반짝이는 눈 + 볼터치 + 웃는 입 */
function face(ctx: CanvasRenderingContext2D, R: number) {
  ctx.fillStyle = '#2a1a12';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * R * 0.3, -R * 0.08, R * 0.09, R * 0.13, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * R * 0.3 + R * 0.03, -R * 0.13, R * 0.035, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,110,140,0.55)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * R * 0.5, R * 0.14, R * 0.12, R * 0.07, 0, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = '#2a1a12';
  ctx.lineWidth = R * 0.05;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(-R * 0.07, R * 0.08, R * 0.07, 0.2, Math.PI - 0.2);
  ctx.arc(R * 0.07, R * 0.08, R * 0.07, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function paintSticker(ctx: CanvasRenderingContext2D, s: Placed, scale: number, k: number) {
  const { def, R } = s;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);
  ctx.scale(scale, scale);
  // 하얀 테두리 (칼선) + 그림자
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 8 * k;
  ctx.shadowOffsetY = 3 * k;
  ctx.fillStyle = '#fff';
  ctx.fill(def.path(R + 7 * k));
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = def.fill;
  const body = def.path(R);
  ctx.fill(body);
  def.extra?.(ctx, R);
  // 광택
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(-R * 0.35, -R * 0.45, R * 0.45, R * 0.2, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
  if (def.face) {
    ctx.translate(0, def.face.y * R);
    face(ctx, R * def.face.s);
  }
  ctx.restore();
}

export class Sticker implements Weapon {
  private popping: Placed[] = [];

  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    const e = this.e;
    const k = e.k;
    this.popping.push({ def: pick(STICKERS), x, y, R: rand(32, 52) * k, rot: rand(-0.5, 0.5), t: 0 });
    e.hitRoaches(x, y, 25 * k, false, 200 * k);
    e.sfx.sticker();
    return true;
  }

  update(dt: number) {
    const e = this.e;
    for (let i = this.popping.length - 1; i >= 0; i--) {
      const s = this.popping[i];
      s.t += dt;
      if (s.t >= 0.16) {
        paintSticker(e.dctx, s, 1, e.k); // 붙으면 영구 레이어로
        e.grid.markCircle(s.x, s.y, s.R, 0.3);
        this.popping.splice(i, 1);
        e.hits += 1;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const s of this.popping) {
      // 크게 나타났다가 '탁' 붙음
      const p = s.t / 0.16;
      paintSticker(ctx, s, 1.5 - 0.5 * ease3(p), this.e.k);
    }
  }

  reset() {
    this.popping = [];
  }
}

// ───────────── 23. 시간 되감기: 부서진 조각이 거꾸로 붙으며 처음 상태로 돌아온다 ─────────────

/** Space와 같은 되감기 연출(ending.ts RewindEnding)을 쓴다. SCORE/콤보는 유지 */
export class Rewind implements Weapon {
  constructor(private readonly e: DestroyEngine) {}

  press() {
    return this.e.rewind(true);
  }
}

// ───────────── 24. 쓰나미: 파란 물이 차오르고 큰 파도가 덮쳐 화면이 잠긴다 ─────────────

type TsPhase = 'idle' | 'rise' | 'wave' | 'under' | 'drain';
const TS_RISE = 1.2;
const TS_WAVE = 1.0;
const TS_UNDER = 2.4;
const TS_DRAIN = 1.2;

export class Tsunami implements Weapon {
  private phase: TsPhase = 'idle';
  private t = 0;
  private clock = 0;
  private dir = 1;
  private level = 0;

  constructor(private readonly e: DestroyEngine) {}

  press(x: number) {
    if (this.phase !== 'idle') return false;
    const e = this.e;
    this.phase = 'rise';
    this.t = 0;
    this.level = e.h;
    this.dir = x < e.w / 2 ? -1 : 1; // 클릭 반대편에서 파도가 몰려옴
    e.sfx.tsunami();
    return true;
  }

  /** 물이 빠진 뒤 남는 흔적: 일렁이며 번진 화면 + 물얼룩 + 흘러내린 자국 */
  private waterDamage() {
    const e = this.e;
    const k = e.k;
    e.flatten();
    const b = e.bctx;
    const step = Math.max(2, Math.round(4 * k));
    const ph = Math.random() * TAU;
    for (let y = 0; y < e.h; y += step) {
      const dx = Math.sin(y / (50 * k) + ph) * 6 * k;
      b.drawImage(e.base, 0, y, e.w, step, dx, y, e.w, step);
    }
    e.react('water', e.w / 2, e.h / 2, Math.hypot(e.w, e.h)); // 물에 잠기면 불이 꺼진다
    e.grid.markRect(0, 0, e.w, e.h, 0.3, CELL.WET);
    const d = e.dctx;
    d.fillStyle = 'rgba(30,90,160,0.12)';
    d.fillRect(0, 0, e.w, e.h);
    for (let i = 0; i < 25; i++) {
      const g = d.createRadialGradient(0, 0, 0, 0, 0, 1);
      const x = Math.random() * e.w;
      const y = Math.random() * e.h;
      const r = rand(40, 140) * k;
      d.save();
      d.translate(x, y);
      d.scale(r, r);
      g.addColorStop(0, 'rgba(60,110,150,0)');
      g.addColorStop(0.85, 'rgba(60,110,150,0.1)');
      g.addColorStop(1, 'rgba(200,230,255,0.18)'); // 마른 물자국 테두리
      d.fillStyle = g;
      d.beginPath();
      d.arc(0, 0, 1, 0, TAU);
      d.fill();
      d.restore();
    }
    d.strokeStyle = 'rgba(160,210,255,0.12)';
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * e.w;
      const y0 = Math.random() * e.h * 0.6;
      d.lineWidth = rand(1, 3) * k;
      d.beginPath();
      d.moveTo(x, y0);
      d.lineTo(x + rand(-4, 4) * k, y0 + rand(60, 260) * k);
      d.stroke();
    }
  }

  update(dt: number) {
    if (this.phase === 'idle') return;
    const e = this.e;
    const k = e.k;
    this.t += dt;
    this.clock += dt;

    if (this.phase === 'rise') {
      this.level = e.h - e.h * 0.38 * ease3(this.t / TS_RISE);
      if (this.t >= TS_RISE) {
        this.phase = 'wave';
        this.t = 0;
        e.sfx.splash();
      }
    } else if (this.phase === 'wave') {
      e.shake = Math.max(e.shake, 10 * k);
      if (this.t >= TS_WAVE) {
        this.phase = 'under';
        this.t = 0;
        this.waterDamage();
      }
    } else if (this.phase === 'under') {
      if (Math.random() < dt * 30) {
        e.addParticle(
          particle({
            x: Math.random() * e.w,
            y: e.h + 10 * k,
            vx: rand(-15, 15) * k,
            vy: -rand(120, 300) * k,
            life: rand(2, 4),
            size: rand(2, 7) * k,
            color: '210,235,255',
            alpha: 0.5,
          }),
        );
      }
      if (this.t >= TS_UNDER) {
        this.phase = 'drain';
        this.t = 0;
      }
    } else if (this.phase === 'drain') {
      this.level = -40 * k + (e.h + 40 * k) * (this.t / TS_DRAIN) ** 2;
      if (this.t >= TS_DRAIN) this.phase = 'idle';
    }

    // 물에 잠긴 바퀴벌레는 익사
    if (this.phase !== 'drain') e.drownRoaches((x, y) => y > this.surfaceAt(x));
    e.hits = Math.max(e.hits, 1);
  }

  private waveFront() {
    const w = this.e.w;
    const p = smooth(Math.min(1, this.t / TS_WAVE));
    return this.dir > 0 ? w * 1.2 - w * 1.45 * p : -w * 0.2 + w * 1.45 * p;
  }

  /** x 위치의 수면 높이 */
  private surfaceAt(x: number) {
    const { w, h, k } = this.e;
    const wob = Math.sin(x / (60 * k) + this.clock * 3) * 8 * k + Math.sin(x / (23 * k) - this.clock * 5) * 3 * k;
    if (this.phase === 'under') return -40 * k;
    if (this.phase !== 'wave') return this.level + wob;
    const front = this.waveFront();
    const top = h * 0.1 - (h * 0.1 + 40 * k) * smooth(Math.min(1, this.t / TS_WAVE));
    const ahead = (front - x) * -this.dir; // 0보다 크면 아직 파도가 안 온 곳
    const W = w * 0.22;
    if (ahead < 0) return top + wob * 0.5;
    if (ahead < W) return top + (this.level - top) * smooth(ahead / W) + wob;
    return this.level + wob;
  }

  drawTop(ctx: CanvasRenderingContext2D) {
    if (this.phase === 'idle') return;
    const e = this.e;
    const { w, h, k } = e;
    const step = 16 * k;

    // 물속 일렁임 (잠긴 부분만)
    const minY = this.phase === 'under' ? 0 : this.phase === 'wave' ? Math.max(0, h * 0.1 - 40 * k) : Math.max(0, this.level - 20 * k);
    const row = Math.max(2, Math.round(6 * k));
    for (let y = Math.floor(minY); y < h; y += row) {
      const dx = Math.sin(y / (30 * k) + this.clock * 3) * 4 * k;
      ctx.drawImage(e.scene, 0, y, w, row, dx, y, w, row);
    }

    // 물
    const pts: Pt[] = [];
    for (let x = -step; x <= w + step; x += step) pts.push({ x, y: this.surfaceAt(x) });
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(40,140,220,0.42)');
    g.addColorStop(1, 'rgba(5,35,90,0.72)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-step, h + 10);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(w + step, h + 10);
    ctx.closePath();
    ctx.fill();

    // 물마루 거품
    ctx.lineJoin = 'round';
    for (const [style, lw] of [
      ['rgba(255,255,255,0.35)', 7],
      ['rgba(255,255,255,0.85)', 2.5],
    ] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = lw * k;
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }

    // 파도 머리: 앞으로 말리는 하얀 물보라
    if (this.phase === 'wave') {
      const fx = this.waveFront();
      const fy = this.surfaceAt(fx - this.dir * 10 * k);
      ctx.fillStyle = 'rgba(235,248,255,0.85)';
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        ctx.arc(fx + this.dir * -rand(0, 70) * k, fy + rand(0, 160) * k, rand(10, 30) * k, 0, TAU);
        ctx.fill();
      }
      burst(e, fx, fy + rand(0, 100) * k, 4, {
        color: '230,245,255',
        speed: [100, 400],
        life: [0.4, 0.9],
        size: [2, 5],
        gravity: 900,
      });
    }

    // 물속 빛무늬
    if (this.phase === 'under') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(150,220,255,0.08)';
      ctx.lineWidth = 3 * k;
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 30 * k) {
          const y = (i / 10) * h + Math.sin(x / (80 * k) + this.clock * 2 + i) * 20 * k;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  reset() {
    this.phase = 'idle';
    this.t = 0;
  }
}
