/**
 * 콤보 + SCORE (무기 해금용 누적 점수와는 별개)
 *
 * - 공격이 나가면 hit(). 콤보 유지 시간 안에 다시 치면 콤보 +1, 넘기면 1부터 다시
 * - 누르고 있는 무기(화염방사기, 드릴, M4A1 연사 등)는 hitHeld(): HOLD_STEP초에 한 번만 콤보가 오른다
 * - 점수는 타격 + 새로 부서진 셀. 둘 다 콤보 배율을 곱한다
 */

/** 이 시간(초) 안에 다시 쳐야 콤보 유지 */
export const COMBO_WINDOW = 1.2;
/** 누르고 있는 무기의 콤보 증가 간격(초) */
export const HOLD_STEP = 0.3;
/** 타격 1회 점수 */
export const HIT_POINTS = 10;
/** 셀 1개 파괴 점수 */
export const CELL_POINTS = 5;
/** 조합 반응 1회 보너스 */
export const REACTION_POINTS = 30;
/** 콤보 1단계당 배율 증가 / 최대 배율 */
const MULT_STEP = 0.1;
const MULT_MAX = 3;

export class ComboScore {
  score = 0;
  combo = 0;
  /** 콤보가 끊기기까지 남은 시간 */
  private timer = 0;
  /** 마지막으로 콤보가 오른 뒤 지난 시간 */
  private since = Infinity;

  get mult() {
    return Math.min(MULT_MAX, 1 + Math.max(0, this.combo - 1) * MULT_STEP);
  }

  hit() {
    this.combo = this.timer > 0 ? this.combo + 1 : 1;
    this.timer = COMBO_WINDOW;
    this.since = 0;
    this.score += Math.round(HIT_POINTS * this.mult);
  }

  /** 누르고 있는 동안 매 프레임 불러도 HOLD_STEP초에 한 번만 오른다 */
  hitHeld() {
    if (this.since >= HOLD_STEP) this.hit();
  }

  /** 조합 반응 등 보너스 (콤보 배율 적용) */
  bonus(points: number) {
    this.score += Math.round(points * this.mult);
  }

  addCells(n: number) {
    this.score += Math.round(n * CELL_POINTS * this.mult);
  }

  update(dt: number) {
    this.since += dt;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.combo = 0;
    }
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.timer = 0;
    this.since = Infinity;
  }
}
