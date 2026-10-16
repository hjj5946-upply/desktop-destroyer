import type { DestroyEngine } from '../engine';

/**
 * 무기 모듈 공통: 무기 인터페이스 / 범용 파티클 / 화면 조각 이동 애니메이션
 *
 * 좌표는 모두 캔버스 px. 크기 값은 1080p 기준에 e.k를 곱해서 쓴다.
 */

export const TAU = Math.PI * 2;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export interface Pt {
  x: number;
  y: number;
}

/** 엔진에 꽂히는 무기 하나. 필요한 훅만 구현한다 */
export interface Weapon {
  /** 마우스 누름. true면 공격이 나간 것 (점수 1) */
  press?(x: number, y: number): boolean;
  /** 누르고 있는 동안 매 프레임 */
  hold?(x: number, y: number, dt: number): void;
  /** 마우스 뗌 */
  release?(): void;
  /** 선택 여부와 상관없이 매 프레임 */
  update?(dt: number): void;
  /** scene에 그리기 (흔들림 적용, 파티클 아래) */
  draw?(ctx: CanvasRenderingContext2D): void;
  /** scene 맨 위에 그리기 (흔들림 없음, 오버레이/글자) */
  drawTop?(ctx: CanvasRenderingContext2D): void;
  /** 화면 출력 단계를 통째로 대신 그린다 (CRT 등). 대신 그렸으면 true */
  present?(out: CanvasRenderingContext2D, scene: HTMLCanvasElement): boolean;
  /** Space 초기화 */
  reset?(): void;
  /** 탄약/연료 같은 자원 (없으면 무제한) */
  resource?(): ResourceInfo | null;
}

/** HUD 표시용 무기 자원. ammo = 탄창(칸 표시), fuel = 연료(막대 표시) */
export interface ResourceInfo {
  kind: 'ammo' | 'fuel';
  cur: number;
  max: number;
  /** 재장전/재충전 중 */
  reloading: boolean;
  /** 재장전 전체 시간 / 남은 시간 (초) */
  reloadDur: number;
  reloadLeft: number;
}

/** 범용 파티클 (가루, 불꽃, 물방울 등) */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  /** "r,g,b" */
  color: string;
  alpha: number;
  /** 아래로 당기는 가속도 (px/s², 음수면 위로) */
  gravity: number;
  /** 속도 감쇠 계수 */
  drag: number;
  /** 크기 증가 속도 (px/s) */
  grow: number;
  /** true면 밝게 겹치기 */
  additive: boolean;
  /** true면 네모 (가루/조각) */
  square: boolean;
}

export function particle(p: Partial<Particle> & Pick<Particle, 'x' | 'y' | 'color'>): Particle {
  const life = p.life ?? 0.5;
  return {
    vx: 0,
    vy: 0,
    size: 2,
    alpha: 1,
    gravity: 0,
    drag: 0,
    grow: 0,
    additive: false,
    square: false,
    ...p,
    life,
    max: p.max ?? life,
  };
}

/** 사방으로 튀는 파티클 여러 개 */
export function burst(
  e: DestroyEngine,
  x: number,
  y: number,
  n: number,
  o: {
    color: string | (() => string);
    speed: [number, number];
    life: [number, number];
    size: [number, number];
    gravity?: number;
    drag?: number;
    additive?: boolean;
    square?: boolean;
    up?: number;
  },
) {
  const k = e.k;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const sp = rand(o.speed[0], o.speed[1]) * k;
    e.addParticle(
      particle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (o.up ?? 0) * k,
        life: rand(o.life[0], o.life[1]),
        size: rand(o.size[0], o.size[1]) * k,
        color: typeof o.color === 'function' ? o.color() : o.color,
        gravity: (o.gravity ?? 0) * k,
        drag: o.drag ?? 0,
        additive: o.additive ?? false,
        square: o.square ?? false,
      }),
    );
  }
}

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D를 사용할 수 없습니다');
  return { c, ctx };
}

export function polyPath(pts: Pt[]) {
  const p = new Path2D();
  pts.forEach((q, i) => (i === 0 ? p.moveTo(q.x, q.y) : p.lineTo(q.x, q.y)));
  p.closePath();
  return p;
}

/**
 * 선(폴리라인)을 기준으로 화면을 두 쪽으로 나누는 영역.
 * line은 화면 밖까지 이어져 있어야 한다. side = +1 / -1 (선의 법선 방향 기준)
 */
export function halfPlane(line: Pt[], side: 1 | -1, far: number) {
  const a = line[0];
  const b = line[line.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (-(b.y - a.y) / len) * side;
  const ny = ((b.x - a.x) / len) * side;
  return polyPath([...line, { x: b.x + nx * far, y: b.y + ny * far }, { x: a.x + nx * far, y: a.y + ny * far }]);
}

/** 화면 조각 하나: 이 영역을 (dx, dy)만큼 밀고 (cx, cy) 기준으로 rot만큼 돌린다 */
export interface ShiftPiece {
  path: Path2D;
  dx: number;
  dy: number;
  rot?: number;
  cx?: number;
  cy?: number;
}

/**
 * 화면(base)을 조각으로 나눠 서서히 어긋나게 하는 애니메이션. 끝나면 그 상태로 굳는다.
 * 시작할 때 damage를 base에 합쳐서(flatten) 금도 같이 움직이게 한다.
 */
export class RegionShift {
  private t = 0;
  private snap: HTMLCanvasElement | null = null;

  constructor(
    private readonly e: DestroyEngine,
    private readonly pieces: ShiftPiece[],
    private readonly dur: number,
    private readonly gap = '#050505',
  ) {}

  /** 진행. 끝났으면 true */
  step(dt: number): boolean {
    const e = this.e;
    if (!this.snap) {
      e.flatten();
      const { c, ctx } = makeCanvas(e.w, e.h);
      ctx.drawImage(e.base, 0, 0);
      this.snap = c;
    }
    this.t = Math.min(this.dur, this.t + dt);
    const p = this.t / this.dur;
    const ease = 1 - (1 - p) ** 3;

    const b = e.bctx;
    b.save();
    b.fillStyle = this.gap;
    b.fillRect(0, 0, e.w, e.h);
    for (const pc of this.pieces) {
      b.save();
      b.translate(pc.dx * ease, pc.dy * ease);
      if (pc.rot && pc.cx !== undefined && pc.cy !== undefined) {
        b.translate(pc.cx, pc.cy);
        b.rotate(pc.rot * ease);
        b.translate(-pc.cx, -pc.cy);
      }
      b.clip(pc.path);
      b.drawImage(this.snap, 0, 0);
      b.restore();
    }
    b.restore();
    return p >= 1;
  }
}

/** 지그재그 선: a → b 사이를 step 간격으로 꺾으며 jitter만큼 옆으로 흔든다 */
export function zigzag(a: Pt, b: Pt, step: number, jitter: number): Pt[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(2, Math.ceil(len / step));
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const j = i === 0 || i === n ? 0 : rand(-jitter, jitter);
    pts.push({ x: a.x + (b.x - a.x) * t + nx * j, y: a.y + (b.y - a.y) * t + ny * j });
  }
  return pts;
}
