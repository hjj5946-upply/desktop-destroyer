import type { DestroyEngine } from '../engine';
import { CRACK_STYLE, createCrack } from '../crack';
import { CELL } from '../grid';
import { burst, halfPlane, makeCanvas, particle, pick, polyPath, rand, RegionShift, TAU, zigzag, type Pt, type Weapon } from './util';

// ───────────── 8. 지진: 화면이 흔들리며 큰 균열이 가로지르고 조각이 어긋난다 ─────────────

export class Quake implements Weapon {
  private rumble = 0;

  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    const e = this.e;
    const k = e.k;
    const far = (e.w + e.h) * 2;

    // 클릭한 곳을 지나 화면을 가로지르는 지그재그 균열
    const ang = Math.random() < 0.6 ? rand(-0.5, 0.5) : Math.PI / 2 + rand(-0.4, 0.4);
    const L = Math.hypot(e.w, e.h);
    const a = { x: x - Math.cos(ang) * L, y: y - Math.sin(ang) * L };
    const b = { x: x + Math.cos(ang) * L, y: y + Math.sin(ang) * L };
    const line = zigzag(a, b, 60 * k, 26 * k);

    // 한쪽 땅이 미끄러지며 어긋남
    const slide = rand(10, 24) * k * (Math.random() < 0.5 ? -1 : 1);
    const lift = rand(4, 10) * k;
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    e.queueShift(
      new RegionShift(
        e,
        [
          { path: halfPlane(line, 1, far), dx: Math.cos(ang) * slide + nx * lift, dy: Math.sin(ang) * slide + ny * lift },
          { path: halfPlane(line, -1, far), dx: 0, dy: 0 },
        ],
        0.7,
        '#030303',
      ),
    );

    // 균열선을 따라 굵은 금과 잔금
    const d = e.dctx;
    d.strokeStyle = 'rgba(0,0,0,0.8)';
    d.lineWidth = 4 * k;
    d.lineJoin = 'round';
    d.beginPath();
    line.forEach((p, i) => (i === 0 ? d.moveTo(p.x, p.y) : d.lineTo(p.x, p.y)));
    d.stroke();
    const scale = Math.min(e.w, e.h);
    for (let i = 0; i < line.length; i += 2) {
      const p = line[i];
      if (p.x < -50 || p.x > e.w + 50 || p.y < -50 || p.y > e.h + 50) continue;
      e.addCrack(createCrack(p.x, p.y, scale * rand(0.06, 0.14), k, { rays: 3 + Math.floor(Math.random() * 3), width: 2.4, rings: false }));
      burst(e, p.x, p.y, 4, {
        color: pick(['120,110,100', '80,74,68']),
        speed: [30, 160],
        life: [0.6, 1.2],
        size: [2, 5],
        gravity: 1400,
        square: true,
      });
    }

    e.grid.markPath(line, 1);
    e.impact(x, y, 0.6);
    this.rumble = 1.4;
    e.shake = Math.max(e.shake, 45 * k);
    e.hits += 2;
    e.hitRoaches(x, y, 80 * k, false, 900 * k);
    e.sfx.rumble();
    return true;
  }

  update(dt: number) {
    if (this.rumble <= 0) return;
    this.rumble -= dt;
    this.e.shake = Math.max(this.e.shake, 26 * this.e.k * Math.max(0, this.rumble));
  }

  reset() {
    this.rumble = 0;
  }
}

// ───────────── 9. 번개: 지그재그 번개와 섬광, 맞은 자리가 까맣게 탄다 ─────────────

interface Bolt {
  lines: Pt[][];
  t: number;
  dur: number;
}

export class Lightning implements Weapon {
  private bolts: Bolt[] = [];
  private flicker = 0;

  constructor(private readonly e: DestroyEngine) {}

  /** 중간점을 흔들며 쪼개는 번개 줄기 */
  private bolt(a: Pt, b: Pt, spread: number, depth: number, out: Pt[][]) {
    const pts: Pt[] = [a, b];
    let off = spread;
    for (let it = 0; it < 6; it++) {
      for (let i = pts.length - 1; i > 0; i--) {
        const p = pts[i - 1];
        const q = pts[i];
        const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const j = rand(-off, off);
        pts.splice(i, 0, { x: (p.x + q.x) / 2 + (-(q.y - p.y) / len) * j, y: (p.y + q.y) / 2 + ((q.x - p.x) / len) * j });
      }
      off *= 0.55;
    }
    out.push(pts);
    // 곁가지
    if (depth < 2) {
      for (let i = 0; i < 3; i++) {
        if (Math.random() < 0.6) {
          const s = pts[Math.floor(rand(0.2, 0.8) * pts.length)];
          const ang = Math.atan2(b.y - a.y, b.x - a.x) + rand(-0.9, 0.9);
          const len = Math.hypot(b.x - a.x, b.y - a.y) * rand(0.15, 0.35);
          this.bolt(s, { x: s.x + Math.cos(ang) * len, y: s.y + Math.sin(ang) * len }, spread * 0.4, depth + 1, out);
        }
      }
    }
  }

  press(x: number, y: number) {
    const e = this.e;
    const k = e.k;
    const lines: Pt[][] = [];
    this.bolt({ x: x + rand(-220, 220) * k, y: -30 * k }, { x, y }, 120 * k, 0, lines);
    this.bolts.push({ lines, t: 0, dur: 0.4 });
    this.flicker = 0.35;

    // 맞은 자리: 그을음 + 리히텐베르크 무늬 (나뭇가지처럼 갈라진 탄 자국)
    const d = e.dctx;
    const g = d.createRadialGradient(x, y, 0, x, y, 45 * k);
    g.addColorStop(0, 'rgba(5,4,8,0.95)');
    g.addColorStop(0.5, 'rgba(25,20,30,0.6)');
    g.addColorStop(1, 'rgba(25,20,30,0)');
    d.fillStyle = g;
    d.beginPath();
    d.arc(x, y, 45 * k, 0, TAU);
    d.fill();
    const branch = (sx: number, sy: number, ang: number, len: number, w: number, depth: number) => {
      let px = sx;
      let py = sy;
      let a = ang;
      const steps = Math.ceil(len / (6 * k));
      d.strokeStyle = 'rgba(15,10,18,0.75)';
      for (let i = 0; i < steps; i++) {
        a += rand(-0.5, 0.5);
        const nx = px + Math.cos(a) * 6 * k;
        const ny = py + Math.sin(a) * 6 * k;
        d.lineWidth = w * (1 - i / steps) * k + 0.4 * k;
        d.beginPath();
        d.moveTo(px, py);
        d.lineTo(nx, ny);
        d.stroke();
        px = nx;
        py = ny;
        if (depth < 3 && Math.random() < 0.18) branch(px, py, a + rand(-1, 1), len * 0.5, w * 0.6, depth + 1);
      }
    };
    for (let i = 0; i < 7; i++) branch(x, y, Math.random() * TAU, rand(50, 110) * k, 2.5, 0);
    e.addCrack(createCrack(x, y, Math.min(e.w, e.h) * 0.06, k, { rays: 5, width: 2, rings: false, style: CRACK_STYLE.char }));

    burst(e, x, y, 40, {
      color: pick(['200,220,255', '255,255,255', '150,180,255']),
      speed: [200, 900],
      life: [0.15, 0.5],
      size: [1.2, 3],
      gravity: 1500,
      additive: true,
    });
    e.grid.markCircle(x, y, 45 * k, 1, CELL.BURNING);
    e.react('electric', x, y, 420 * k);
    e.react('fire', x, y, 45 * k);
    e.flashes.push({ x, y, t: 0, dur: 0.25, r: 500 * k, color: '190,210,255' });
    e.shake = Math.max(e.shake, 15 * k);
    e.hits += 1;
    e.hitRoaches(x, y, 60 * k, true, 500 * k);
    e.sfx.thunder();
    return true;
  }

  update(dt: number) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].t += dt;
      if (this.bolts[i].t >= this.bolts[i].dur) this.bolts.splice(i, 1);
    }
    this.flicker = Math.max(0, this.flicker - dt);
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.bolts.length === 0) return;
    const k = this.e.k;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const b of this.bolts) {
      const a = (1 - b.t / b.dur) * (Math.random() < 0.75 ? 1 : 0.25); // 깜빡임
      for (const [style, w] of [
        [`rgba(120,150,255,${a * 0.3})`, 10],
        [`rgba(190,210,255,${a})`, 3.5],
        [`rgba(255,255,255,${a})`, 1.3],
      ] as const) {
        ctx.strokeStyle = style;
        b.lines.forEach((line, li) => {
          ctx.lineWidth = w * k * (li === 0 ? 1 : 0.5);
          ctx.beginPath();
          line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
        });
      }
    }
    ctx.restore();
  }

  drawTop(ctx: CanvasRenderingContext2D) {
    if (this.flicker <= 0) return;
    // 번쩍이는 화면 전체 섬광
    const a = this.flicker * (Math.random() < 0.6 ? 1.4 : 0.4);
    ctx.fillStyle = `rgba(220,230,255,${Math.min(0.55, a)})`;
    ctx.fillRect(0, 0, this.e.w, this.e.h);
  }

  reset() {
    this.bolts = [];
    this.flicker = 0;
  }
}

// ───────────── 17. 운석 비: 불덩이가 줄줄이 떨어져 터지고 크레이터가 남는다 ─────────────

interface Meteor {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  delay: number;
  size: number;
  whoosh: boolean;
}

export class MeteorShower implements Weapon {
  private meteors: Meteor[] = [];

  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    const e = this.e;
    const k = e.k;
    const n = 7 + Math.floor(Math.random() * 4);
    const dir = { x: -0.45, y: 1 };
    const dl = Math.hypot(dir.x, dir.y);
    let delay = 0;
    for (let i = 0; i < n; i++) {
      const tx = Math.min(e.w - 20 * k, Math.max(20 * k, x + rand(-280, 280) * k));
      const ty = Math.min(e.h - 20 * k, Math.max(20 * k, y + rand(-170, 170) * k));
      const dist = 1300 * k;
      this.meteors.push({
        sx: tx - (dir.x / dl) * dist,
        sy: ty - (dir.y / dl) * dist,
        tx,
        ty,
        t: 0,
        dur: rand(0.45, 0.65),
        delay,
        size: rand(0.7, 1.3),
        whoosh: false,
      });
      delay += rand(0.1, 0.25);
    }
    return true;
  }

  private impact(m: Meteor) {
    const e = this.e;
    const k = e.k;
    const { tx: x, ty: y } = m;
    const d = e.dctx;
    const cr = m.size * rand(26, 38) * k;

    // 크레이터: 움푹 팬 어두운 바닥 + 밝은 테두리 (왼쪽 위 빛)
    const g = d.createRadialGradient(x, y, 0, x, y, cr * 1.6);
    g.addColorStop(0, 'rgba(12,8,6,0.97)');
    g.addColorStop(0.55, 'rgba(45,28,16,0.75)');
    g.addColorStop(1, 'rgba(45,28,16,0)');
    d.fillStyle = g;
    d.beginPath();
    d.arc(x, y, cr * 1.6, 0, TAU);
    d.fill();
    d.lineWidth = 3 * k;
    d.strokeStyle = 'rgba(255,230,200,0.25)';
    d.beginPath();
    d.arc(x, y, cr, Math.PI * 0.9, Math.PI * 1.7);
    d.stroke();
    d.strokeStyle = 'rgba(0,0,0,0.5)';
    d.beginPath();
    d.arc(x, y, cr, -0.2, Math.PI * 0.8);
    d.stroke();
    // 튀어나간 흙
    d.fillStyle = 'rgba(30,20,12,0.7)';
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * TAU;
      const r = cr * rand(1.4, 3);
      d.beginPath();
      d.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, rand(1.5, 4.5) * k, 0, TAU);
      d.fill();
    }
    e.addCrack(createCrack(x, y, Math.min(e.w, e.h) * 0.08 * m.size, k, { rays: 6, width: 2.5, rings: false, style: CRACK_STYLE.char }));
    e.heat.push({ x, y, r: cr * 0.9, life: 2.2, max: 2.2 });
    e.grid.markCircle(x, y, cr * 1.6, 1, CELL.BURNING);
    e.react('fire', x, y, cr * 1.6);
    e.react('blast', x, y, cr * 2.5);

    for (let i = 0; i < 30; i++) {
      const a = Math.random() * TAU;
      const sp = rand(150, 600) * k;
      e.fire.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 150 * k,
        size: rand(10, 24) * k * m.size,
        life: rand(0.25, 0.5),
        max: 0.5,
        smoke: false,
      });
    }
    e.spawnSmoke(x, y, 6, { life: [1.5, 3], size: [25, 50], spread: 60, speed: 60 });
    burst(e, x, y, 14, { color: '60,45,35', speed: [200, 600], life: [0.5, 1], size: [3, 7], gravity: 2200, square: true, up: 300 });
    e.blasts.push({ x, y, t: 0, dur: 0.35, r: 130 * k * m.size });
    e.rings.push({ x, y, t: 0, dur: 0.3, r: 200 * k * m.size });
    e.shake = Math.max(e.shake, 14 * k * m.size);
    e.hits += 1;
    e.hitRoaches(x, y, cr * 1.5, true, 300 * k);
    e.sfx.impact();
  }

  update(dt: number) {
    const e = this.e;
    const k = e.k;
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (m.delay > 0) {
        m.delay -= dt;
        continue;
      }
      if (!m.whoosh) {
        m.whoosh = true;
        e.sfx.whoosh();
      }
      m.t += dt;
      const p = Math.min(1, m.t / m.dur);
      const x = m.sx + (m.tx - m.sx) * p;
      const y = m.sy + (m.ty - m.sy) * p;
      // 꼬리 불꽃
      for (let j = 0; j < 3; j++) {
        e.fire.push({
          x: x + rand(-4, 4) * k,
          y: y + rand(-4, 4) * k,
          vx: rand(-30, 30) * k,
          vy: rand(-30, 30) * k,
          size: rand(8, 16) * k * m.size,
          life: rand(0.15, 0.3),
          max: 0.3,
          smoke: false,
        });
      }
      if (Math.random() < 0.3) e.spawnSmoke(x, y, 1, { life: [0.6, 1.2], size: [10, 20], spread: 10, speed: 20 });
      if (p >= 1) {
        this.meteors.splice(i, 1);
        this.impact(m);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const k = this.e.k;
    for (const m of this.meteors) {
      if (m.delay > 0) continue;
      const p = Math.min(1, m.t / m.dur);
      const x = m.sx + (m.tx - m.sx) * p;
      const y = m.sy + (m.ty - m.sy) * p;
      const r = 16 * k * m.size;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
      g.addColorStop(0, 'rgba(255,250,220,1)');
      g.addColorStop(0.4, 'rgba(255,160,50,0.8)');
      g.addColorStop(1, 'rgba(255,60,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#3a2a1e';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.45, 0, TAU);
      ctx.fill();
    }
  }

  reset() {
    this.meteors = [];
  }
}

// ───────────── 14. 블랙홀: 클릭한 곳으로 화면이 소용돌이치며 빨려 들어간다 ─────────────

interface Hole {
  x: number;
  y: number;
  t: number;
  dur: number;
  R: number;
  spin: { a: number; r: number; v: number }[];
}

export class BlackHole implements Weapon {
  private holes: Hole[] = [];

  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    const e = this.e;
    if (this.holes.length >= 2) return false;
    e.flatten();
    this.holes.push({ x, y, t: 0, dur: 3.2, R: 360 * e.k, spin: [] });
    e.sfx.blackhole();
    return true;
  }

  update(dt: number) {
    const e = this.e;
    const k = e.k;
    const b = e.bctx;
    for (let i = this.holes.length - 1; i >= 0; i--) {
      const h = this.holes[i];
      h.t += dt;
      const s = Math.sin(Math.PI * Math.min(1, h.t / h.dur)); // 커졌다가 사라짐

      // 소용돌이: 동심원 고리마다 안쪽일수록 더 많이 돌리고 중심으로 당긴다 (base에 누적 → 흔적이 남음)
      const N = 7;
      for (let j = 0; j < N; j++) {
        const f = (j + 1) / N;
        const r = h.R * (1 - j / N);
        b.save();
        b.beginPath();
        b.arc(h.x, h.y, r, 0, TAU);
        b.clip();
        b.translate(h.x, h.y);
        b.rotate(dt * s * 2.4 * f);
        const sc = 1 - dt * s * 0.4 * f;
        b.scale(sc, sc);
        b.translate(-h.x, -h.y);
        b.drawImage(e.base, 0, 0);
        b.restore();
      }
      // 중심이 점점 새까매짐
      const cg = b.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.R * 0.13);
      cg.addColorStop(0, `rgba(0,0,0,${Math.min(1, dt * 4 * s)})`);
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = cg;
      b.beginPath();
      b.arc(h.x, h.y, h.R * 0.13, 0, TAU);
      b.fill();

      // 빨려 들어가는 먼지
      if (s > 0.2) {
        for (let n = 0; n < 3; n++) h.spin.push({ a: Math.random() * TAU, r: h.R * rand(0.6, 1), v: rand(2, 4) });
      }
      for (let n = h.spin.length - 1; n >= 0; n--) {
        const sp = h.spin[n];
        sp.a += sp.v * dt * (h.R / Math.max(sp.r, 10 * k)) * 0.35;
        sp.r -= dt * (60 * k + (h.R - sp.r) * 1.2);
        if (sp.r < 8 * k) h.spin.splice(n, 1);
      }

      e.grid.markCircle(h.x, h.y, h.R * 0.6, dt * 0.6 * s);
      e.pullRoaches(h.x, h.y, h.R, dt * s);
      e.shake = Math.max(e.shake, 3 * k * s);
      e.hits = Math.max(e.hits, 1);

      if (h.t >= h.dur) {
        this.holes.splice(i, 1);
        e.flashes.push({ x: h.x, y: h.y, t: 0, dur: 0.3, r: 260 * k, color: '190,140,255' });
        e.rings.push({ x: h.x, y: h.y, t: 0, dur: 0.4, r: 320 * k });
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const k = this.e.k;
    for (const h of this.holes) {
      const s = Math.sin(Math.PI * Math.min(1, h.t / h.dur));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 강착원반
      const g = ctx.createRadialGradient(h.x, h.y, 20 * k * s, h.x, h.y, 90 * k * s + 1);
      g.addColorStop(0, `rgba(255,200,120,${0.9 * s})`);
      g.addColorStop(0.4, `rgba(255,110,60,${0.5 * s})`);
      g.addColorStop(0.75, `rgba(150,80,255,${0.3 * s})`);
      g.addColorStop(1, 'rgba(80,40,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 90 * k * s + 1, 0, TAU);
      ctx.fill();
      // 회전하는 줄무늬
      ctx.strokeStyle = `rgba(255,220,180,${0.5 * s})`;
      ctx.lineWidth = 1.5 * k;
      for (let i = 0; i < 6; i++) {
        const st = h.t * 5 + (i * TAU) / 6;
        ctx.beginPath();
        ctx.arc(h.x, h.y, (40 + i * 7) * k * s, st, st + 1.1);
        ctx.stroke();
      }
      for (const sp of h.spin) {
        ctx.fillStyle = 'rgba(255,230,200,0.7)';
        ctx.fillRect(h.x + Math.cos(sp.a) * sp.r, h.y + Math.sin(sp.a) * sp.r, 2 * k, 2 * k);
      }
      ctx.restore();
      // 사건의 지평선
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(h.x, h.y, 28 * k * s, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,240,220,${0.8 * s})`;
      ctx.lineWidth = 1.5 * k;
      ctx.stroke();
    }
  }

  reset() {
    this.holes = [];
  }
}

// ───────────── 15. 중력 해제: 클릭한 부분이 조각나 아래로 떨어진다 ─────────────

interface Piece {
  cv: HTMLCanvasElement;
  /** 조각 캔버스 왼쪽 위의 원래 위치 */
  ox: number;
  oy: number;
  /** 조각 중심 (회전축, 조각 캔버스 기준) */
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  wait: number;
}

/** 원형 영역을 동심원 × 부채꼴로 잘라 조각 다각형들을 만든다 */
export function shatterPolys(x: number, y: number, R: number, rings: number[], wedges: number[]): Pt[][] {
  const polys: Pt[][] = [];
  const radii = [0, ...rings.map((r) => r * R * rand(0.9, 1.1)), R];
  for (let j = 0; j < radii.length - 1; j++) {
    const n = wedges[Math.min(j, wedges.length - 1)];
    const off = Math.random() * TAU;
    const angs = Array.from({ length: n }, (_, i) => off + ((i + rand(-0.25, 0.25)) * TAU) / n);
    for (let i = 0; i < n; i++) {
      const a0 = angs[i];
      const a1 = i + 1 < n ? angs[i + 1] : angs[0] + TAU;
      const r0 = radii[j];
      const r1 = radii[j + 1];
      const pts: Pt[] = [];
      const steps = 3;
      for (let s = 0; s <= steps; s++) {
        const a = a0 + ((a1 - a0) * s) / steps;
        pts.push({ x: x + Math.cos(a) * r1, y: y + Math.sin(a) * r1 });
      }
      if (r0 === 0) pts.push({ x, y });
      else
        for (let s = steps; s >= 0; s--) {
          const a = a0 + ((a1 - a0) * s) / steps;
          pts.push({ x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0 });
        }
      polys.push(pts);
    }
  }
  return polys;
}

/** 다각형 영역을 src에서 잘라낸 조각 */
export function cutPiece(src: CanvasImageSource, poly: Pt[]) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const bx = Math.floor(Math.min(...xs)) - 2;
  const by = Math.floor(Math.min(...ys)) - 2;
  const bw = Math.ceil(Math.max(...xs)) - bx + 4;
  const bh = Math.ceil(Math.max(...ys)) - by + 4;
  const { c, ctx } = makeCanvas(bw, bh);
  ctx.translate(-bx, -by);
  const path = polyPath(poly);
  ctx.save();
  ctx.clip(path);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; // 유리 단면
  ctx.lineWidth = 1.5;
  ctx.stroke(path);
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length - bx;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length - by;
  return { cv: c, ox: bx, oy: by, cx, cy, path };
}

export class Gravity implements Weapon {
  private pieces: Piece[] = [];

  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    const e = this.e;
    const k = e.k;
    e.flatten();
    const R = rand(130, 170) * k;
    const polys = shatterPolys(x, y, R, [0.45], [5, 9]);
    const b = e.bctx;
    for (const poly of polys) {
      const pc = cutPiece(e.base, poly);
      this.pieces.push({
        cv: pc.cv,
        ox: pc.ox,
        oy: pc.oy,
        cx: pc.cx,
        cy: pc.cy,
        dx: 0,
        dy: 0,
        vx: rand(-60, 60) * k,
        vy: rand(-80, 0) * k,
        rot: 0,
        vr: rand(-3, 3),
        wait: rand(0.05, 0.35),
      });
      // 빠져나간 자리는 깜깜한 구멍
      b.fillStyle = '#060606';
      b.fill(pc.path);
      b.strokeStyle = 'rgba(255,255,255,0.08)';
      b.lineWidth = 1.5 * k;
      b.stroke(pc.path);
    }
    if (this.pieces.length > 200) this.pieces.splice(0, this.pieces.length - 200);
    e.grid.markCircle(x, y, R, 1);
    e.shake = Math.max(e.shake, 8 * k);
    e.hits += 1;
    e.hitRoaches(x, y, R, false, 400 * k);
    e.sfx.crumble();
    return true;
  }

  update(dt: number) {
    const e = this.e;
    const k = e.k;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      if (p.wait > 0) {
        p.wait -= dt;
        // 떨어지기 직전 부르르
        p.dx = rand(-1, 1) * k;
        continue;
      }
      p.vy += 2200 * k * dt;
      p.dx += p.vx * dt;
      p.dy += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.oy + p.dy > e.h + 300 * k) this.pieces.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.pieces) {
      ctx.save();
      ctx.translate(p.ox + p.dx + p.cx, p.oy + p.dy + p.cy);
      ctx.rotate(p.rot);
      ctx.drawImage(p.cv, -p.cx, -p.cy);
      ctx.restore();
    }
  }

  reset() {
    this.pieces = [];
  }
}

// ───────────── 16. 벌레 풀기: 작은 벌레들이 화면을 기어 다니며 갉아먹는다 ─────────────

interface Bug {
  x: number;
  y: number;
  a: number;
  speed: number;
  life: number;
  phase: number;
}

export class Bugs implements Weapon {
  private bugs: Bug[] = [];
  private chewSound = 0;

  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    const e = this.e;
    const k = e.k;
    const n = 1 + Math.floor(Math.random() * 5); // 1~5마리
    for (let i = 0; i < n; i++) {
      this.bugs.push({
        x: x + rand(-8, 8) * k,
        y: y + rand(-8, 8) * k,
        a: Math.random() * TAU,
        speed: rand(18, 50) * k, // 느리게, 제각각
        life: rand(7, 11),
        phase: Math.random() * 10,
      });
    }
    if (this.bugs.length > 140) this.bugs.splice(0, this.bugs.length - 140);
    e.sfx.chitter();
    return true;
  }

  /** 가장 가까운 벌레 (바퀴벌레가 쫓아감) */
  nearest(x: number, y: number, max: number): Pt | null {
    let best: Bug | null = null;
    let bd = max;
    for (const b of this.bugs) {
      const dd = Math.hypot(b.x - x, b.y - y);
      if (dd < bd) {
        bd = dd;
        best = b;
      }
    }
    return best;
  }

  /** 반경 안의 벌레를 먹어 없애고 먹은 수를 돌려준다 */
  eatNear(x: number, y: number, r: number) {
    const before = this.bugs.length;
    this.bugs = this.bugs.filter((b) => Math.hypot(b.x - x, b.y - y) >= r);
    return before - this.bugs.length;
  }

  update(dt: number) {
    const e = this.e;
    const k = e.k;
    const d = e.dctx;
    this.chewSound -= dt;
    for (let i = this.bugs.length - 1; i >= 0; i--) {
      const b = this.bugs[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.bugs.splice(i, 1);
        continue;
      }
      b.a += rand(-1, 1) * 5 * dt;
      b.x += Math.cos(b.a) * b.speed * dt;
      b.y += Math.sin(b.a) * b.speed * dt;
      // 화면 가장자리에서 되돌아옴
      if (b.x < 0 || b.x > e.w) b.a = Math.PI - b.a;
      if (b.y < 0 || b.y > e.h) b.a = -b.a;
      b.x = Math.min(e.w, Math.max(0, b.x));
      b.y = Math.min(e.h, Math.max(0, b.y));
      b.phase += dt * 25;

      // 갉아먹은 자리: 들쭉날쭉한 검은 구멍
      const hx = b.x + Math.cos(b.a) * 4 * k;
      const hy = b.y + Math.sin(b.a) * 4 * k;
      d.fillStyle = 'rgba(10,8,6,0.85)';
      d.beginPath();
      d.arc(hx + rand(-0.8, 0.8) * k, hy + rand(-0.8, 0.8) * k, rand(2, 3.2) * k, 0, TAU);
      d.fill();
      e.grid.markCircle(hx, hy, 0, dt * 0.4);
      if (Math.random() < dt * 4) {
        e.addParticle(
          particle({ x: hx, y: hy, vx: rand(-40, 40) * k, vy: rand(-60, 0) * k, life: 0.5, size: 1.5 * k, color: '140,120,90', gravity: 900 * k, square: true }),
        );
      }
      if (this.chewSound <= 0 && Math.random() < 0.02) {
        this.chewSound = 0.12;
        e.sfx.chew();
      }
    }
    if (this.bugs.length > 0) e.hits = Math.max(e.hits, 1);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const k = this.e.k;
    ctx.strokeStyle = '#140f0a';
    ctx.lineWidth = 0.9 * k;
    for (const b of this.bugs) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      // 다리
      for (let i = 0; i < 3; i++) {
        const sw = Math.sin(b.phase + i * 2) * 0.5;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo((1 - i) * 2 * k, 0);
          ctx.lineTo((1 - i) * 2 * k + Math.cos(side * 1.4 + sw) * 4.5 * k, side * 4 * k);
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#2b2116';
      ctx.beginPath();
      ctx.ellipse(-1 * k, 0, 4 * k, 2.4 * k, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#120d08';
      ctx.beginPath();
      ctx.arc(3.5 * k, 0, 1.6 * k, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  reset() {
    this.bugs = [];
  }
}
