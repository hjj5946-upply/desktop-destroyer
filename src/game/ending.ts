import type { DestroyEngine } from './engine';
import type { Crack } from './crack';
import { cutPiece } from './weapons/disasters';
import { makeCanvas, rand, TAU, type Pt } from './weapons/util';

/**
 * 엔딩 연출 2종 (엔진이 소유. 무기 drawTop보다 위에 그림)
 *
 *  RewindEnding  Space / 시간 되감기 무기: 균열이 중심으로 줄어들며 사라지고 파편이 돌아와 처음 화면으로
 *                (정확한 역재생 X. 굳은 균열 기록 + 단순 연출)
 *  ShatterEnding 100% 파괴 / 핵폭탄: 화면이 유리 조각으로 잘려 우수수 떨어진다
 *                창이 투명 + 클릭 통과로 바뀌면(엔진 revealing) 조각 뒤로 진짜 바탕화면이 보이고 자동 종료.
 *                전환에 실패하면 떨어진 뒤 깨끗한 스크린샷 (Space로 되감기 가능)
 *
 * ESC는 Rust 전역 단축키 + App keydown이 처리하므로 엔딩 중에도 그대로 동작한다.
 */

const ease3 = (p: number) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;
const smooth = (p: number) => {
  const q = Math.min(1, Math.max(0, p));
  return q * q * (3 - 2 * q);
};

// ───────────── 되감기 ─────────────

/** 전체 길이(초) */
const RW_DUR = 2.6;
/** 파편 한 개가 날아오는 시간 */
const RW_FLY = 0.65;

interface Returning {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  delay: number;
  rot: number;
  size: number;
}

export class RewindEnding {
  private t = -1;
  private keepScore = false;
  private snap: HTMLCanvasElement | null = null;
  private cracks: Crack[] = [];
  private shards: Returning[] = [];

  constructor(private readonly e: DestroyEngine) {}

  get active() {
    return this.t >= 0;
  }

  /** @param keepScore true면 끝난 뒤 SCORE/콤보 유지 (시간 되감기 무기) */
  start(keepScore: boolean) {
    if (this.active) return false;
    const e = this.e;
    const k = e.k;
    const { c, ctx } = makeCanvas(e.w, e.h);
    ctx.drawImage(e.scene, 0, 0);
    this.snap = c;
    this.cracks = e.crackLog.slice();
    this.keepScore = keepScore;

    // 흩어졌던 유리 파편이 충격점으로 돌아온다 (충격점이 없으면 화면 아무 데나)
    this.shards = [];
    for (let i = 0; i < 90; i++) {
      const src = this.cracks.length > 0 ? this.cracks[Math.floor(Math.random() * this.cracks.length)] : null;
      const tx = src ? src.cx : rand(0, e.w);
      const ty = src ? src.cy : rand(0, e.h);
      const a = Math.random() * TAU;
      const d = rand(250, 700) * k;
      this.shards.push({
        sx: tx + Math.cos(a) * d,
        sy: ty + Math.abs(Math.sin(a)) * d, // 아래로 떨어졌던 게 올라오는 느낌
        tx,
        ty,
        delay: rand(0.35, 1.1),
        rot: rand(-6, 6),
        size: rand(5, 12) * k,
      });
    }
    this.t = 0;
    e.sfx.rewind();
    return true;
  }

  update(dt: number) {
    if (this.t < 0) return;
    this.t += dt;
    if (this.t >= RW_DUR) {
      const keep = this.keepScore;
      this.reset();
      this.e.reset(keep); // 처음 화면으로 (이 엔딩의 reset도 같이 불림)
      this.e.sfx.rewindEnd();
    }
  }

  drawTop(ctx: CanvasRenderingContext2D) {
    if (this.t < 0 || !this.snap) return;
    const { w, h, k } = this.e;
    const t = this.t;

    // 1) 깨끗한 원래 화면 위로 부서진 화면이 서서히 걷힌다
    ctx.drawImage(this.e.shot, 0, 0, w, h);
    const snapA = 1 - smooth((t - 0.15) / 0.9);
    if (snapA > 0) {
      ctx.globalAlpha = snapA;
      ctx.drawImage(this.snap, 0, 0);
      ctx.globalAlpha = 1;
    }

    // 2) 균열이 각자의 충격점으로 줄어들며 사라짐 (균열 하나 = stroke 한 번으로 가볍게)
    const s = 1 - ease3((t - 0.3) / 1.7);
    if (s > 0.01) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = Math.min(1, s * 1.5);
      ctx.lineWidth = 1.6 * k * Math.max(0.3, s);
      for (const c of this.cracks) {
        ctx.strokeStyle = c.style.main;
        ctx.beginPath();
        for (const g of c.segs) {
          ctx.moveTo(c.cx + (g.x0 - c.cx) * s, c.cy + (g.y0 - c.cy) * s);
          ctx.lineTo(c.cx + (g.x1 - c.cx) * s, c.cy + (g.y1 - c.cy) * s);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3) 파편이 거꾸로 날아와 붙는다
    ctx.save();
    for (const p of this.shards) {
      const q = ease3((t - p.delay) / RW_FLY);
      if (q <= 0 || q >= 1) continue;
      ctx.save();
      ctx.translate(p.sx + (p.tx - p.sx) * q, p.sy + (p.ty - p.sy) * q);
      ctx.rotate(p.rot * (1 - q));
      ctx.fillStyle = `rgba(235,245,255,${0.85 * (1 - q * 0.6)})`;
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size * 0.8, p.size * 0.6);
      ctx.lineTo(-p.size * 0.7, p.size * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // 4) VHS 되감기 화면 (마지막 0.35초에 걷힘)
    const vhs = Math.min(1, (RW_DUR - t) / 0.35);
    ctx.save();
    ctx.globalAlpha = vhs;
    ctx.fillStyle = 'rgba(60,90,255,0.08)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let y = 0; y < h; y += 3 * k) ctx.fillRect(0, y, w, 1.2 * k);
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rand(0.03, 0.08)})`;
      ctx.fillRect(0, Math.random() * h, w, rand(2, 8) * k);
    }
    // 글자는 천천히 깜빡 (초당 1.5회)
    if (Math.floor(t * 3) % 2 === 0) {
      ctx.font = `bold ${30 * k}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(255,255,255,0.8)';
      ctx.shadowBlur = 10 * k;
      ctx.fillStyle = '#fff';
      ctx.fillText('◀◀ REWIND', w / 2, 90 * k);
    }
    ctx.restore();
  }

  reset() {
    this.t = -1;
    this.snap = null;
    this.cracks = [];
    this.shards = [];
  }
}

// ───────────── 유리 조각 낙하 ─────────────

interface Falling {
  cv: HTMLCanvasElement;
  ox: number;
  oy: number;
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

export class ShatterEnding {
  private phase: 'idle' | 'fall' | 'end' = 'idle';
  private t = 0;
  private pieces: Falling[] = [];

  constructor(private readonly e: DestroyEngine) {}

  get active() {
    return this.phase !== 'idle';
  }

  /** 조각이 다 떨어진 뒤 지난 시간 (아직이면 -1) */
  get endedFor() {
    return this.phase === 'end' ? this.t : -1;
  }

  /** 지금 화면을 조각으로 잘라 (x, y)부터 무너뜨린다. 밑은 깨끗한 원래 화면 */
  start(x: number, y: number) {
    if (this.active) return false;
    const e = this.e;
    const k = e.k;
    const { c: snap, ctx } = makeCanvas(e.w, e.h);
    ctx.drawImage(e.scene, 0, 0);
    e.clearAll();
    this.pieces = [];
    const cols = 9;
    const rows = 6;
    const grid: Pt[][] = [];
    for (let r = 0; r <= rows; r++) {
      const row: Pt[] = [];
      for (let c = 0; c <= cols; c++) {
        const edge = r === 0 || c === 0 || r === rows || c === cols;
        row.push({
          x: (c / cols) * e.w + (edge ? 0 : rand(-0.3, 0.3) * (e.w / cols)),
          y: (r / rows) * e.h + (edge ? 0 : rand(-0.3, 0.3) * (e.h / rows)),
        });
      }
      grid.push(row);
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = grid[r][c];
        const b = grid[r][c + 1];
        const cc = grid[r + 1][c + 1];
        const dd = grid[r + 1][c];
        // 사각형을 대각선으로 나눠 삼각형 조각 2개
        for (const poly of Math.random() < 0.5 ? [[a, b, cc], [a, cc, dd]] : [[a, b, dd], [b, cc, dd]]) {
          const pc = cutPiece(snap, poly);
          const fromCenter = Math.hypot(pc.ox + pc.cx - x, pc.oy + pc.cy - y) / Math.hypot(e.w, e.h);
          this.pieces.push({
            cv: pc.cv,
            ox: pc.ox,
            oy: pc.oy,
            cx: pc.cx,
            cy: pc.cy,
            dx: 0,
            dy: 0,
            vx: rand(-80, 80) * k,
            vy: rand(-100, 0) * k,
            rot: 0,
            vr: rand(-2.5, 2.5),
            wait: 0.3 + fromCenter * 1.6 + rand(0, 0.4), // 충격점부터 무너짐
          });
        }
      }
    }
    this.phase = 'fall';
    this.t = 0;
    e.sfx.shatterCascade();
    return true;
  }

  update(dt: number) {
    if (this.phase === 'idle') return;
    const e = this.e;
    const k = e.k;
    this.t += dt;
    if (this.phase !== 'fall') return;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      if (p.wait > 0) {
        p.wait -= dt;
        continue;
      }
      p.vy += 2000 * k * dt;
      p.dx += p.vx * dt;
      p.dy += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.oy + p.dy > e.h + 400 * k) this.pieces.splice(i, 1);
    }
    if (this.pieces.length === 0) {
      this.phase = 'end';
      this.t = 0;
    }
  }

  /** @param reveal true면 진짜 바탕화면 위 (재시작 안내 없이 곧 자동 종료) */
  drawTop(ctx: CanvasRenderingContext2D, reveal = false) {
    const { w, h, k } = this.e;
    if (this.phase === 'fall') {
      for (const p of this.pieces) {
        ctx.save();
        ctx.translate(p.ox + p.dx + p.cx, p.oy + p.dy + p.cy);
        ctx.rotate(p.rot);
        ctx.drawImage(p.cv, -p.cx, -p.cy);
        ctx.restore();
      }
    } else if (this.phase === 'end') {
      const a = Math.min(1, this.t / 1.2);
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${(reveal ? 0.35 : 0.55) * a})`;
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(255,255,255,0.8)';
      ctx.shadowBlur = 18 * k;
      ctx.fillStyle = `rgba(242,244,247,${a})`;
      ctx.font = `bold ${56 * k}px Consolas, monospace`;
      ctx.fillText('DESKTOP DESTROYED', w / 2, h / 2);
      ctx.shadowBlur = 0;
      ctx.font = `${16 * k}px Consolas, monospace`;
      ctx.fillStyle = `rgba(242,244,247,${0.7 * a})`;
      ctx.fillText(reveal ? 'GOODBYE' : 'SPACE  Rewind      ESC  Exit', w / 2, h / 2 + 50 * k);
      ctx.restore();
    }
  }

  reset() {
    this.phase = 'idle';
    this.t = 0;
    this.pieces = [];
  }
}
