/**
 * 유리 금(crack) 생성 + 그리기
 *
 * 구조: 충격 지점에서 사방으로 뻗는 "방사형 균열" + 그 사이를 잇는 "원형 균열"
 *  - 균열은 선분(Seg) 여러 개로 이뤄지고, 각 선분은 충격점에서의 거리(sd)를 가진다.
 *  - 시간이 지나면서 "균열 선두(front)"가 바깥으로 퍼지고, sd <= front 인 선분만 그려진다.
 *  - 다 퍼지면 영구 레이어(damage canvas)에 굳혀서 저장한다.
 */

export interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 선 굵기 (CSS px 기준, 그릴 때 k를 곱함) */
  w: number;
  /** 충격점에서의 거리 (균열이 퍼지는 순서를 결정) */
  sd: number;
}

/** 균열 색 (무기마다 다르게) */
export interface CrackStyle {
  /** 그림자 (null이면 생략) */
  shadow: string | null;
  /** 바깥 선 */
  main: string;
  /** 가운데 가는 속선 (null이면 생략) */
  core: string | null;
  /** 속선 굵기 비율 */
  coreScale: number;
}

export const CRACK_STYLE = {
  /** 망치: 하얀 유리 금 + 푸른 속선 */
  glass: { shadow: 'rgba(0,0,0,0.5)', main: 'rgba(255,255,255,0.88)', core: 'rgba(185,225,255,0.95)', coreScale: 0.4 },
  /** 권총: 가늘고 차가운 회백색 */
  pistol: { shadow: 'rgba(0,0,0,0.35)', main: 'rgba(220,226,232,0.78)', core: null, coreScale: 0 },
  /** 소총: 굵은 흰 금 + 열기 먹은 주황 속선 */
  rifle: { shadow: 'rgba(0,0,0,0.6)', main: 'rgba(255,255,255,0.92)', core: 'rgba(255,200,130,0.85)', coreScale: 0.35 },
  /** 폭탄: 시커멓게 탄 금 + 불씨 */
  char: { shadow: null, main: 'rgba(18,10,5,0.88)', core: 'rgba(255,120,30,0.55)', coreScale: 0.3 },
} satisfies Record<string, CrackStyle>;

export interface Crack {
  style: CrackStyle;
  /** sd 오름차순으로 정렬된 선분들 */
  segs: Seg[];
  maxSd: number;
  /** 경과 시간(초) / 퍼지는 데 걸리는 시간(초) */
  t: number;
  dur: number;
  /** 지금까지 그려도 되는 선분 개수 */
  n: number;
  /** 충격 중심 (되감기 엔딩에서 균열이 이쪽으로 줄어든다) */
  cx: number;
  cy: number;
}

interface Pt {
  d: number;
  x: number;
  y: number;
}

/**
 * @param cx,cy 충격 위치 (캔버스 픽셀)
 * @param scale 화면 짧은 변 길이 (균열 길이 기준)
 * @param k     해상도 보정 배율 (1080p = 1)
 */
export function createCrack(
  cx: number,
  cy: number,
  scale: number,
  k: number,
  opts: { rays?: number; width?: number; rings?: boolean; style?: CrackStyle } = {},
): Crack {
  const segs: Seg[] = [];
  const rayCount = opts.rays ?? 8 + Math.floor(Math.random() * 5);
  const width = opts.width ?? 2.6;
  const base = Math.random() * Math.PI * 2;
  const rays: Pt[][] = [];

  // 한 줄기 균열: 조금씩 꺾이며 뻗고, 가끔 가지를 친다
  const walk = (
    sx: number,
    sy: number,
    angle: number,
    len: number,
    w: number,
    d0: number,
    depth: number,
    record?: Pt[],
  ) => {
    let x = sx;
    let y = sy;
    let a = angle;
    let d = 0;
    while (d < len) {
      const step = (12 + Math.random() * 22) * k;
      a += (Math.random() - 0.5) * 0.4;
      const nx = x + Math.cos(a) * step;
      const ny = y + Math.sin(a) * step;
      segs.push({ x0: x, y0: y, x1: nx, y1: ny, w: w * (1 - 0.65 * (d / len)), sd: d0 + d });
      d += step;
      x = nx;
      y = ny;
      record?.push({ d, x, y });

      if (depth < 2 && Math.random() < 0.14) {
        const side = Math.random() < 0.5 ? -1 : 1;
        walk(x, y, a + side * (0.5 + Math.random() * 0.7), len * (0.2 + Math.random() * 0.3), w * 0.6, d0 + d, depth + 1);
      }
    }
  };

  for (let i = 0; i < rayCount; i++) {
    const pts: Pt[] = [];
    const angle = base + (i * Math.PI * 2) / rayCount + (Math.random() - 0.5) * 0.35;
    walk(cx, cy, angle, scale * (0.25 + Math.random() * 0.4), width, 0, 0, pts);
    rays.push(pts);
  }

  // 원형 균열: 이웃한 방사형 균열 사이를 같은 거리에서 이어준다
  const radii = opts.rings === false ? [] : [0.05, 0.1, 0.17, 0.26].map((r) => r * scale);
  const pick = (pts: Pt[], r: number) => pts.find((p) => p.d >= r);
  for (const R of radii) {
    for (let i = 0; i < rayCount; i++) {
      if (Math.random() > 0.7) continue;
      const p = pick(rays[i], R);
      const q = pick(rays[(i + 1) % rayCount], R);
      if (!p || !q) continue;
      const mx = (p.x + q.x) / 2 + (Math.random() - 0.5) * 14 * k;
      const my = (p.y + q.y) / 2 + (Math.random() - 0.5) * 14 * k;
      segs.push({ x0: p.x, y0: p.y, x1: mx, y1: my, w: 1.3, sd: R });
      segs.push({ x0: mx, y0: my, x1: q.x, y1: q.y, w: 1.3, sd: R });
    }
  }

  segs.sort((a, b) => a.sd - b.sd);
  const maxSd = segs.length > 0 ? segs[segs.length - 1].sd : 0;
  return { style: opts.style ?? CRACK_STYLE.glass, segs, maxSd, t: 0, dur: 0.22, n: 0, cx, cy };
}

/** 화면 뒤 세계 테마가 균열에 입히는 색 (theme.ts) */
export interface CrackTint {
  /** 틈 주변 글로우 "r,g,b" (null이면 없음) */
  glow: string | null;
  /** 속선 색 (null이면 무기 기본색) */
  core: string | null;
}

/** 선분들을 최대 3겹으로 그린다 (테마 글로우 → 그림자 → 바깥 선 → 속선) */
export function strokeSegs(ctx: CanvasRenderingContext2D, segs: Seg[], count: number, k: number, style: CrackStyle, tint?: CrackTint) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const pass = (style: string, extra: number, widthScale: number, ox: number, oy: number) => {
    ctx.strokeStyle = style;
    for (let i = 0; i < count; i++) {
      const s = segs[i];
      ctx.lineWidth = (s.w * widthScale + extra) * k;
      ctx.beginPath();
      ctx.moveTo(s.x0 + ox * k, s.y0 + oy * k);
      ctx.lineTo(s.x1 + ox * k, s.y1 + oy * k);
      ctx.stroke();
    }
  };

  if (tint?.glow) {
    pass(`rgba(${tint.glow},0.1)`, 12, 1, 0, 0);
    pass(`rgba(${tint.glow},0.28)`, 5, 1, 0, 0);
  }
  if (style.shadow) pass(style.shadow, 2, 1, 1, 1);
  pass(style.main, 0, 1, 0, 0);
  const core = tint?.core ?? style.core;
  if (core) pass(core, 0, style.coreScale || 0.4, 0, 0);
}
