import type { DestroyEngine } from '../engine';
import { CRACK_STYLE, createCrack } from '../crack';
import { CELL } from '../grid';
import { burst, halfPlane, particle, pick, rand, RegionShift, TAU, type Pt, type Weapon } from './util';

// ───────────── 6. 드릴: 누르고 있으면 구멍이 점점 깊어지고 가루가 튄다 ─────────────

export class Drill implements Weapon {
  private spot: { x: number; y: number; depth: number; ang: number } | null = null;
  private crackTimer = 0;

  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    this.spot = { x, y, depth: 0, ang: 0 };
    this.crackTimer = 0.4;
    this.e.sfx.loopStart('drill');
    return true;
  }

  hold(x: number, y: number, dt: number) {
    const e = this.e;
    const k = e.k;
    let s = this.spot ?? { x, y, depth: 0, ang: 0 };
    // 움직이면 새 구멍 (조금 파인 상태에서 시작)
    if (Math.hypot(x - s.x, y - s.y) > 12 * k) s = { x, y, depth: s.depth * 0.3, ang: 0 };
    this.spot = s;
    s.depth = Math.min(6, s.depth + dt);
    s.ang += dt * 40;

    const d = e.dctx;
    const r = Math.min(30, 5 + s.depth * 5) * k;
    const a = Math.min(0.45, dt * 3);
    const g = d.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    g.addColorStop(0, `rgba(0,0,0,${Math.min(1, a * 2.2)})`);
    g.addColorStop(0.65, `rgba(22,22,24,${a})`);
    g.addColorStop(1, 'rgba(70,70,74,0)');
    d.fillStyle = g;
    d.beginPath();
    d.arc(s.x, s.y, r, 0, TAU);
    d.fill();

    // 회전하며 긁힌 자국
    d.strokeStyle = 'rgba(210,210,215,0.22)';
    d.lineWidth = 1 * k;
    for (let i = 0; i < 3; i++) {
      const st = s.ang + i * 2.1;
      d.beginPath();
      d.arc(s.x, s.y, r * rand(0.6, 1.15), st, st + 0.7);
      d.stroke();
    }

    // 회색 가루
    burst(e, s.x, s.y, Math.ceil(dt * 140), {
      color: pick(['225,220,210', '190,188,182', '240,240,236']),
      speed: [150, 480],
      life: [0.35, 0.8],
      size: [1.5, 3.5],
      gravity: 1600,
      drag: 1.5,
      square: true,
      up: 150,
    });

    // 깊어질수록 잔금이 생긴다
    this.crackTimer -= dt;
    if (this.crackTimer <= 0 && s.depth > 0.5) {
      this.crackTimer = 0.45;
      const scale = Math.min(e.w, e.h);
      e.addCrack(
        createCrack(s.x, s.y, scale * (0.03 + s.depth * 0.012), k, {
          rays: 2 + Math.floor(Math.random() * 3),
          width: 1.3,
          rings: false,
          style: CRACK_STYLE.pistol,
        }),
      );
    }

    e.grid.markCircle(s.x, s.y, r, dt * 1.5);
    e.shake = Math.max(e.shake, 2.2 * k);
    e.hits = Math.max(e.hits, 1);
    e.hitRoaches(s.x, s.y, 0);
  }

  release() {
    this.spot = null;
    this.e.sfx.loopStop('drill');
  }
}

// ───────────── 7. 레이저 커터: 드래그한 선을 따라 화면이 갈라지고 벌어진다 ─────────────

interface Seam {
  pts: Pt[];
  t: number;
  dur: number;
}

export class Laser implements Weapon {
  private path: Pt[] = [];
  private head: Pt | null = null;
  private seams: Seam[] = [];

  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    this.path = [{ x, y }];
    this.head = { x, y };
    this.e.sfx.loopStart('laser');
    return true;
  }

  hold(x: number, y: number, dt: number) {
    const e = this.e;
    const k = e.k;
    this.head = { x, y };
    const last = this.path[this.path.length - 1];
    if (Math.hypot(x - last.x, y - last.y) > 3 * k) {
      this.burn(last, { x, y });
      this.path.push({ x, y });
    }
    burst(e, x, y, Math.ceil(dt * 100), {
      color: pick(['255,190,90', '255,120,60', '255,240,200']),
      speed: [200, 650],
      life: [0.15, 0.45],
      size: [1.2, 2.6],
      gravity: 1800,
      additive: true,
    });
    e.hits = Math.max(e.hits, 1);
    e.hitRoaches(x, y, 14 * k, true);
  }

  /** 지나간 자리: 까맣게 탄 가장자리 + 달궈진 주황 선 */
  private burn(a: Pt, b: Pt) {
    const d = this.e.dctx;
    const k = this.e.k;
    d.lineCap = 'round';
    for (const [style, w] of [
      ['rgba(10,6,4,0.85)', 6],
      ['rgba(255,100,40,0.75)', 2.2],
      ['rgba(255,235,210,0.85)', 0.8],
    ] as const) {
      d.strokeStyle = style;
      d.lineWidth = w * k;
      d.beginPath();
      d.moveTo(a.x, a.y);
      d.lineTo(b.x, b.y);
      d.stroke();
    }
    this.e.grid.markPath([a, b], 1, CELL.BURNING);
    this.e.react('fire', b.x, b.y, 10 * k);
  }

  release() {
    const e = this.e;
    e.sfx.loopStop('laser');
    const path = this.path;
    this.path = [];
    this.head = null;
    if (path.length < 2) return;
    const a = path[0];
    const b = path[path.length - 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 80 * e.k) return; // 너무 짧으면 탄 자국만

    // 그린 선을 양 끝으로 화면 밖까지 늘려서 두 쪽으로 나눈다
    const far = (e.w + e.h) * 2;
    const ext = (p: Pt, q: Pt): Pt => {
      const len = Math.hypot(p.x - q.x, p.y - q.y) || 1;
      return { x: p.x + ((p.x - q.x) / len) * far, y: p.y + ((p.y - q.y) / len) * far };
    };
    const line = [ext(a, path[Math.min(3, path.length - 1)]), ...path, ext(b, path[Math.max(0, path.length - 4)])];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const gap = 9 * e.k;
    e.queueShift(
      new RegionShift(
        e,
        [
          { path: halfPlane(line, 1, far), dx: nx * gap, dy: ny * gap },
          { path: halfPlane(line, -1, far), dx: -nx * gap, dy: -ny * gap },
        ],
        0.45,
      ),
    );
    e.grid.markPath(line, 0.5);
    this.seams.push({ pts: line, t: 0, dur: 1.6 });
    e.shake = Math.max(e.shake, 9 * e.k);
    e.sfx.laserSplit();
  }

  update(dt: number) {
    for (let i = this.seams.length - 1; i >= 0; i--) {
      this.seams[i].t += dt;
      if (this.seams[i].t >= this.seams[i].dur) this.seams.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const k = this.e.k;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 갈라진 틈의 잔열
    for (const s of this.seams) {
      const a = 1 - s.t / s.dur;
      ctx.strokeStyle = `rgba(255,110,40,${0.6 * a})`;
      ctx.lineWidth = 5 * k;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      s.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    // 레이저 끝점
    if (this.head) {
      const { x, y } = this.head;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 22 * k);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,60,40,0.9)');
      g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 22 * k, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  reset() {
    this.seams = [];
  }
}

// ───────────── 18. 돋보기: 햇빛이 모여 연기가 나고 구멍이 서서히 타들어간다 ─────────────

export class Magnifier implements Weapon {
  private spot: { x: number; y: number; heat: number } | null = null;
  private burning = false;

  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    this.spot = { x, y, heat: 0 };
    return true;
  }

  hold(x: number, y: number, dt: number) {
    const e = this.e;
    const k = e.k;
    let s = this.spot ?? { x, y, heat: 0 };
    // 움직이면 초점이 옮겨가고 열은 절반만 남는다 (천천히 그으면 타는 줄이 생김)
    if (Math.hypot(x - s.x, y - s.y) > 6 * k) s = { x, y, heat: s.heat * 0.55 };
    this.spot = s;
    s.heat += dt;

    if (s.heat > 0.35 && Math.random() < dt * 18) {
      e.addParticle(
        particle({
          x: s.x + rand(-4, 4) * k,
          y: s.y,
          vx: rand(-20, 20) * k,
          vy: -rand(40, 90) * k,
          life: rand(1, 1.8),
          size: rand(6, 12) * k,
          grow: 22 * k,
          color: '150,150,150',
          alpha: 0.35,
          drag: 0.5,
        }),
      );
    }

    if (s.heat > 0.7) {
      if (!this.burning) {
        this.burning = true;
        e.sfx.loopStart('burn');
      }
      const d = e.dctx;
      const r = Math.min(28, 3 + (s.heat - 0.7) * 9) * k;
      const a = Math.min(0.5, dt * 2.5);
      const g = d.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      g.addColorStop(0, `rgba(5,3,2,${Math.min(1, a * 2)})`);
      g.addColorStop(0.6, `rgba(70,35,10,${a * 0.6})`);
      g.addColorStop(1, 'rgba(70,35,10,0)');
      d.fillStyle = g;
      d.beginPath();
      d.arc(s.x, s.y, r, 0, TAU);
      d.fill();
      e.grid.markCircle(s.x, s.y, r, dt, CELL.BURNING);
      e.react('fire', s.x, s.y, r);
      e.hits = Math.max(e.hits, 1);
    }

    if (s.heat > 1.5 && Math.random() < dt * 30) {
      const r = Math.min(28, 3 + (s.heat - 0.7) * 9) * k;
      const a = Math.random() * TAU;
      e.addParticle(
        particle({
          x: s.x + Math.cos(a) * r * 0.8,
          y: s.y + Math.sin(a) * r * 0.8,
          vy: -rand(60, 140) * k,
          life: rand(0.2, 0.45),
          size: rand(4, 8) * k,
          color: pick(['255,170,60', '255,110,30']),
          additive: true,
          grow: 6 * k,
        }),
      );
    }

    if (s.heat > 0.4) e.hitRoaches(s.x, s.y, 10 * k, true, 0);
  }

  release() {
    this.spot = null;
    if (this.burning) this.e.sfx.loopStop('burn');
    this.burning = false;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.e;
    if (e.tool !== 'magnifier') return;
    const k = e.k;
    const s = this.spot;
    const x = s ? s.x : e.aim.x;
    const y = s ? s.y : e.aim.y;
    const heat = s ? s.heat : 0;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 모인 햇빛 (누르면 점점 강해짐)
    const p = Math.min(1, 0.25 + heat * 0.5);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 24 * k);
    g.addColorStop(0, `rgba(255,255,235,${p})`);
    g.addColorStop(0.2, `rgba(255,230,150,${p * 0.7})`);
    g.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 24 * k, 0, TAU);
    ctx.fill();
    // 타는 가장자리 불씨
    if (s && heat > 0.7) {
      const r = Math.min(28, 3 + (heat - 0.7) * 9) * k;
      ctx.strokeStyle = `rgba(255,120,30,${0.5 + Math.random() * 0.3})`;
      ctx.lineWidth = 2.5 * k;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.9, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ───────────── 10. 냉동총: 서리와 얼음이 번지고 망치로 치면 얼음 조각으로 깨진다 ─────────────

interface Ice {
  x: number;
  y: number;
  r: number;
  max: number;
}

export class Freeze implements Weapon {
  private patches: Ice[] = [];
  private current: Ice | null = null;

  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    const k = this.e.k;
    const ice = { x, y, r: 0, max: rand(90, 120) * k };
    this.patches.push(ice);
    if (this.patches.length > 40) this.patches.shift();
    this.current = ice;
    this.e.sfx.freeze();
    return true;
  }

  /** 누르고 있으면 얼음이 더 넓게 번진다 */
  hold(x: number, y: number, dt: number) {
    const e = this.e;
    const k = e.k;
    if (this.current) this.current.max = Math.min(260 * k, this.current.max + dt * 70 * k);
    if (Math.random() < dt * 25) {
      e.addParticle(
        particle({
          x: x + rand(-20, 20) * k,
          y: y + rand(-20, 20) * k,
          vx: rand(-30, 30) * k,
          vy: rand(-30, 10) * k,
          life: rand(0.6, 1.2),
          size: rand(10, 20) * k,
          grow: 20 * k,
          color: '200,235,255',
          alpha: 0.25,
        }),
      );
    }
  }

  release() {
    this.current = null;
  }

  update(dt: number) {
    const e = this.e;
    const k = e.k;
    const d = e.dctx;
    for (const p of this.patches) {
      if (p.r >= p.max) continue;
      const nr = Math.min(p.max, p.r + dt * 150 * k);

      // 번지는 고리: 반투명한 하늘색 막
      d.fillStyle = 'rgba(205,235,255,0.2)';
      d.beginPath();
      d.arc(p.x, p.y, nr, 0, TAU);
      d.arc(p.x, p.y, p.r, 0, TAU, true);
      d.fill('evenodd');

      // 성에 결정 (깃털 모양)
      d.strokeStyle = 'rgba(240,250,255,0.55)';
      d.lineWidth = 0.9 * k;
      const n = Math.ceil(((nr - p.r) / k) * 0.7);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const rr = rand(p.r, nr);
        const x0 = p.x + Math.cos(a) * rr;
        const y0 = p.y + Math.sin(a) * rr;
        const len = rand(6, 16) * k;
        const x1 = x0 + Math.cos(a) * len;
        const y1 = y0 + Math.sin(a) * len;
        d.beginPath();
        d.moveTo(x0, y0);
        d.lineTo(x1, y1);
        for (const side of [-1, 1]) {
          const bx = x0 + Math.cos(a) * len * 0.5;
          const by = y0 + Math.sin(a) * len * 0.5;
          d.moveTo(bx, by);
          d.lineTo(bx + Math.cos(a + side * 0.7) * len * 0.4, by + Math.sin(a + side * 0.7) * len * 0.4);
        }
        d.stroke();
      }
      p.r = nr;
      // 얼리기만 (피해 없음). 판정용이라 셀 하나 정도 넉넉하게 칠한다
      e.grid.markCircle(p.x, p.y, p.r + e.grid.size * 0.75, 0, CELL.FROZEN);
      e.react('cold', p.x, p.y, p.r);
      e.freezeRoaches(p.x, p.y, p.r);
      e.hits = Math.max(e.hits, 1);
    }
  }

  /** 망치가 얼음을 치면 산산조각. 얼음이 있었으면 true */
  shatterAt(x: number, y: number) {
    const e = this.e;
    const k = e.k;
    const i = this.patches.findIndex((p) => Math.hypot(x - p.x, y - p.y) < p.r);
    if (i < 0) return false;
    const p = this.patches[i];
    this.patches.splice(i, 1);

    // 얼음 지우고 깨진 자국만 남김
    const d = e.dctx;
    d.save();
    d.globalCompositeOperation = 'destination-out';
    d.beginPath();
    d.arc(p.x, p.y, p.r, 0, TAU);
    d.fill();
    d.restore();
    e.addCrack(createCrack(x, y, p.r * 1.3, k, { rays: 10, width: 1.6, style: CRACK_STYLE.glass }));
    e.grid.clearFlag(p.x, p.y, p.r, CELL.FROZEN);
    e.grid.markCircle(p.x, p.y, p.r * 0.6, 1);

    e.spawnShards(p.x, p.y, Math.min(60, 18 + Math.floor(p.r / k / 4)));
    burst(e, p.x, p.y, 40, {
      color: '230,245,255',
      speed: [100, 700],
      life: [0.3, 0.8],
      size: [1.5, 4],
      gravity: 1500,
      square: true,
    });
    e.flashes.push({ x: p.x, y: p.y, t: 0, dur: 0.12, r: p.r * 1.5, color: '200,235,255' });
    e.shake = Math.max(e.shake, 12 * k);
    e.hitRoaches(p.x, p.y, p.r, false, 0);
    e.sfx.iceShatter();
    return true;
  }

  /** 불에 녹음: 불 범위(x, y, r)와 겹치는 얼음을 지우고 물자국을 남긴다. 녹은 얼음들을 돌려준다 */
  meltAt(x: number, y: number, r: number): { x: number; y: number; r: number }[] {
    const melted = this.patches.filter((p) => Math.hypot(x - p.x, y - p.y) < p.r + r);
    if (melted.length === 0) return melted;
    this.patches = this.patches.filter((p) => !melted.includes(p));
    if (this.current && melted.includes(this.current)) this.current = null;
    const d = this.e.dctx;
    for (const p of melted) {
      d.save();
      d.globalCompositeOperation = 'destination-out';
      d.beginPath();
      d.arc(p.x, p.y, p.r, 0, TAU);
      d.fill();
      d.restore();
      d.fillStyle = 'rgba(120,170,210,0.1)';
      d.beginPath();
      d.arc(p.x, p.y, p.r * 0.9, 0, TAU);
      d.fill();
    }
    return melted;
  }

  reset() {
    this.patches = [];
    this.current = null;
  }
}

// ───────────── 11. 산성액: 초록 액체가 번지며 화면이 녹아 흘러내린다 ─────────────

interface Drip {
  x: number;
  y: number;
  vy: number;
  w: number;
  life: number;
}

export class Acid implements Weapon {
  private drips: Drip[] = [];

  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    const e = this.e;
    const k = e.k;
    e.flatten(); // 금까지 같이 녹아내리도록

    // 초록 웅덩이
    const d = e.dctx;
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * TAU;
      const r = rand(0, 26) * k;
      d.fillStyle = i < 3 ? 'rgba(150,255,80,0.4)' : 'rgba(90,210,40,0.3)';
      d.beginPath();
      d.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, rand(14, 30) * k, rand(10, 22) * k, Math.random() * Math.PI, 0, TAU);
      d.fill();
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU;
      const r = rand(35, 80) * k;
      d.fillStyle = 'rgba(140,255,70,0.5)';
      d.beginPath();
      d.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, rand(1.5, 4) * k, 0, TAU);
      d.fill();
    }

    // 흘러내리는 줄기
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      this.drips.push({
        x: x + rand(-40, 40) * k,
        y: y + rand(-5, 20) * k,
        vy: rand(25, 70) * k,
        w: rand(7, 18) * k,
        life: rand(2.5, 5),
      });
    }
    if (this.drips.length > 80) this.drips.splice(0, this.drips.length - 80);

    burst(e, x, y, 16, {
      color: '150,255,90',
      speed: [80, 300],
      life: [0.3, 0.6],
      size: [2, 4],
      gravity: 1200,
      additive: true,
    });
    e.grid.markCircle(x, y, 60 * k, 1);
    e.hitRoaches(x, y, 45 * k, true);
    e.hits = Math.max(e.hits, 1);
    e.sfx.acid();
    return true;
  }

  update(dt: number) {
    const e = this.e;
    const k = e.k;
    const b = e.bctx;
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const dr = this.drips[i];
      dr.life -= dt;
      if (dr.life <= 0 || dr.y > e.h) {
        this.drips.splice(i, 1);
        continue;
      }
      const dy = dr.vy * dt;
      // 녹아내림: 머리 위쪽 화면을 아래로 끌어내려 번지게 한다
      const len = 50 * k;
      const sx = dr.x - dr.w / 2;
      b.drawImage(e.base, sx, dr.y - len, dr.w, len, sx, dr.y - len + dy, dr.w, len);
      // 지나간 자리 초록 얼룩
      e.dctx.fillStyle = 'rgba(120,255,60,0.06)';
      e.dctx.fillRect(sx, dr.y - dy, dr.w, dy * 2 + 1);

      dr.y += dy;
      dr.w = Math.max(3 * k, dr.w * (1 - dt * 0.12));
      if (Math.random() < dt * 3) {
        e.addParticle(
          particle({
            x: dr.x + rand(-dr.w, dr.w) * 0.4,
            y: dr.y,
            vy: -rand(20, 50) * k,
            life: rand(0.4, 0.9),
            size: rand(1.5, 3.5) * k,
            color: '170,255,110',
            additive: true,
          }),
        );
      }
      e.grid.markCircle(dr.x, dr.y, 0, dt * 1.5);
      e.hitRoaches(dr.x, dr.y, dr.w, true, 0);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const k = this.e.k;
    for (const dr of this.drips) {
      const g = ctx.createRadialGradient(dr.x, dr.y, 0, dr.x, dr.y, dr.w);
      g.addColorStop(0, 'rgba(200,255,150,0.9)');
      g.addColorStop(0.5, 'rgba(110,230,50,0.75)');
      g.addColorStop(1, 'rgba(60,160,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(dr.x, dr.y, dr.w * 0.6, dr.w * 0.8 + 2 * k, 0, 0, TAU);
      ctx.fill();
    }
  }

  reset() {
    this.drips = [];
  }
}

// ───────────── 12. 페인트탄: 알록달록한 페인트가 튀어 번진다 ─────────────

const PAINT = ['255,59,48', '255,149,0', '255,214,10', '52,199,89', '0,122,255', '175,82,222', '255,45,85', '90,200,250'];

export class Paint implements Weapon {
  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    const e = this.e;
    const k = e.k;
    const d = e.dctx;
    const col = pick(PAINT);
    const R = rand(32, 52) * k;

    d.fillStyle = `rgba(${col},0.93)`;
    // 가운데 덩어리 + 울퉁불퉁한 가장자리
    d.beginPath();
    d.arc(x, y, R * 0.7, 0, TAU);
    d.fill();
    const lobes = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < lobes; i++) {
      const a = Math.random() * TAU;
      const r = R * rand(0.35, 0.8);
      d.beginPath();
      d.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, R * rand(0.2, 0.42), 0, TAU);
      d.fill();
    }
    // 튄 방울 (바깥쪽으로 길쭉)
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * TAU;
      const r = R * rand(1, 3.2);
      const s = rand(1.5, 6) * k;
      d.beginPath();
      d.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, s * 1.8, s, a, 0, TAU);
      d.fill();
    }
    // 흘러내림
    const drips = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < drips; i++) {
      const dx = x + rand(-R * 0.6, R * 0.6);
      const w = rand(3, 8) * k;
      const len = rand(20, 90) * k;
      d.fillRect(dx - w / 2, y, w, len);
      d.beginPath();
      d.arc(dx, y + len, w * 0.7, 0, TAU);
      d.fill();
    }
    // 광택
    d.fillStyle = 'rgba(255,255,255,0.28)';
    d.beginPath();
    d.ellipse(x - R * 0.25, y - R * 0.3, R * 0.25, R * 0.12, -0.6, 0, TAU);
    d.fill();

    burst(e, x, y, 22, {
      color: col,
      speed: [200, 700],
      life: [0.3, 0.6],
      size: [2, 5],
      gravity: 1600,
    });
    e.grid.markCircle(x, y, R, 0.5);
    e.shake = Math.max(e.shake, 4 * k);
    e.hits += 1;
    e.hitRoaches(x, y, R * 0.8);
    e.sfx.paint();
    return true;
  }
}
