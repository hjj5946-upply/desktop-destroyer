import { createCrack, strokeSegs, type Crack } from './crack';
import { Sfx } from './audio';

export type ToolId = 'hammer' | 'gun' | 'flame' | 'bomb';

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  life: number;
  max: number;
}

interface Flash {
  x: number;
  y: number;
  t: number;
  dur: number;
  r: number;
}

/**
 * 캔버스 기반 파괴 엔진
 *
 * 레이어 구조
 *   [스크린샷] → [damage 레이어(영구 흔적)] → [퍼지는 중인 균열] → [섬광/파편] → [비네트]
 *
 * 좌표계: 캔버스 픽셀. 캔버스 해상도는 "스크린샷 해상도"와 같게 만든다.
 *  (창이 아직 숨겨진 상태에서 만들어지므로 window.innerWidth를 쓰면 안 됨)
 */
export class DestroyEngine {
  readonly sfx = new Sfx();

  private readonly ctx: CanvasRenderingContext2D;
  private readonly damage: HTMLCanvasElement;
  private readonly dctx: CanvasRenderingContext2D;
  private readonly w: number;
  private readonly h: number;
  /** 해상도 보정 배율 (1080p = 1, 4K = 2) */
  private readonly k: number;

  private active: Crack[] = [];
  private shards: Shard[] = [];
  private flashes: Flash[] = [];
  private shake = 0;
  private hits = 0;

  private running = false;
  private raf = 0;
  private last = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly shot: ImageBitmap,
  ) {
    this.w = shot.width;
    this.h = shot.height;
    this.k = shot.height / 1080;
    canvas.width = this.w;
    canvas.height = this.h;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D를 사용할 수 없습니다');
    this.ctx = ctx;

    this.damage = document.createElement('canvas');
    this.damage.width = this.w;
    this.damage.height = this.h;
    const dctx = this.damage.getContext('2d');
    if (!dctx) throw new Error('Canvas 2D(damage)를 사용할 수 없습니다');
    this.dctx = dctx;
  }

  // ───────────── 외부 API ─────────────

  start() {
    if (this.running) return;
    this.running = true;
    this.draw(); // 창이 숨겨진 동안에도 첫 화면은 동기적으로 그려둔다
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** 모든 파괴 흔적을 지우고 원래 화면으로 되돌린다 (촬영 재시도용) */
  reset() {
    this.dctx.clearRect(0, 0, this.w, this.h);
    this.active = [];
    this.shards = [];
    this.flashes = [];
    this.shake = 0;
    this.hits = 0;
  }

  /** 클릭 좌표(clientX/Y)에 선택한 도구로 타격 */
  hit(tool: ToolId, clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const x = ((clientX - r.left) * this.w) / r.width;
    const y = ((clientY - r.top) * this.h) / r.height;

    switch (tool) {
      case 'hammer':
        this.hammer(x, y);
        break;
      // 2단계에서 gun / flame / bomb 추가 예정
      default:
        break;
    }
  }

  // ───────────── 도구: 망치 ─────────────

  private hammer(x: number, y: number) {
    const k = this.k;
    const scale = Math.min(this.w, this.h);

    // 퍼져나가는 균열
    this.active.push(createCrack(x, y, scale, k));

    // 충격 지점의 영구 흔적: 하얗게 갈린 부분 + 작은 유리 조각
    const g = this.dctx.createRadialGradient(x, y, 0, x, y, 34 * k);
    g.addColorStop(0, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    this.dctx.fillStyle = g;
    this.dctx.beginPath();
    this.dctx.arc(x, y, 34 * k, 0, Math.PI * 2);
    this.dctx.fill();

    this.dctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 16 * k;
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      const s = (1.5 + Math.random() * 3) * k;
      this.dctx.beginPath();
      this.dctx.moveTo(px, py);
      this.dctx.lineTo(px + (Math.random() * 2 - 1) * s, py + (Math.random() * 2 - 1) * s);
      this.dctx.lineTo(px + (Math.random() * 2 - 1) * s, py + (Math.random() * 2 - 1) * s);
      this.dctx.closePath();
      this.dctx.fill();
    }

    // 순간 섬광 + 화면 흔들림 + 튀는 파편 + 소리
    this.flashes.push({ x, y, t: 0, dur: 0.14, r: 150 * k });
    this.shake = Math.max(this.shake, 16 * k);
    this.spawnShards(x, y);
    this.hits += 1;
    this.sfx.crack();
  }

  private spawnShards(x: number, y: number) {
    const k = this.k;
    const n = 16 + Math.floor(Math.random() * 8);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (350 + Math.random() * 900) * k;
      const max = 0.5 + Math.random() * 0.6;
      this.shards.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 200 * k,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 18,
        size: (4 + Math.random() * 8) * k,
        life: max,
        max,
      });
    }
  }

  // ───────────── 프레임 루프 ─────────────

  private frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number) {
    const k = this.k;

    // 균열 퍼지기: 끝까지 퍼진 균열은 영구 레이어에 굳힌다
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      c.t += dt;
      const p = Math.min(1, c.t / c.dur);
      const ease = 1 - (1 - p) * (1 - p);
      const front = c.maxSd * ease;
      while (c.n < c.segs.length && c.segs[c.n].sd <= front) c.n++;
      if (p >= 1) {
        c.n = c.segs.length;
        strokeSegs(this.dctx, c.segs, c.n, k);
        this.active.splice(i, 1);
      }
    }

    // 파편
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.shards.splice(i, 1);
        continue;
      }
      s.vy += 2600 * k * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
    }

    // 섬광
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].t += dt;
      if (this.flashes[i].t >= this.flashes[i].dur) this.flashes.splice(i, 1);
    }

    // 화면 흔들림 감쇠
    this.shake *= Math.exp(-dt * 18);
    if (this.shake < 0.3) this.shake = 0;
  }

  private draw() {
    const { ctx, w, h, k } = this;

    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 2 * this.shake, (Math.random() - 0.5) * 2 * this.shake);
    }

    ctx.drawImage(this.shot, 0, 0, w, h);
    ctx.drawImage(this.damage, 0, 0);

    // 퍼지는 중인 균열
    for (const c of this.active) {
      strokeSegs(ctx, c.segs, c.n, k);
    }

    // 섬광 (밝게 겹치기)
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) {
      const a = 0.55 * (1 - f.t / f.dur);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // 튀는 유리 파편
    for (const s of this.shards) {
      const a = Math.max(0, s.life / s.max);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.beginPath();
      ctx.moveTo(0, -s.size);
      ctx.lineTo(s.size * 0.8, s.size * 0.7);
      ctx.lineTo(-s.size * 0.8, s.size * 0.7);
      ctx.closePath();
      ctx.fillStyle = `rgba(215,235,255,${0.5 * a})`;
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`;
      ctx.lineWidth = 1.2 * k;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // 비네트: 처음엔 없다가 부술수록 가장자리가 어두워진다 (흔들림 영향 없이)
    if (this.hits > 0) {
      const a = Math.min(0.5, this.hits * 0.02);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
