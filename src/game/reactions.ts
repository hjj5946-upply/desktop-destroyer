import type { DestroyEngine } from './engine';
import { CELL } from './grid';
import { burst, particle, rand } from './weapons/util';

/**
 * 무기 조합(연쇄 반응) 규칙표
 *
 * 무기는 공격할 때 e.react(속성, x, y, r)을 부른다. 그 범위 안에 `on` 플래그가 있는 셀이 있으면 규칙이 실행된다.
 * 새 규칙은 REACTIONS 배열에 한 줄 추가하면 된다. (필요하면 grid.ts의 CELL에 플래그 추가)
 *
 * 속성을 내는 무기
 *   smash    망치, 프레스, 중력해제
 *   fire     화염방사기, 레이저, 돋보기, 운석, 번개, 폭탄
 *   blast    폭탄, 운석, 핵폭탄
 *   cold     냉동총
 *   water    쓰나미
 *   electric 번개
 */

export type Element = 'smash' | 'fire' | 'blast' | 'cold' | 'water' | 'electric';

export interface ReactionHit {
  x: number;
  y: number;
  r: number;
  /** 범위 안에서 `on` 플래그가 있는 셀 번호 */
  cells: number[];
}

export interface Reaction {
  id: string;
  /** 이 속성의 공격이 */
  by: Element;
  /** 이 플래그가 있는 셀에 닿으면 */
  on: number;
  /** false면 꺼둔 규칙 (해당 무기 미구현 등) */
  enabled?: boolean;
  /** 반응이 일어났을 때 로그 문구 */
  log: string;
  /** 실행. 실제로 반응이 일어났으면 true (SCORE 보너스 + 로그. 망치는 기본 타격을 대신함) */
  run(e: DestroyEngine, hit: ReactionHit): boolean;
}

/** 한 번에 이펙트를 낼 최대 셀 수 (넓은 범위에서 파티클 폭주 방지) */
const MAX_FX_CELLS = 10;

export const REACTIONS: Reaction[] = [
  {
    // 얼음 + 망치 = 얼음 조각 (Phase A 이전부터 있던 동작을 규칙표로 옮김)
    id: 'ice-shatter',
    by: 'smash',
    on: CELL.FROZEN,
    log: 'ice.shatter(): cold storage corrupted',
    run: (e, h) => e.freeze.shatterAt(h.x, h.y),
  },
  {
    // 얼음 + 불 = 증기 (얼음이 녹아 물자국이 남는다)
    id: 'steam',
    by: 'fire',
    on: CELL.FROZEN,
    log: 'steam.exe started (ice + fire)',
    run: (e, h) => {
      const melted = e.freeze.meltAt(h.x, h.y, h.r);
      for (const p of melted) {
        e.grid.clearFlag(p.x, p.y, p.r + e.grid.size, CELL.FROZEN);
        e.grid.markCircle(p.x, p.y, p.r, 0, CELL.WET);
        steam(e, p.x, p.y, p.r, 26);
      }
      if (melted.length > 0) e.sfx.sizzle();
      return melted.length > 0;
    },
  },
  {
    // 불 + 냉기 = 불이 꺼지며 증기
    id: 'extinguish-cold',
    by: 'cold',
    on: CELL.BURNING,
    log: 'fire.kill(SIGCOLD)',
    run: (e, h) => extinguish(e, h),
  },
  {
    // 불 + 물 = 불이 꺼지며 증기
    id: 'extinguish-water',
    by: 'water',
    on: CELL.BURNING,
    log: 'fire.kill(SIGWATER)',
    run: (e, h) => extinguish(e, h),
  },
  {
    // 젖은 곳 + 불 = 물이 증발 (셀이 마른다)
    id: 'evaporate',
    by: 'fire',
    on: CELL.WET,
    log: 'drying... humidity -100%',
    run: (e, h) => {
      for (const i of h.cells) e.grid.clearCell(i, CELL.WET);
      for (const i of h.cells.slice(0, MAX_FX_CELLS)) {
        const c = e.grid.center(i);
        steam(e, c.x, c.y, e.grid.size * 0.5, 3);
      }
      return true;
    },
  },
  {
    // 폭발 + 폭탄 = 연쇄 폭발 (범위 안 폭탄의 도화선이 바로 탄다)
    id: 'chain-bomb',
    by: 'blast',
    on: CELL.BOMB,
    log: 'chain reaction: bomb.dll -> bomb.dll -> ...',
    run: (e, h) => e.chainBombs(h.x, h.y, h.r) > 0,
  },
  {
    // 번개 + 젖은 곳 = 감전 (물을 타고 전기가 번진다)
    id: 'shock',
    by: 'electric',
    on: CELL.WET,
    log: 'short circuit: water.sys + 220V',
    run: (e, h) => {
      const k = e.k;
      const picks = h.cells.sort(() => Math.random() - 0.5).slice(0, MAX_FX_CELLS);
      for (const i of picks) {
        const c = e.grid.center(i);
        arc(e, h.x, h.y, c.x, c.y);
        e.grid.markCircle(c.x, c.y, 0, 0.5);
        e.hitRoaches(c.x, c.y, 30 * k, true, 0);
      }
      e.sfx.sizzle();
      return true;
    },
  },
  // ── 아직 무기가 없어 꺼둔 규칙 (예시) ──
  // 기름 무기가 생기면 CELL.OIL을 추가하고 on을 바꾼 뒤 enabled를 지운다
  {
    id: 'oil-fire',
    by: 'fire',
    on: 0,
    enabled: false,
    log: 'oil + fire: this is fine',
    run: () => false,
  },
];

/** 불 꺼짐: 불탐 플래그 해제 + 증기 */
function extinguish(e: DestroyEngine, h: ReactionHit) {
  for (const i of h.cells) e.grid.clearCell(i, CELL.BURNING);
  for (const i of h.cells.slice(0, MAX_FX_CELLS)) {
    const c = e.grid.center(i);
    steam(e, c.x, c.y, e.grid.size * 0.5, 4);
  }
  e.sfx.sizzle();
  return true;
}

/** 하얀 증기: 위로 솟으며 퍼진다 */
function steam(e: DestroyEngine, x: number, y: number, r: number, n: number) {
  const k = e.k;
  for (let i = 0; i < n; i++) {
    e.addParticle(
      particle({
        x: x + rand(-r, r) * 0.7,
        y: y + rand(-r, r) * 0.7,
        vx: rand(-25, 25) * k,
        vy: -rand(50, 130) * k,
        life: rand(0.9, 1.8),
        size: rand(10, 22) * k,
        grow: 32 * k,
        drag: 1,
        color: '232,238,244',
        alpha: 0.3,
      }),
    );
  }
}

/** 감전 불꽃: 두 점 사이에 지그재그로 튀는 파란 불똥 */
function arc(e: DestroyEngine, x0: number, y0: number, x1: number, y1: number) {
  const k = e.k;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.min(40, Math.ceil(len / (14 * k)));
  for (let j = 0; j <= n; j++) {
    const t = j / n;
    e.addParticle(
      particle({
        x: x0 + (x1 - x0) * t + rand(-8, 8) * k,
        y: y0 + (y1 - y0) * t + rand(-8, 8) * k,
        life: rand(0.12, 0.3),
        size: rand(1.5, 3) * k,
        color: '160,200,255',
        additive: true,
      }),
    );
  }
  burst(e, x1, y1, 6, { color: '200,225,255', speed: [80, 300], life: [0.15, 0.35], size: [1, 2.5], additive: true });
}
