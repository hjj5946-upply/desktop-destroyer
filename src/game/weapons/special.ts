import type { DestroyEngine } from '../engine';
import { CRACK_STYLE, createCrack } from '../crack';
import { makeCanvas, rand, TAU, type Weapon } from './util';

// ───────────── 13. 글리치 바이러스: 화면 줄이 어긋나고 RGB 색이 갈라진다 ─────────────

interface GlitchBurst {
  x: number;
  y: number;
  t: number;
  dur: number;
  tick: number;
}

export class Glitch implements Weapon {
  private bursts: GlitchBurst[] = [];
  private tmp: { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = [];

  constructor(private readonly e: DestroyEngine) {}

  press(x: number, y: number) {
    this.e.flatten();
    this.e.grid.markCircle(x, y, 200 * this.e.k, 0.4);
    this.bursts.push({ x, y, t: 0, dur: 1.4, tick: 0 });
    this.e.sfx.glitch();
    return true;
  }

  /** 띠 하나를 R과 GB로 나눠 서로 반대로 밀어서 색이 갈라지게 한다 */
  private rgbSplit(y0: number, bh: number, off: number) {
    const e = this.e;
    if (this.tmp.length === 0) {
      for (let i = 0; i < 3; i++) this.tmp.push(makeCanvas(e.w, 60 * e.k + 2));
    }
    const [src, red, cyan] = this.tmp;
    bh = Math.min(bh, src.c.height);
    src.ctx.clearRect(0, 0, e.w, bh);
    src.ctx.drawImage(e.base, 0, y0, e.w, bh, 0, 0, e.w, bh);
    for (const [t, color] of [
      [red, '#f00'],
      [cyan, '#0ff'],
    ] as const) {
      t.ctx.globalCompositeOperation = 'source-over';
      t.ctx.clearRect(0, 0, e.w, bh);
      t.ctx.drawImage(src.c, 0, 0, e.w, bh, 0, 0, e.w, bh);
      t.ctx.globalCompositeOperation = 'multiply';
      t.ctx.fillStyle = color;
      t.ctx.fillRect(0, 0, e.w, bh);
    }
    const b = e.bctx;
    b.save();
    b.fillStyle = '#000';
    b.fillRect(0, y0, e.w, bh);
    b.globalCompositeOperation = 'lighter';
    b.drawImage(red.c, 0, 0, e.w, bh, off, y0, e.w, bh);
    b.drawImage(cyan.c, 0, 0, e.w, bh, -off, y0, e.w, bh);
    b.restore();
  }

  update(dt: number) {
    const e = this.e;
    const k = e.k;
    const b = e.bctx;
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const g = this.bursts[i];
      g.t += dt;
      g.tick -= dt;
      if (g.tick <= 0) {
        g.tick = 0.04;
        for (let n = 0; n < 2; n++) {
          const bh = Math.floor(rand(4, 40) * k);
          const y0 = Math.floor(Math.min(e.h - bh, Math.max(0, g.y + rand(-260, 260) * k)));
          // 줄 밀림
          const dx = Math.floor(rand(-60, 60) * k);
          b.drawImage(e.base, 0, y0, e.w, bh, dx, y0, e.w, bh);
          // RGB 분리
          if (Math.random() < 0.5) this.rgbSplit(y0, bh, Math.floor(rand(3, 12) * k));
          // 블록 깨짐: 다른 곳 조각이 끼어듦
          if (Math.random() < 0.35) {
            const bw = rand(30, 160) * k;
            const bh2 = rand(10, 50) * k;
            b.drawImage(e.base, rand(0, e.w - bw), rand(0, e.h - bh2), bw, bh2, g.x + rand(-250, 250) * k, g.y + rand(-200, 200) * k, bw, bh2);
          }
        }
        e.shake = Math.max(e.shake, 2 * k);
      }
      e.hits = Math.max(e.hits, 1);
      if (g.t >= g.dur) this.bursts.splice(i, 1);
    }
  }

  drawTop(ctx: CanvasRenderingContext2D) {
    const k = this.e.k;
    for (const g of this.bursts) {
      // 노이즈 블록 + 주사선 (잠깐씩)
      for (let i = 0; i < 8; i++) {
        if (Math.random() < 0.5) continue;
        const c = [`255,0,80`, `0,255,200`, `255,255,255`, `80,80,255`][Math.floor(Math.random() * 4)];
        ctx.fillStyle = `rgba(${c},${rand(0.15, 0.5)})`;
        ctx.fillRect(g.x + rand(-260, 260) * k, g.y + rand(-220, 220) * k, rand(10, 120) * k, rand(2, 14) * k);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let y = g.y - 260 * k; y < g.y + 260 * k; y += 4 * k) ctx.fillRect(g.x - 300 * k, y, 600 * k, 1.5 * k);
    }
  }

  reset() {
    this.bursts = [];
  }
}

// ───────────── 19. CRT 전원 OFF: 화면이 가로선으로 줄어들었다가 점으로 꺼진다 ─────────────

const CRT_TOTAL = 2.7;

export class Crt implements Weapon {
  private t = -1;
  private on = false;

  constructor(private readonly e: DestroyEngine) {}

  press() {
    if (this.t >= 0) return false;
    this.t = 0;
    this.on = false;
    this.e.sfx.crtOff();
    return true;
  }

  update(dt: number) {
    if (this.t < 0) return;
    this.t += dt;
    if (!this.on && this.t >= 1.6) {
      this.on = true;
      this.e.sfx.crtOn();
    }
    if (this.t >= CRT_TOTAL) this.t = -1;
  }

  /**
   * 0.00~0.25 세로로 납작해져 가로선이 됨 → 0.25~0.45 가로선이 점으로 줄어듦 → 0.45~0.9 점이 사라짐
   * → 0.9~1.6 꺼진 화면 → 1.6~2.1 다시 켜짐 (점 → 선 → 화면) → 2.1~2.7 깜빡임이 가라앉음
   */
  present(out: CanvasRenderingContext2D, scene: HTMLCanvasElement) {
    if (this.t < 0) return false;
    const { w, h, k } = this.e;
    const t = this.t;
    const ease = (p: number) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;
    let sx = 1;
    let sy = 1;
    let glow = 0;
    let dot = 0;

    if (t < 0.25) {
      sy = Math.max(0.003, 1 - ease(t / 0.25));
      glow = t / 0.25;
    } else if (t < 0.45) {
      sy = 0.003;
      sx = Math.max(0.004, 1 - ease((t - 0.25) / 0.2));
      glow = 1;
    } else if (t < 0.9) {
      sx = sy = 0;
      dot = 1 - (t - 0.45) / 0.45;
    } else if (t < 1.6) {
      sx = sy = 0;
    } else if (t < 1.75) {
      sy = 0.003;
      sx = ease((t - 1.6) / 0.15);
      glow = 1;
    } else if (t < 2.1) {
      sy = Math.max(0.003, ease((t - 1.75) / 0.35));
      glow = 1 - (t - 1.75) / 0.35;
    }

    out.fillStyle = '#000';
    out.fillRect(0, 0, w, h);
    if (sx > 0 && sy > 0) {
      out.save();
      out.translate(w / 2, h / 2);
      out.scale(sx, sy);
      out.drawImage(scene, -w / 2, -h / 2);
      if (glow > 0) {
        out.globalCompositeOperation = 'lighter';
        out.fillStyle = `rgba(255,255,255,${glow * 0.8})`;
        out.fillRect(-w / 2, -h / 2, w, h);
      }
      out.restore();
      // 가는 선일 때 번지는 빛
      if (sy < 0.02) {
        out.save();
        out.globalCompositeOperation = 'lighter';
        const lw = w * sx;
        const g = out.createLinearGradient(0, h / 2 - 12 * k, 0, h / 2 + 12 * k);
        g.addColorStop(0, 'rgba(200,220,255,0)');
        g.addColorStop(0.5, 'rgba(230,240,255,0.9)');
        g.addColorStop(1, 'rgba(200,220,255,0)');
        out.fillStyle = g;
        out.fillRect(w / 2 - lw / 2, h / 2 - 12 * k, lw, 24 * k);
        out.restore();
      }
    }
    if (dot > 0) {
      out.save();
      out.globalCompositeOperation = 'lighter';
      const r = 16 * k * (0.4 + dot * 0.6);
      const g = out.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
      g.addColorStop(0, `rgba(255,255,255,${dot})`);
      g.addColorStop(1, 'rgba(180,200,255,0)');
      out.fillStyle = g;
      out.beginPath();
      out.arc(w / 2, h / 2, r, 0, TAU);
      out.fill();
      out.restore();
    }
    // 다시 켜진 직후 주사선 + 깜빡임
    if (t >= 1.75) {
      const fade = 1 - Math.min(1, (t - 1.75) / (CRT_TOTAL - 1.75));
      out.fillStyle = `rgba(0,0,0,${0.25 * fade})`;
      for (let y = 0; y < h; y += 3 * k) out.fillRect(0, y, w, 1.2 * k);
      if (Math.random() < 0.3 * fade) {
        out.fillStyle = `rgba(255,255,255,${0.08 * fade})`;
        out.fillRect(0, 0, w, h);
      }
    }
    return true;
  }

  reset() {
    this.t = -1;
  }
}

// ───────────── 20. 핵폭탄(필살기): 충전 → 섬광 → 충격파 → 버섯구름 → 초토화 → 엔딩 ─────────────

/** end = 유리 조각 엔딩으로 넘긴 뒤 (초기화 전까지 대기) */
type NukePhase = 'idle' | 'charge' | 'blast' | 'end';

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  age: number;
  life: number;
  /** 버섯 머리 소용돌이용 */
  cap: boolean;
  ang: number;
}

const CHARGE = 3.2;

export class Nuke implements Weapon {
  private phase: NukePhase = 'idle';
  private t = 0;
  private x = 0;
  private y = 0;
  private puffs: Puff[] = [];
  private beep = 0;

  constructor(private readonly e: DestroyEngine) {}

  /** 충전~엔딩 진행 중 (100% 엔딩이 끼어들지 않게) */
  get busy() {
    return this.phase !== 'idle';
  }

  press(x: number, y: number) {
    if (this.phase !== 'idle') return false;
    this.phase = 'charge';
    this.t = 0;
    this.x = x;
    this.y = y;
    this.beep = 0;
    return true;
  }

  private detonate() {
    const e = this.e;
    const k = e.k;
    const { x, y } = this;
    this.phase = 'blast';
    this.t = 0;

    // 초토화: 화면 전체를 갈색~검정으로 태움 (폭심에 가까울수록 진하게)
    const d = e.dctx;
    const far = Math.hypot(e.w, e.h);
    const g = d.createRadialGradient(x, y, 0, x, y, far);
    g.addColorStop(0, 'rgba(0,0,0,0.97)');
    g.addColorStop(0.15, 'rgba(20,10,4,0.9)');
    g.addColorStop(0.5, 'rgba(50,24,8,0.7)');
    g.addColorStop(1, 'rgba(60,30,10,0.55)');
    d.fillStyle = g;
    d.fillRect(0, 0, e.w, e.h);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU;
      const r = rand(0, far * 0.5);
      e.addCrack(createCrack(x + Math.cos(a) * r, y + Math.sin(a) * r, Math.min(e.w, e.h) * rand(0.15, 0.35), k, { rays: 8, width: 3, rings: false, style: CRACK_STYLE.char }));
    }

    for (let i = 0; i < 220; i++) {
      const a = Math.random() * TAU;
      const sp = rand(400, 1800) * k;
      e.fire.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: rand(30, 70) * k, life: rand(0.5, 1.1), max: 1.1, smoke: false });
    }
    e.blasts.push({ x, y, t: 0, dur: 1.2, r: 900 * k });
    e.rings.push({ x, y, t: 0, dur: 0.9, r: far * 1.2 });
    e.rings.push({ x, y, t: 0, dur: 1.6, r: far * 0.8 });
    e.grid.markAll();
    e.react('blast', x, y, far);
    e.impact(x, y, 1);
    e.shake = 80 * k;
    e.hits += 10;
    e.killAllRoaches();
    e.sfx.nukeBoom();
  }

  /** 공용 유리 조각 엔딩으로 넘긴다 (ending.ts). 핵폭탄은 Space/Shift+Space 전까지 다시 못 씀 */
  private startEnding() {
    this.phase = 'end';
    this.t = 0;
    this.puffs = [];
    this.e.startShatter(this.x, this.y);
  }

  update(dt: number) {
    const e = this.e;
    const k = e.k;
    if (this.phase === 'idle') return;
    this.t += dt;
    if (this.phase === 'end') return;

    if (this.phase === 'charge') {
      this.beep -= dt;
      if (this.beep <= 0) {
        this.beep = 0.5;
        e.sfx.alarm();
      }
      e.shake = Math.max(e.shake, (this.t / CHARGE) * 4 * k);
      if (this.t >= CHARGE) this.detonate();
      return;
    }

    if (this.phase === 'blast') {
      e.shake = Math.max(e.shake, 40 * k * Math.max(0, 1 - this.t / 2.5));
      // 버섯구름: 기둥은 위로 솟고, 머리는 말려 올라가며 퍼진다
      const capY = this.y - Math.min(420 * k, this.t * 260 * k);
      if (this.t < 4) {
        for (let i = 0; i < 4; i++) {
          this.puffs.push({
            x: this.x + rand(-25, 25) * k,
            y: this.y,
            vx: rand(-15, 15) * k,
            vy: -rand(180, 280) * k,
            r: rand(25, 45) * k,
            age: 0,
            life: rand(4, 6),
            cap: false,
            ang: 0,
          });
        }
        for (let i = 0; i < 3; i++) {
          this.puffs.push({
            x: this.x,
            y: capY,
            vx: 0,
            vy: 0,
            r: rand(40, 80) * k,
            age: 0,
            life: rand(4, 7),
            cap: true,
            ang: Math.random() * TAU,
          });
        }
      }
      for (let i = this.puffs.length - 1; i >= 0; i--) {
        const p = this.puffs[i];
        p.age += dt;
        if (p.age >= p.life) {
          this.puffs.splice(i, 1);
          continue;
        }
        if (p.cap) {
          // 도넛 모양으로 말리며 바깥으로 퍼짐
          p.ang += dt * 1.5;
          const spread = Math.min(260 * k, 60 * k + p.age * 90 * k);
          p.x = this.x + Math.cos(p.ang) * spread;
          p.y = capY + Math.sin(p.ang) * spread * 0.35 - p.age * 12 * k;
          p.r += dt * 18 * k;
        } else {
          if (p.y > capY) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
          }
          p.r += dt * 10 * k;
        }
      }
      if (this.puffs.length > 700) this.puffs.splice(0, this.puffs.length - 700);
      if (this.t >= 6.5) this.startEnding();
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.phase !== 'blast') return;
    // 버섯구름: 뜨거울 땐 주황, 식으면서 잿빛
    for (const p of this.puffs) {
      const heat = Math.max(0, 1 - p.age / 1.6);
      const fade = Math.min(1, (p.life - p.age) / 1.5);
      const r = Math.round(70 + heat * 185);
      const g = Math.round(62 + heat * 90);
      const b = Math.round(58 - heat * 30);
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grad.addColorStop(0, `rgba(${r},${g},${b},${0.55 * fade})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
  }

  drawTop(ctx: CanvasRenderingContext2D) {
    const e = this.e;
    const { w, h, k } = e;

    if (this.phase === 'charge') {
      const p = this.t / CHARGE;
      // 붉은 경고 비네트
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 12);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(255,0,0,${0.15 + pulse * 0.25})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // 조준 표시
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.t * 2);
      ctx.strokeStyle = `rgba(255,50,40,${0.6 + pulse * 0.4})`;
      ctx.lineWidth = 3 * k;
      const s = (60 - p * 30) * k;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(s, s * 0.5);
        ctx.lineTo(s, s);
        ctx.lineTo(s * 0.5, s);
        ctx.stroke();
      }
      ctx.restore();
      // 경고 글자 + 카운트다운
      ctx.textAlign = 'center';
      ctx.font = `bold ${30 * k}px Consolas, monospace`;
      ctx.fillStyle = `rgba(255,60,50,${0.6 + pulse * 0.4})`;
      ctx.fillText('⚠  NUCLEAR STRIKE INCOMING  ⚠', w / 2, h * 0.16);
      ctx.font = `bold ${64 * k}px Consolas, monospace`;
      ctx.fillText(String(Math.max(1, Math.ceil(CHARGE - this.t))), w / 2, h * 0.16 + 80 * k);
      // 떨어지는 미사일 (마지막 0.8초)
      const mt = (this.t - (CHARGE - 0.8)) / 0.8;
      if (mt > 0) {
        const my = -60 * k + (this.y + 60 * k) * mt;
        ctx.fillStyle = '#d0d4da';
        ctx.fillRect(this.x - 6 * k, my - 50 * k, 12 * k, 44 * k);
        ctx.beginPath();
        ctx.moveTo(this.x - 6 * k, my - 6 * k);
        ctx.lineTo(this.x + 6 * k, my - 6 * k);
        ctx.lineTo(this.x, my + 8 * k);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,170,60,0.8)';
        ctx.beginPath();
        ctx.arc(this.x, my - 56 * k, 6 * k, 0, TAU);
        ctx.fill();
      }
      return;
    }

    if (this.phase === 'blast') {
      // 눈부신 섬광: 0.4초 하얗게 → 1.2초에 걸쳐 걷힘
      const a = this.t < 0.4 ? 1 : Math.max(0, 1 - (this.t - 0.4) / 1.2);
      if (a > 0) {
        ctx.fillStyle = `rgba(255,250,240,${a})`;
        ctx.fillRect(0, 0, w, h);
      }
      return;
    }
    // 'end' 이후 조각 낙하 / DESKTOP DESTROYED 화면은 ending.ts의 ShatterEnding이 그린다
  }

  reset() {
    this.phase = 'idle';
    this.t = 0;
    this.puffs = [];
  }
}
