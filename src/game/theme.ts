import type { CrackTint } from './crack';

/**
 * 화면 뒤 세계 테마: 금이 간 틈의 속선 색과 글로우를 바꾼다 (T키로 순환)
 *
 * 지금은 "균열 선 + 틈 주변 글로우" 수준. 새로 생기는 균열부터 적용된다.
 * (파편이 떨어지며 뒤 세계가 드러나는 건 Phase D)
 */
export interface Theme extends CrackTint {
  id: string;
  label: string;
}

export const THEMES: Theme[] = [
  /** 검정: 기본 유리 금 그대로 */
  { id: 'void', label: 'VOID', glow: null, core: null },
  /** 우주: 보랏빛 성운 */
  { id: 'space', label: 'DEEP SPACE', glow: '140,110,255', core: 'rgba(205,190,255,0.95)' },
  /** 불바다: 틈 사이로 용암빛 */
  { id: 'inferno', label: 'INFERNO', glow: '255,90,20', core: 'rgba(255,175,80,0.95)' },
  /** 초록 코드: 매트릭스풍 */
  { id: 'code', label: 'THE CODE', glow: '0,255,110', core: 'rgba(140,255,170,0.95)' },
  /** 물속: 깊은 바다 */
  { id: 'abyss', label: 'ABYSS', glow: '0,170,255', core: 'rgba(150,225,255,0.95)' },
];
