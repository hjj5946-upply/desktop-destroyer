import type { Seg } from './crack';
import type { Pt } from './weapons/util';

/**
 * 격자 상태 맵: 화면을 일정 크기 셀로 나누고 셀마다 피해량과 상태 플래그를 저장한다.
 *
 * - 셀은 피해(0~1)를 누적하다가 1이 되면 BROKEN. 부서진 셀 수는 칠할 때만 증가시킨다 (매 프레임 재계산 안 함)
 * - 파괴율, 무기 조합 판정(Phase C), 엔딩 조건이 공통으로 사용한다.
 * - 좌표는 캔버스 px.
 */

/** 셀 상태 플래그 (비트) */
export const CELL = {
  BROKEN: 1,
  FROZEN: 2,
  BURNING: 4,
  WET: 8,
  /** 폭탄이 놓여 있음 (터지면 지움) */
  BOMB: 16,
} as const;

/** 시간이 지나면 저절로 꺼지는 플래그와 수명(초, 게임 시간). 칠할 때마다 수명이 다시 찬다 */
const TEMP_FLAGS = [
  { flag: CELL.BURNING, life: 4 },
  { flag: CELL.WET, life: 20 },
];

/** 셀 한 변 길이 (1080p 기준 px, k를 곱해서 씀) */
export const CELL_PX = 48;
/** 전체 셀 중 이 비율이 BROKEN이면 파괴율 100% (망치로 20~30초 목표. 올리면 오래 걸림) */
export const BREAK_GOAL = 0.6;
/** 균열 선이 지나간 셀이 받는 피해 (균열 하나당 셀마다 한 번만, 4번 지나가면 파괴) */
export const CRACK_DMG = 0.25;

export class DamageGrid {
  readonly cols: number;
  readonly rows: number;
  readonly size: number;
  readonly total: number;
  /** 누적 피해 (1 이상이면 부서짐) */
  private readonly hp: Float32Array;
  readonly flags: Uint8Array;
  /** 한 번의 칠하기에서 같은 셀을 두 번 치지 않기 위한 표시 */
  private readonly stamp: Uint32Array;
  private stampId = 0;
  /** 부서진 셀 수 */
  broken = 0;
  /** 마지막으로 읽은 뒤 새로 부서진 셀 수 (엔진이 점수로 바꾸고 0으로 돌림) */
  fresh = 0;
  /** TEMP_FLAGS별 셀 남은 수명 */
  private readonly lives: Float32Array[];

  constructor(w: number, h: number, k: number) {
    this.size = CELL_PX * k;
    this.cols = Math.ceil(w / this.size);
    this.rows = Math.ceil(h / this.size);
    this.total = this.cols * this.rows;
    this.hp = new Float32Array(this.total);
    this.flags = new Uint8Array(this.total);
    this.stamp = new Uint32Array(this.total);
    this.lives = TEMP_FLAGS.map(() => new Float32Array(this.total));
  }

  /** 임시 플래그 수명 감소 (게임 시간) */
  update(dt: number) {
    TEMP_FLAGS.forEach(({ flag }, n) => {
      const life = this.lives[n];
      for (let i = 0; i < this.total; i++) {
        if (!(this.flags[i] & flag)) continue;
        life[i] -= dt;
        if (life[i] <= 0) this.flags[i] &= ~flag;
      }
    });
  }

  /** 셀 중심 좌표 */
  center(i: number): Pt {
    const c = i % this.cols;
    const r = (i - c) / this.cols;
    return { x: (c + 0.5) * this.size, y: (r + 0.5) * this.size };
  }

  /** 원 안(셀 중심 기준 + 중심 셀)에서 flag가 있는 셀 번호들 */
  cellsWith(x: number, y: number, r: number, flag: number) {
    const out: number[] = [];
    this.forCircle(x, y, r, (i) => {
      if (this.flags[i] & flag) out.push(i);
    });
    return out;
  }

  /** 셀 하나의 플래그 끄기 */
  clearCell(i: number, flag: number) {
    this.flags[i] &= ~flag;
  }

  private forCircle(x: number, y: number, r: number, fn: (i: number) => void) {
    const s = this.size;
    const c0 = Math.max(0, Math.floor((x - r) / s));
    const c1 = Math.min(this.cols - 1, Math.floor((x + r) / s));
    const r0 = Math.max(0, Math.floor((y - r) / s));
    const r1 = Math.min(this.rows - 1, Math.floor((y + r) / s));
    const center = this.index(x, y);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const i = row * this.cols + col;
        const dx = (col + 0.5) * s - x;
        const dy = (row + 0.5) * s - y;
        if (i === center || dx * dx + dy * dy <= r * r) fn(i);
      }
    }
  }

  /** 파괴율 0~100 */
  get percent() {
    return Math.min(100, (this.broken / (this.total * BREAK_GOAL)) * 100);
  }

  reset() {
    this.hp.fill(0);
    this.flags.fill(0);
    this.stamp.fill(0);
    for (const l of this.lives) l.fill(0);
    this.stampId = 0;
    this.broken = 0;
    this.fresh = 0;
  }

  /** 좌표가 들어 있는 셀 번호 (화면 밖이면 -1) */
  index(x: number, y: number) {
    const c = Math.floor(x / this.size);
    const r = Math.floor(y / this.size);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  has(x: number, y: number, flag: number) {
    const i = this.index(x, y);
    return i >= 0 && (this.flags[i] & flag) !== 0;
  }

  private hit(i: number, dmg: number, flag: number) {
    if (flag) {
      this.flags[i] |= flag;
      TEMP_FLAGS.forEach((t, n) => {
        if (flag & t.flag) this.lives[n][i] = t.life;
      });
    }
    if (dmg <= 0 || this.flags[i] & CELL.BROKEN) return;
    this.hp[i] += dmg;
    if (this.hp[i] >= 1) {
      this.flags[i] |= CELL.BROKEN;
      this.broken += 1;
      this.fresh += 1;
    }
  }

  /** 원 안(셀 중심 기준) + 중심이 들어 있는 셀 */
  markCircle(x: number, y: number, r: number, dmg = 1, flag = 0) {
    this.forCircle(x, y, r, (i) => this.hit(i, dmg, flag));
  }

  /** 사각형과 겹치는 셀 전부 */
  markRect(x: number, y: number, w: number, h: number, dmg = 1, flag = 0) {
    const s = this.size;
    const c0 = Math.max(0, Math.floor(x / s));
    const c1 = Math.min(this.cols - 1, Math.floor((x + w) / s));
    const r0 = Math.max(0, Math.floor(y / s));
    const r1 = Math.min(this.rows - 1, Math.floor((y + h) / s));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) this.hit(row * this.cols + col, dmg, flag);
    }
  }

  /** 화면 전체 파괴 (핵폭탄) */
  markAll() {
    for (let i = 0; i < this.total; i++) this.hit(i, 1, 0);
  }

  /** 선분을 따라 지나가는 셀 (한 번 호출에서 셀마다 한 번만) */
  private line(x0: number, y0: number, x1: number, y1: number, dmg: number, flag: number, id: number) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / (this.size * 0.5)));
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      const i = this.index(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      if (i < 0 || this.stamp[i] === id) continue;
      this.stamp[i] = id;
      this.hit(i, dmg, flag);
    }
  }

  private nextStamp() {
    this.stampId = (this.stampId + 1) >>> 0 || 1;
    return this.stampId;
  }

  /** 균열 선분들 (균열 하나 = 한 번 호출) */
  markSegs(segs: Seg[], dmg = CRACK_DMG, flag = 0) {
    const id = this.nextStamp();
    for (const s of segs) this.line(s.x0, s.y0, s.x1, s.y1, dmg, flag, id);
  }

  /** 꺾은선 (지진 단층, 레이저 절단선 등) */
  markPath(pts: Pt[], dmg = 1, flag = 0) {
    const id = this.nextStamp();
    for (let i = 1; i < pts.length; i++) this.line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, dmg, flag, id);
  }

  /** 원 안의 플래그만 지운다 (얼음이 깨지면 FROZEN 해제 등) */
  clearFlag(x: number, y: number, r: number, flag: number) {
    const s = this.size;
    const c0 = Math.max(0, Math.floor((x - r) / s));
    const c1 = Math.min(this.cols - 1, Math.floor((x + r) / s));
    const r0 = Math.max(0, Math.floor((y - r) / s));
    const r1 = Math.min(this.rows - 1, Math.floor((y + r) / s));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) this.flags[row * this.cols + col] &= ~flag;
    }
  }
}
