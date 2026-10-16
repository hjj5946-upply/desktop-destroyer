import { rand } from './weapons/util';

/**
 * 시스템 붕괴 연출: 파괴율이 높아질수록 노이즈/주사선/어두운 깜빡임이 늘고, 구석에 가짜 경고 패널이 뜬다.
 *
 * 눈 보호: 밝은 번쩍임은 쓰지 않는다. 깜빡임은 "잠깐 어두워짐"만, 최소 FLICKER_GAP초 간격.
 * 경고 패널은 실제 OS 오류창이 아닌 자체 디자인 (검은 패널 + 붉은 띠 + 모노스페이스).
 * 파괴율이 내려가면(초기화/되감기) 경고도 알아서 사라진다.
 */

/** 이 파괴율(%)부터 붕괴 연출 시작 */
const START = 25;
/** 어두운 깜빡임 최소 간격(초) */
const FLICKER_GAP = 1.5;

/** 파괴율 기준 / 제목 / 부제 (위에서부터 쌓임) */
const WARNINGS = [
  { at: 35, title: 'SYSTEM FAILURE', sub: 'desktop integrity below safe level' },
  { at: 55, title: 'MEMORY CORRUPTED', sub: 'segment 0xDEAD_GLASS unreadable' },
  { at: 75, title: 'DISPLAY DRIVER LOST', sub: 'attempting recovery... failed' },
  { at: 90, title: 'KERNEL PANIC', sub: 'please do not panic. we are.' },
];

export class SystemCollapse {
  /** 경고별 등장 시각 (null이면 안 뜬 상태) */
  private shown: (number | null)[] = WARNINGS.map(() => null);
  private clock = 0;
  private flickerWait = 3;
  private flicker = 0;
  private level = 0;

  /** dt는 실제 시간 (슬로모션 영향 없음) */
  update(dt: number, percent: number) {
    this.clock += dt;
    this.level = Math.min(1, Math.max(0, (percent - START) / (100 - START)));
    WARNINGS.forEach((wn, i) => {
      if (percent < wn.at) this.shown[i] = null;
      else if (this.shown[i] === null) this.shown[i] = this.clock;
    });

    if (this.flicker > 0) this.flicker -= dt;
    if (this.level <= 0) return;
    this.flickerWait -= dt;
    if (this.flickerWait <= 0) {
      this.flicker = rand(0.08, 0.14);
      this.flickerWait = FLICKER_GAP + rand(1, 5) * (1 - this.level);
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, k: number) {
    const L = this.level;
    if (L > 0) {
      // 정전기 노이즈 조각
      const n = Math.floor(L * 70);
      for (let i = 0; i < n; i++) {
        const g = Math.floor(rand(120, 255));
        ctx.fillStyle = `rgba(${g},${g},${g},${rand(0.04, 0.16) * L})`;
        ctx.fillRect(rand(0, w), rand(0, h), rand(4, 70) * k, rand(1, 3) * k);
      }
      // 가끔 가로로 찢어진 띠
      if (Math.random() < L * 0.15) {
        ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.06 * L})`;
        ctx.fillRect(0, rand(0, h), w, rand(2, 10) * k);
      }
      // 주사선
      if (L > 0.3) {
        ctx.fillStyle = `rgba(0,0,0,${0.08 * L})`;
        for (let y = 0; y < h; y += 4 * k) ctx.fillRect(0, y, w, 1.5 * k);
      }
      // 어두운 깜빡임 (밝게 번쩍이지 않음)
      if (this.flicker > 0) {
        ctx.fillStyle = `rgba(0,0,0,${0.3 * L})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
    this.drawWarnings(ctx, k);
  }

  /** 왼쪽 위 경고 패널 */
  private drawWarnings(ctx: CanvasRenderingContext2D, k: number) {
    const pw = 360 * k;
    const ph = 58 * k;
    let y = 24 * k;
    ctx.save();
    ctx.textBaseline = 'middle';
    WARNINGS.forEach((wn, i) => {
      const at = this.shown[i];
      if (at === null) return;
      const t = this.clock - at;
      const x = 24 * k;
      // 등장: 0.25초 동안 왼쪽에서 밀려 들어오며 나타남
      const p = Math.min(1, t / 0.25);
      const ox = (1 - p) * -40 * k;
      // 테두리만 천천히 숨쉬듯 (1초 주기, 깜빡이지 않음)
      const pulse = 0.55 + 0.35 * Math.sin(t * Math.PI * 2);

      ctx.globalAlpha = p;
      ctx.fillStyle = 'rgba(6,4,5,0.82)';
      ctx.fillRect(x + ox, y, pw, ph);
      ctx.strokeStyle = `rgba(255,70,60,${pulse})`;
      ctx.lineWidth = 1.2 * k;
      ctx.strokeRect(x + ox + 0.5, y + 0.5, pw - 1, ph - 1);
      ctx.fillStyle = 'rgba(255,70,60,0.9)';
      ctx.fillRect(x + ox, y, 5 * k, ph);

      // 경고 삼각형
      const ix = x + ox + 30 * k;
      const iy = y + ph / 2;
      ctx.beginPath();
      ctx.moveTo(ix, iy - 12 * k);
      ctx.lineTo(ix + 13 * k, iy + 10 * k);
      ctx.lineTo(ix - 13 * k, iy + 10 * k);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,90,80,0.95)';
      ctx.lineWidth = 2 * k;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,90,80,0.95)';
      ctx.font = `bold ${13 * k}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('!', ix, iy + 2 * k);

      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(255,80,70,0.7)';
      ctx.shadowBlur = 8 * k;
      ctx.fillStyle = '#ffdcd8';
      ctx.font = `bold ${17 * k}px Consolas, monospace`;
      ctx.fillText(wn.title, x + ox + 56 * k, y + 21 * k);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,220,215,0.6)';
      ctx.font = `${11 * k}px Consolas, monospace`;
      ctx.fillText(wn.sub, x + ox + 56 * k, y + 41 * k);

      y += ph + 10 * k;
    });
    ctx.restore();
  }
}
