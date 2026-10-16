import type { ReactNode } from 'react';
import type { ToolId } from './game/engine';

/**
 * 무기 목록 + 기본 커서/아이콘 SVG
 *
 * 이미지로 바꾸려면 TOOLS의 icon(인벤토리) / cursor(커서)에 경로를 넣는다. 없으면 아래 기본 SVG가 쓰인다.
 */

export interface ToolInfo {
  id: ToolId;
  label: string;
  /** 툴팁 설명 */
  desc: string;
  /** 인벤토리 아이콘 이미지 경로 (예: '/icons/hammer.png' → public/icons/hammer.png). 없으면 기본 SVG 표시 */
  icon?: string;
  /** 커서 이미지 (없으면 기본 SVG). hotX/hotY = 이미지 안에서 타격 지점 좌표(px), width = 표시 너비(px) */
  cursor?: { src: string; hotX: number; hotY: number; width: number };
  /** 누적 점수가 이 값 이상이면 해금 */
  unlockAt: number;
  /** 구현 완료 여부 */
  ready: boolean;
}

// 해금 조건 (누적 점수: 타격 1회 = 1점, 바퀴벌레 1마리 = 5점)
export const TOOLS: ToolInfo[] = [
  { id: 'hammer', label: 'HAMMER', desc: '내리치면 유리처럼 금이 쩍 갈라진다. 얼음을 치면 산산조각.', unlockAt: 0, ready: true },
  { id: 'gun', label: 'GUN', desc: '권총. 8발 쏘면 재장전한다. (R: 수동 재장전)', unlockAt: 10, ready: true },
  { id: 'm4', label: 'M4A1', desc: 'M4A1 소총. 레드도트 배율 스코프, 누르고 있으면 연발 사격. 30발마다 재장전. (휠: 배율)', unlockAt: 30, ready: true },
  { id: 'flame', label: 'FLAME', desc: '누르고 있는 동안 불을 뿜어 화면을 시커멓게 태운다.', unlockAt: 60, ready: true },
  { id: 'bomb', label: 'BOMB', desc: '설치하면 잠시 뒤 폭발한다. 주변 바퀴벌레도 휩쓸린다.', unlockAt: 100, ready: true },
  { id: 'drill', label: 'DRILL', desc: '누르고 있으면 구멍이 점점 깊어지고 가루가 튄다.', unlockAt: 140, ready: true },
  { id: 'laser', label: 'LASER', desc: '누른 채 드래그한 선을 따라 화면이 갈라지고 벌어진다.', unlockAt: 180, ready: true },
  { id: 'quake', label: 'QUAKE', desc: '화면이 흔들리며 큰 균열이 가로지르고 조각이 어긋난다.', unlockAt: 230, ready: true },
  { id: 'lightning', label: 'THUNDER', desc: '지그재그 번개와 섬광. 맞은 자리가 까맣게 탄다.', unlockAt: 280, ready: true },
  { id: 'bugs', label: 'BUGS', desc: '작은 벌레들을 풀어 화면을 갉아먹게 한다. 해금 후엔 바퀴벌레가 더 많이 나오고, 벌레를 먹은 바퀴벌레는 커진다(잡으면 7/10/15점).', unlockAt: 340, ready: true },
  { id: 'freeze', label: 'FREEZE', desc: '서리와 얼음이 번진다(누르고 있으면 더 넓게). 망치로 치면 얼음 조각으로 깨진다.', unlockAt: 400, ready: true },
  { id: 'acid', label: 'ACID', desc: '초록 액체가 번지며 화면이 녹아 흘러내린다.', unlockAt: 460, ready: true },
  { id: 'paint', label: 'PAINT', desc: '알록달록한 페인트가 튀어 번진다.', unlockAt: 530, ready: true },
  { id: 'glitch', label: 'GLITCH', desc: '바이러스 감염. 화면 줄이 어긋나고 RGB 색이 갈라진다.', unlockAt: 600, ready: true },
  { id: 'blackhole', label: 'BLACK HOLE', desc: '클릭한 곳으로 화면이 소용돌이치며 빨려 들어간다.', unlockAt: 680, ready: true },
  { id: 'gravity', label: 'ZERO-G', desc: '중력 해제. 클릭한 부분이 조각나 아래로 떨어진다.', unlockAt: 760, ready: true },
  { id: 'meteor', label: 'METEOR', desc: '불덩이가 줄줄이 떨어져 터지고 크레이터가 남는다.', unlockAt: 850, ready: true },
  { id: 'magnifier', label: 'MAGNIFIER', desc: '누르고 있으면 햇빛이 모여 연기가 나고 구멍이 서서히 타들어간다.', unlockAt: 940, ready: true },
  { id: 'crt', label: 'CRT OFF', desc: '옛날 TV처럼 화면이 가로선으로 줄어들었다가 점으로 꺼진다.', unlockAt: 1040, ready: true },
  { id: 'press', label: 'PRESS', desc: '거대한 철판이 쾅 내려와 화면을 누른다. 주름과 균열이 생긴다.', unlockAt: 1150, ready: true },
  { id: 'sticker', label: 'STICKER', desc: '클릭할 때마다 귀여운 스티커가 붙어 화면을 뒤덮는다.', unlockAt: 1260, ready: true },
  { id: 'rewind', label: 'REWIND', desc: '시간 되감기. 부서진 조각이 거꾸로 붙으며 화면이 처음 상태로 돌아온다.', unlockAt: 1380, ready: true },
  { id: 'tsunami', label: 'TSUNAMI', desc: '파란 물이 차오르고 큰 파도가 덮쳐 화면이 잠긴다.', unlockAt: 1500, ready: true },
  { id: 'nuke', label: 'NUKE', desc: '필살기. 충전 후 섬광, 충격파, 버섯구름, 초토화… 그리고 엔딩.', unlockAt: 1650, ready: true },
];

/** 누르고 있는 동안 계속 작동하는 무기 (커서가 떨림) */
export const HOLD_TOOLS: ToolId[] = ['flame', 'drill', 'laser', 'magnifier', 'freeze'];

export interface SvgArt {
  /** [x, y, w, h] viewBox. (0,0)이 타격 지점 */
  box: [number, number, number, number];
  body: ReactNode;
}

/** 조준선 (가운데가 탄착점) */
function crosshair(dot: string): SvgArt {
  return {
    box: [-26, -26, 52, 52],
    body: (
      <>
        {[
          { c: '#000', w: 4 },
          { c: '#fff', w: 1.8 },
        ].map(({ c, w }) => (
          <g key={c} stroke={c} strokeWidth={w} fill="none" strokeLinecap="round">
            <circle r="14" />
            <path d="M0 -24 V-7 M0 7 V24 M-24 0 H-7 M7 0 H24" />
          </g>
        ))}
        <circle r="2" fill={dot} stroke="#000" strokeWidth="1" />
      </>
    ),
  };
}

/** 작은 조준점 (색으로 무기 구분) */
function reticle(color: string): SvgArt {
  return {
    box: [-18, -18, 36, 36],
    body: (
      <>
        {[
          { c: '#000', w: 3.5 },
          { c: color, w: 1.6 },
        ].map(({ c, w }) => (
          <g key={c} stroke={c} strokeWidth={w} fill="none" strokeLinecap="round">
            <circle r="9" />
            <path d="M0 -16 V-12 M0 12 V16 M-16 0 H-12 M12 0 H16" />
          </g>
        ))}
        <circle r="1.6" fill={color} />
      </>
    ),
  };
}

/** 방사능 표시의 날개 3개 */
function trefoil(r0: number, r1: number) {
  return [-90, 30, 150]
    .map((c) => {
      const a0 = ((c - 30) * Math.PI) / 180;
      const a1 = ((c + 30) * Math.PI) / 180;
      const p = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
      return `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
    })
    .join(' ');
}

/** 기본 커서 SVG (ToolInfo.cursor 이미지가 있으면 그걸 우선 사용) */
export const CURSOR_SVG: Record<ToolId, SvgArt> = {
  hammer: {
    box: [-30, -80, 60, 82],
    body: (
      <>
        <rect x="-5" y="-78" width="10" height="46" rx="3" fill="#8a5a2b" stroke="#2b1a0b" strokeWidth="2" />
        <rect x="-27" y="-36" width="54" height="36" rx="5" fill="#9aa3ad" stroke="#1d2329" strokeWidth="2.5" />
        <rect x="-27" y="-36" width="54" height="10" rx="5" fill="#c8d0d8" opacity="0.7" />
        <rect x="-27" y="-8" width="54" height="8" rx="3" fill="#6c757e" />
      </>
    ),
  },
  gun: crosshair('#ff3b30'),
  // M4A1은 엔진이 스코프를 직접 그리므로 커서는 비워둔다
  m4: { box: [-1, -1, 2, 2], body: null },
  flame: {
    // 화염방사기 노즐 (위쪽 끝이 분사 지점)
    box: [-16, -6, 38, 70],
    body: (
      <>
        <circle cx="0" cy="0" r="4" fill="#ff9a3c" opacity="0.9" />
        <rect x="-3.5" y="1" width="7" height="22" fill="#6c757e" stroke="#1d2329" strokeWidth="1.5" />
        <rect x="-6" y="20" width="12" height="5" rx="1" fill="#9aa3ad" stroke="#1d2329" strokeWidth="1.5" />
        <rect x="-8" y="25" width="16" height="34" rx="3" fill="#b8402a" stroke="#2b0f08" strokeWidth="2" />
        <rect x="-14" y="40" width="7" height="20" rx="3" fill="#2a2d31" stroke="#000" strokeWidth="1.5" />
        <rect x="9" y="30" width="11" height="28" rx="5.5" fill="#d4a017" stroke="#3a2a05" strokeWidth="2" />
      </>
    ),
  },
  bomb: {
    // 폭탄 (가운데가 설치 지점)
    box: [-19, -34, 38, 54],
    body: (
      <>
        <path d="M0 -20 Q2 -30 12 -28" stroke="#c9a26b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <circle cx="12" cy="-28" r="4" fill="#ffd25a" />
        <rect x="-5" y="-21" width="10" height="6" fill="#4a4d52" stroke="#000" strokeWidth="1" />
        <circle r="16" fill="#16161a" stroke="#000" strokeWidth="2" />
        <ellipse cx="-6" cy="-6" rx="5" ry="3" fill="#fff" opacity="0.3" transform="rotate(-35 -6 -6)" />
      </>
    ),
  },
  drill: {
    // 드릴 (아래쪽 비트 끝이 뚫는 지점)
    box: [-12, -44, 40, 46],
    body: (
      <>
        <path d="M0 0 L-2.5 -14 H2.5 Z" fill="#c8d0d8" stroke="#1d2329" strokeWidth="1.2" />
        <path d="M-2 -4 L2 -6 M-2 -8 L2 -10" stroke="#6c757e" strokeWidth="1" />
        <rect x="-5" y="-20" width="10" height="7" rx="1.5" fill="#6c757e" stroke="#000" strokeWidth="1.5" />
        <rect x="-9" y="-42" width="18" height="23" rx="4" fill="#f2b705" stroke="#000" strokeWidth="2" />
        <rect x="8" y="-36" width="17" height="8" rx="3" fill="#2a2d31" stroke="#000" strokeWidth="1.5" />
      </>
    ),
  },
  laser: {
    // 레이저 펜 (아래쪽 끝에서 빔이 나감)
    box: [-9, -48, 18, 52],
    body: (
      <>
        <circle r="3.5" fill="#ff3030" />
        <rect x="-3" y="-11" width="6" height="9" fill="#9aa3ad" stroke="#000" strokeWidth="1.2" />
        <rect x="-6" y="-46" width="12" height="36" rx="4" fill="#2a2d31" stroke="#000" strokeWidth="1.5" />
        <rect x="-6" y="-32" width="12" height="3" fill="#ff3030" />
      </>
    ),
  },
  quake: reticle('#c9a26b'),
  lightning: reticle('#ffd60a'),
  freeze: reticle('#8fd3ff'),
  acid: reticle('#7ee836'),
  paint: reticle('#ff2d92'),
  glitch: reticle('#00fff0'),
  blackhole: reticle('#b98cff'),
  gravity: reticle('#ffffff'),
  bugs: reticle('#a07850'),
  meteor: reticle('#ff8a2a'),
  magnifier: {
    // 돋보기 (렌즈는 왼쪽 위, 햇빛이 모이는 초점이 (0,0))
    box: [-80, -80, 84, 84],
    body: (
      <>
        <path d="M-52 -14 L0 0 L-14 -52" fill="rgba(255,240,180,0.12)" stroke="rgba(255,240,180,0.45)" strokeWidth="1" />
        <line x1="-55" y1="-55" x2="-76" y2="-76" stroke="#3b2414" strokeWidth="7" strokeLinecap="round" />
        <circle cx="-36" cy="-36" r="24" fill="rgba(180,220,255,0.18)" stroke="#c9a26b" strokeWidth="4" />
        <ellipse cx="-43" cy="-44" rx="8" ry="4" fill="#fff" opacity="0.35" transform="rotate(-45 -43 -44)" />
      </>
    ),
  },
  crt: reticle('#f2f4f7'),
  press: reticle('#9aa3ad'),
  sticker: reticle('#ff9ec4'),
  rewind: reticle('#8ab4ff'),
  tsunami: reticle('#3fa9ff'),
  nuke: reticle('#ff3b30'),
};

/** 인벤토리 아이콘이 커서와 달라야 하는 경우만 (나머지는 커서 SVG 재사용) */
export const ICON_SVG: Partial<Record<ToolId, SvgArt>> = {
  gun: {
    box: [-30, -24, 60, 48],
    body: (
      <>
        <rect x="-27" y="-17" width="50" height="13" rx="2" fill="#3a3f45" stroke="#000" strokeWidth="2" />
        <rect x="-27" y="-17" width="50" height="4" rx="2" fill="#6c757e" />
        <path d="M6 -4 H22 L26 20 H11 Z" fill="#2a2d31" stroke="#000" strokeWidth="2" strokeLinejoin="round" />
        <path d="M2 -4 Q0 10 8 10" fill="none" stroke="#000" strokeWidth="2" />
      </>
    ),
  },
  m4: {
    // 소총 실루엣 (총구 왼쪽, 레드도트 조준경)
    box: [-46, -20, 92, 40],
    body: (
      <>
        <rect x="-44" y="-6" width="22" height="4" fill="#2a2d31" stroke="#000" strokeWidth="1.5" />
        <rect x="-24" y="-10" width="44" height="11" rx="2" fill="#3a3f45" stroke="#000" strokeWidth="2" />
        <rect x="-18" y="-19" width="20" height="9" rx="2" fill="#2a2d31" stroke="#000" strokeWidth="1.5" />
        <circle cx="-8" cy="-14.5" r="2" fill="#ff3030" />
        <path d="M18 -9 H40 L43 9 H34 L28 0 H18 Z" fill="#2a2d31" stroke="#000" strokeWidth="2" strokeLinejoin="round" />
        <path d="M-6 1 L-2 17 H5 L3 1 Z" fill="#2a2d31" stroke="#000" strokeWidth="2" strokeLinejoin="round" />
        <path d="M9 1 L13 13 H19 L16 1 Z" fill="#2a2d31" stroke="#000" strokeWidth="2" strokeLinejoin="round" />
      </>
    ),
  },
  quake: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <path d="M-22 14 H22" stroke="#6c757e" strokeWidth="3" />
        <path d="M-14 -22 L-2 -8 L-10 0 L4 8 L-2 22" fill="none" stroke="#000" strokeWidth="5" strokeLinejoin="round" />
        <path d="M-14 -22 L-2 -8 L-10 0 L4 8 L-2 22" fill="none" stroke="#c9a26b" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M-18 -10 L-22 -14 M14 -14 L20 -18 M12 4 L20 6" stroke="#c9a26b" strokeWidth="2" />
      </>
    ),
  },
  lightning: {
    box: [-24, -24, 48, 48],
    body: <path d="M5 -22 L-11 3 L-1 3 L-7 22 L11 -5 L1 -5 Z" fill="#ffd60a" stroke="#000" strokeWidth="2" strokeLinejoin="round" />,
  },
  freeze: {
    box: [-24, -24, 48, 48],
    body: (
      <g stroke="#8fd3ff" strokeWidth="2.5" strokeLinecap="round">
        {[0, 60, 120].map((r) => (
          <g key={r} transform={`rotate(${r})`}>
            <path d="M0 -20 V20" />
            <path d="M-5 -15 L0 -10 L5 -15 M-5 15 L0 10 L5 15" fill="none" />
          </g>
        ))}
      </g>
    ),
  },
  acid: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <path d="M0 -20 C 10 -6 14 2 14 8 A14 14 0 0 1 -14 8 C -14 2 -10 -6 0 -20 Z" fill="#7ee836" stroke="#1b4d0b" strokeWidth="2" />
        <circle cx="-4" cy="6" r="3" fill="#c8ff9a" />
        <circle cx="5" cy="12" r="2" fill="#c8ff9a" />
      </>
    ),
  },
  paint: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <circle cx="-6" cy="-4" r="11" fill="#ff2d55" />
        <circle cx="8" cy="2" r="8" fill="#ffd60a" />
        <circle cx="-2" cy="11" r="7" fill="#0a84ff" />
        <circle cx="14" cy="-14" r="3" fill="#34c759" />
        <circle cx="-18" cy="12" r="2.5" fill="#af52de" />
      </>
    ),
  },
  glitch: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <rect x="-18" y="-16" width="30" height="8" fill="#ff0050" />
        <rect x="-12" y="-6" width="32" height="7" fill="#00fff0" />
        <rect x="-20" y="3" width="26" height="6" fill="#fff" />
        <rect x="-8" y="11" width="24" height="6" fill="#5050ff" />
      </>
    ),
  },
  blackhole: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <ellipse rx="22" ry="7" fill="none" stroke="#ff9a3c" strokeWidth="3" transform="rotate(-20)" />
        <circle r="11" fill="#000" stroke="#b98cff" strokeWidth="2" />
      </>
    ),
  },
  gravity: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <path d="M-18 -20 L-4 -20 L-8 -8 Z" fill="#9aa3ad" stroke="#000" strokeWidth="1.5" />
        <path d="M2 -14 L16 -18 L12 -4 Z" fill="#c8d0d8" stroke="#000" strokeWidth="1.5" />
        <path d="M-12 -2 L0 -4 L-4 8 Z" fill="#6c757e" stroke="#000" strokeWidth="1.5" />
        <path d="M10 4 V20 M4 14 L10 20 L16 14" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      </>
    ),
  },
  bugs: {
    box: [-24, -24, 48, 48],
    body: (
      <g stroke="#140f0a" strokeWidth="1.5">
        {[
          [-6, -6, -30],
          [8, 8, 40],
        ].map(([x, y, r]) => (
          <g key={x} transform={`translate(${x} ${y}) rotate(${r})`}>
            <path d="M-4 -5 L4 5 M4 -5 L-4 5 M0 -6 V6" />
            <ellipse rx="7" ry="4" fill="#5a4630" />
            <circle cx="7" r="2.5" fill="#2b2116" />
          </g>
        ))}
      </g>
    ),
  },
  meteor: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <path d="M22 -22 L2 -6 M16 -22 L-2 -10 M22 -16 L6 -2" stroke="#ff8a2a" strokeWidth="3" strokeLinecap="round" />
        <circle cx="-6" cy="6" r="14" fill="rgba(255,140,40,0.45)" />
        <circle cx="-6" cy="6" r="9" fill="#6b4a33" stroke="#000" strokeWidth="1.5" />
      </>
    ),
  },
  magnifier: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <line x1="8" y1="8" x2="20" y2="20" stroke="#3b2414" strokeWidth="6" strokeLinecap="round" />
        <circle cx="-4" cy="-4" r="15" fill="rgba(180,220,255,0.25)" stroke="#c9a26b" strokeWidth="3.5" />
      </>
    ),
  },
  crt: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <path d="M-8 -22 L0 -14 L8 -22" fill="none" stroke="#9aa3ad" strokeWidth="1.5" />
        <rect x="-21" y="-14" width="42" height="30" rx="5" fill="#2a2d31" stroke="#000" strokeWidth="2" />
        <rect x="-16" y="-10" width="30" height="22" rx="3" fill="#0b0b0d" />
        <path d="M-12 1 H10" stroke="#fff" strokeWidth="2" />
        <circle cx="17" cy="8" r="1.5" fill="#ff3b30" />
      </>
    ),
  },
  press: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <rect x="-5" y="-24" width="10" height="12" fill="#6c757e" stroke="#000" strokeWidth="1.5" />
        <rect x="-20" y="-13" width="40" height="15" fill="#9aa3ad" stroke="#000" strokeWidth="2" />
        <rect x="-20" y="-3" width="40" height="5" fill="#ffd60a" />
        <path d="M-16 -3 L-12 2 M-8 -3 L-4 2 M0 -3 L4 2 M8 -3 L12 2" stroke="#111" strokeWidth="2" />
        <path d="M-22 18 H22" stroke="#fff" strokeWidth="2.5" />
        <path d="M-12 8 L-8 14 M12 8 L8 14 M0 7 V14" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
  },
  sticker: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <path
          d="M0 -20 L5.9 -8.1 L19 -6.2 L9.5 3.1 L11.8 16.2 L0 10 L-11.8 16.2 L-9.5 3.1 L-19 -6.2 L-5.9 -8.1 Z"
          fill="#ffd60a"
          stroke="#fff"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <circle cx="-4.5" cy="1" r="1.8" fill="#2a1a12" />
        <circle cx="4.5" cy="1" r="1.8" fill="#2a1a12" />
        <path d="M-2.5 5 Q0 7.5 2.5 5" stroke="#2a1a12" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  rewind: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <path d="M0 -10 L-16 0 L0 10 Z M16 -10 L0 0 L16 10 Z" fill="#fff" />
        <path d="M-18 -16 A22 22 0 1 1 -20 10" fill="none" stroke="#8ab4ff" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M-22 -22 L-18 -16 L-11 -18" fill="none" stroke="#8ab4ff" strokeWidth="2.5" strokeLinecap="round" />
      </>
    ),
  },
  tsunami: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <path d="M-22 18 C-18 -4 -4 -20 12 -16 C2 -12 0 -2 8 2 C14 5 20 2 22 -2 L22 20 L-22 20 Z" fill="#1e7fd6" stroke="#0b2f5a" strokeWidth="1.5" />
        <path d="M12 -16 C2 -12 0 -2 8 2" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      </>
    ),
  },
  nuke: {
    box: [-24, -24, 48, 48],
    body: (
      <>
        <circle r="21" fill="#ffd60a" stroke="#000" strokeWidth="2" />
        <path d={trefoil(5, 18)} fill="#000" />
        <circle r="3" fill="#000" />
      </>
    ),
  },
};
