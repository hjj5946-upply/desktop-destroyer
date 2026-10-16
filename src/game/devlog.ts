import type { ToolId } from './engine';
import { pick } from './weapons/util';

/**
 * 개발자 유머 로그: 타격마다 왼쪽 아래 로그창에 농담 문구가 한 줄씩 쌓인다 (L키로 켜고 끔)
 * 연사 무기가 도배하지 않도록 GAP초에 한 줄만.
 */

const GAP = 0.18;
const MAX_LINES = 7;
const LIFE = 6;

export type Level ='ERROR' | 'WARN' | 'INFO' | 'FATAL';

const GENERIC: [Level, string][] = [
  ['ERROR', 'desktop.exe has stopped working'],
  ['WARN', 'wallpaper.png integrity: 12%'],
  ['ERROR', 'Segmentation fault (core dumped)'],
  ['INFO', 'It works on my machine'],
  ['WARN', 'npm WARN deprecated glass@1.0.0'],
  ['ERROR', "TypeError: undefined is not a function"],
  ['INFO', 'git push --force origin main'],
  ['WARN', 'TODO: fix later (2019)'],
  ['ERROR', 'NullPointerException at Desktop.java:42'],
  ['INFO', 'SELECT * FROM icons WHERE alive = 1; -- 0 rows'],
  ['WARN', 'GC: collecting shards...'],
  ['ERROR', 'StackOverflow: 404 answer not found'],
  ['INFO', 'retrying in 3... 2... nah'],
  ['WARN', 'CPU fan is now a propeller'],
  ['ERROR', 'cannot undo: Ctrl+Z not found'],
  ['INFO', 'deploying to production on friday'],
  ['WARN', 'recycle bin is full (of glass)'],
  ['ERROR', 'ETIMEDOUT: patience.dll'],
];

const BY_TOOL: Partial<Record<ToolId, [Level, string][]>> = {
  hammer: [
    ['INFO', 'hammer.hit(): returned 0xBONK'],
    ['WARN', 'every problem looks like a nail'],
  ],
  gun: [['WARN', 'bug fixed by shooting it']],
  m4: [['INFO', 'running in fully automatic mode']],
  flame: [['ERROR', 'thermal throttling: 9000°C']],
  bomb: [['FATAL', 'explosion.dll loaded successfully']],
  nuke: [['FATAL', 'rm -rf / --no-preserve-root']],
  bugs: [['INFO', "it's not a bug, it's a feature"]],
  rewind: [['INFO', 'git reset --hard HEAD~1']],
};

const COLOR: Record<Level, string> = {
  INFO: '170,220,255',
  WARN: '255,210,90',
  ERROR: '255,110,100',
  FATAL: '255,60,60',
};

interface Line {
  level: Level;
  text: string;
  stamp: string;
  t: number;
}

export class DevLog {
  visible = true;
  private lines: Line[] = [];
  private clock = 0;
  private wait = 0;
  private lastText = '';

  /** 공격이 나갔을 때 */
  hit(tool: ToolId) {
    if (this.wait > 0) return;
    this.wait = GAP;
    const pool = BY_TOOL[tool];
    let entry = pool && Math.random() < 0.35 ? pick(pool) : pick(GENERIC);
    if (entry[1] === this.lastText) entry = pick(GENERIC);
    this.lastText = entry[1];
    this.push(entry[0], entry[1]);
  }

  /** 정해진 문구를 바로 한 줄 (조합 반응 등. 간격 제한 없음) */
  note(level: Level, text: string) {
    this.push(level, text);
  }

  private push(level: Level, text: string) {
    const s = this.clock;
    const stamp = `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}`;
    this.lines.push({ level, text, stamp, t: 0 });
    if (this.lines.length > MAX_LINES) this.lines.shift();
  }

  /** dt는 실제 시간 */
  update(dt: number) {
    this.clock += dt;
    this.wait -= dt;
    for (const l of this.lines) l.t += dt;
    while (this.lines.length > 0 && this.lines[0].t > LIFE) this.lines.shift();
  }

  reset() {
    this.lines = [];
  }

  /** 왼쪽 아래 */
  draw(ctx: CanvasRenderingContext2D, h: number, k: number) {
    if (!this.visible || this.lines.length === 0) return;
    const x = 24 * k;
    const lh = 18 * k;
    const bottom = h - 28 * k;
    ctx.save();
    ctx.font = `${12 * k}px Consolas, monospace`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const n = this.lines.length;
    ctx.fillStyle = 'rgba(4,4,6,0.55)';
    ctx.fillRect(x - 10 * k, bottom - n * lh - 8 * k, 430 * k, n * lh + 14 * k);
    this.lines.forEach((l, i) => {
      const y = bottom - (n - 1 - i) * lh;
      const fadeIn = Math.min(1, l.t / 0.12);
      const fadeOut = Math.min(1, (LIFE - l.t) / 1);
      ctx.globalAlpha = fadeIn * fadeOut;
      ctx.fillStyle = 'rgba(242,244,247,0.45)';
      ctx.fillText(l.stamp, x, y);
      ctx.fillStyle = `rgb(${COLOR[l.level]})`;
      ctx.fillText(l.level.padEnd(5), x + 82 * k, y);
      ctx.fillStyle = 'rgba(242,244,247,0.9)';
      ctx.fillText(l.text, x + 132 * k, y);
    });
    ctx.restore();
  }
}
