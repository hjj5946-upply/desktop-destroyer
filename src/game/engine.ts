import { CRACK_STYLE, createCrack, strokeSegs, type Crack } from './crack';
import { Sfx } from './audio';
import type { Particle, RegionShift, Weapon } from './weapons/util';
import { Acid, Drill, Freeze, Laser, Magnifier, Paint } from './weapons/tools';
import { BlackHole, Bugs, Gravity, Lightning, MeteorShower, Quake } from './weapons/disasters';

/** 바퀴벌레 성장 단계: 먹은 벌레 수 기준 / 몸 크기 배율 / 잡았을 때 점수 */
const ROACH_STAGE = [
  { eaten: 0, scale: 1, points: 5 },
  { eaten: 2, scale: 1.3, points: 7 },
  { eaten: 5, scale: 1.6, points: 10 },
  { eaten: 9, scale: 2, points: 15 },
];
import { Crt, Glitch, Nuke } from './weapons/special';
import { Press, Rewind, Sticker, Tsunami } from './weapons/extra';

export type ToolId =
  | 'hammer'
  | 'gun'
  | 'm4'
  | 'flame'
  | 'bomb'
  | 'drill'
  | 'laser'
  | 'quake'
  | 'lightning'
  | 'freeze'
  | 'acid'
  | 'paint'
  | 'glitch'
  | 'blackhole'
  | 'gravity'
  | 'bugs'
  | 'meteor'
  | 'magnifier'
  | 'crt'
  | 'press'
  | 'sticker'
  | 'rewind'
  | 'tsunami'
  | 'nuke';

type GunId = 'gun' | 'm4';

/** 총기 제원: 탄창 / 재장전 시간(초) / 최소 발사 간격(초) */
const GUN_SPEC: Record<GunId, { mag: number; reload: number; interval: number }> = {
  gun: { mag: 8, reload: 1.3, interval: 0.07 },
  m4: { mag: 30, reload: 2.0, interval: 0.085 }, // 약 700발/분
};

interface GunState {
  ammo: number;
  /** 재장전 남은 시간 (0이면 재장전 중 아님) */
  reload: number;
  /** 다음 발사까지 남은 시간 */
  cooldown: number;
  /** 이번에 누르고 나서 연속으로 쏜 발 수 (반동으로 탄이 퍼짐) */
  burst: number;
}

/** 튀어나가는 탄피 */
export interface Casing {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
}

export interface Shard {
  /** true면 유리 대신 검은 잔해 (폭탄) */
  dark: boolean;
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

export interface Goo {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  max: number;
}

/** 불꽃/연기 파티클 (화염방사기, 폭발, 도화선) */
export interface Fire {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  max: number;
  smoke: boolean;
}

export interface Bomb {
  x: number;
  y: number;
  /** 설치 후 경과 시간 / 도화선 길이(초) */
  t: number;
  fuse: number;
}

/** 폭발 충격파 링 */
export interface Ring {
  x: number;
  y: number;
  t: number;
  dur: number;
  r: number;
}

export interface Roach {
  x: number;
  y: number;
  /** 진행 방향(라디안) */
  a: number;
  speed: number;
  /** 평소 속도 */
  base: number;
  /** 회전 속도(rad/s) */
  turn: number;
  /** 다음 행동 변경까지 남은 시간 */
  wander: number;
  /** 멈춰 있는 남은 시간 */
  pause: number;
  /** 놀라서 도망가는 남은 시간 */
  flee: number;
  /** 다리/더듬이 애니메이션 위상 */
  phase: number;
  /** 몸 길이 (캔버스 px) */
  len: number;
  /** 화면 안에 한 번이라도 들어왔는지 (밖에서 생성되므로) */
  entered: boolean;
  /** 얼어서 못 움직이는 남은 시간 (냉동총) */
  frozen: number;
  /** 태어날 때 몸 길이 (성장 기준) */
  len0: number;
  /** 잡아먹은 벌레 수 (많이 먹을수록 커지고 점수도 높아짐) */
  eaten: number;
}

/** 점수 팝업 (+5, +15 …) */
interface Popup {
  x: number;
  y: number;
  t: number;
  text: string;
  big: boolean;
}

export interface Flash {
  x: number;
  y: number;
  t: number;
  dur: number;
  r: number;
  /** "r,g,b" */
  color: string;
}

/** 화염방사기로 달궈진 자리 (주황빛이 서서히 식음) */
export interface Heat {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
}

/** 폭발 화구 (커지면서 사라짐) */
export interface Blast {
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

  /**
   * 장면은 scene 캔버스에 그린 뒤 화면 캔버스(out)로 옮긴다 (스코프가 장면을 확대해 쓰기 위해).
   * base = 스크린샷 사본. 지진/블랙홀/산성액처럼 화면 자체를 비트는 무기는 base를 직접 고친다.
   * (public 멤버는 weapons/ 모듈에서 쓰기 위한 것)
   */
  readonly ctx: CanvasRenderingContext2D;
  private readonly out: CanvasRenderingContext2D;
  readonly base: HTMLCanvasElement;
  readonly bctx: CanvasRenderingContext2D;
  readonly scene: HTMLCanvasElement;
  readonly damage: HTMLCanvasElement;
  readonly dctx: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;
  /** 해상도 보정 배율 (1080p = 1, 4K = 2) */
  readonly k: number;

  private active: Crack[] = [];
  shards: Shard[] = [];
  flashes: Flash[] = [];
  private goo: Goo[] = [];
  roaches: Roach[] = [];
  /** 다음 바퀴벌레 등장까지 남은 시간(초) */
  private roachTimer = 3;
  fire: Fire[] = [];
  private bombs: Bomb[] = [];
  rings: Ring[] = [];
  private casings: Casing[] = [];
  heat: Heat[] = [];
  private heatTimer = 0;
  blasts: Blast[] = [];

  /** M4A1 스코프 표시 여부 (App이 도구에 맞춰 켬) */
  scope = false;
  /** 현재 선택된 도구 (App이 설정) */
  tool: ToolId = 'hammer';

  private particles: Particle[] = [];
  /** 화면 조각 이동 애니메이션 (한 번에 하나씩 차례로) */
  private shifts: RegionShift[] = [];
  private readonly freeze: Freeze;
  private readonly bugs: Bugs;
  /** 벌레 풀기가 해금되면 바퀴벌레가 더 많이, 더 자주 나온다 (App이 설정) */
  bugsUnlocked = false;
  private popups: Popup[] = [];
  private readonly weapons: Partial<Record<ToolId, Weapon>>;
  /** 스코프 배율 */
  private zoom = 2;
  /** 현재 조준 위치 (캔버스 px) */
  aim = { x: 0, y: 0 };
  /** 사격 반동으로 스코프가 튀는 양 */
  private scopeKick = 0;
  /** 마우스를 누르고 있는 동안의 도구/위치 (null이면 안 누름). 화염방사기·M4A1 연사에 사용 */
  private trigger: { tool: ToolId; x: number; y: number } | null = null;
  /** 총기별 탄창 상태 */
  private readonly guns: Record<GunId, GunState> = {
    gun: { ammo: GUN_SPEC.gun.mag, reload: 0, cooldown: 0, burst: 0 },
    m4: { ammo: GUN_SPEC.m4.mag, reload: 0, cooldown: 0, burst: 0 },
  };
  shake = 0;

  /** 미션 점수 (타격 1회 = 1, 바퀴벌레 1마리 = 5) */
  onScore?: (n: number) => void;
  /** 실제로 공격이 나갈 때마다 (커서 반동 애니메이션용) */
  onFire?: () => void;
  /** 탄약/재장전 상태가 바뀔 때마다 (HUD 갱신용) */
  onAmmo?: () => void;
  hits = 0;

  private running = false;
  private raf = 0;
  private last = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly shot: ImageBitmap,
  ) {
    this.w = shot.width;
    this.h = shot.height;
    this.k = shot.height / 1080;
    canvas.width = this.w;
    canvas.height = this.h;

    const out = canvas.getContext('2d');
    if (!out) throw new Error('Canvas 2D를 사용할 수 없습니다');
    this.out = out;

    this.scene = document.createElement('canvas');
    this.scene.width = this.w;
    this.scene.height = this.h;
    const ctx = this.scene.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D(scene)를 사용할 수 없습니다');
    this.ctx = ctx;
    this.aim = { x: this.w / 2, y: this.h / 2 };

    this.base = document.createElement('canvas');
    this.base.width = this.w;
    this.base.height = this.h;
    const bctx = this.base.getContext('2d');
    if (!bctx) throw new Error('Canvas 2D(base)를 사용할 수 없습니다');
    this.bctx = bctx;
    bctx.drawImage(shot, 0, 0, this.w, this.h);

    this.damage = document.createElement('canvas');
    this.damage.width = this.w;
    this.damage.height = this.h;
    const dctx = this.damage.getContext('2d');
    if (!dctx) throw new Error('Canvas 2D(damage)를 사용할 수 없습니다');
    this.dctx = dctx;

    this.freeze = new Freeze(this);
    this.bugs = new Bugs(this);
    this.weapons = {
      drill: new Drill(this),
      laser: new Laser(this),
      quake: new Quake(this),
      lightning: new Lightning(this),
      freeze: this.freeze,
      acid: new Acid(this),
      paint: new Paint(this),
      glitch: new Glitch(this),
      blackhole: new BlackHole(this),
      gravity: new Gravity(this),
      bugs: this.bugs,
      meteor: new MeteorShower(this),
      magnifier: new Magnifier(this),
      crt: new Crt(this),
      press: new Press(this),
      sticker: new Sticker(this),
      rewind: new Rewind(this),
      tsunami: new Tsunami(this),
      nuke: new Nuke(this),
    };
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
    this.release();
    this.sfx.stopAll();
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** 모든 파괴 흔적을 지우고 원래 화면으로 되돌린다 (촬영 재시도용) */
  reset() {
    this.clearAll();
    for (const wpn of Object.values(this.weapons)) wpn?.reset?.();
  }

  /** 화면 흔적만 지운다 (무기 상태는 유지: 핵폭탄 엔딩에서 사용) */
  clearAll() {
    this.dctx.clearRect(0, 0, this.w, this.h);
    this.bctx.drawImage(this.shot, 0, 0, this.w, this.h);
    this.particles = [];
    this.shifts = [];
    this.popups = [];
    this.active = [];
    this.shards = [];
    this.flashes = [];
    this.goo = [];
    this.fire = [];
    this.bombs = [];
    this.rings = [];
    this.casings = [];
    this.heat = [];
    this.blasts = [];
    this.shake = 0;
    this.hits = 0;
    // 바퀴벌레는 계속 돌아다닌다 (흔적만 지움)
  }

  /** 마우스 누름: 선택한 도구로 공격 (화염방사기·M4A1는 release 전까지 계속) */
  press(tool: ToolId, clientX: number, clientY: number) {
    const p = this.toCanvas(clientX, clientY);
    if (!p) return;
    const { x, y } = p;
    this.release();
    this.trigger = { tool, x, y };
    this.aim = { x, y };

    switch (tool) {
      case 'hammer':
        // 얼음을 치면 얼음 조각으로 깨진다
        if (!this.freeze.shatterAt(x, y)) this.hammer(x, y);
        this.hitRoaches(x, y, 0);
        this.fired();
        break;
      case 'gun':
      case 'm4':
        this.guns[tool].burst = 0;
        this.shoot(tool, x, y, true);
        break;
      case 'flame':
        this.sfx.flameStart();
        this.fired();
        break;
      case 'bomb':
        if (this.placeBomb(x, y)) this.fired();
        break;
      default:
        if (this.weapons[tool]?.press?.(x, y)) this.fired();
        break;
    }
  }

  /** 마우스 이동: 누르고 있는 중이면 조준 위치만 따라간다 */
  move(clientX: number, clientY: number) {
    const p = this.toCanvas(clientX, clientY);
    if (!p) return;
    this.aim = p;
    if (this.trigger) {
      this.trigger.x = p.x;
      this.trigger.y = p.y;
    }
  }

  /** 스코프 배율 조절 (마우스 휠): dir +1 = 확대, -1 = 축소 */
  zoomBy(dir: number) {
    this.zoom = Math.min(4, Math.max(1.5, this.zoom + dir * 0.5));
  }

  /** 마우스 뗌 / 창 포커스 잃음 / 인벤토리 열림 */
  release() {
    if (!this.trigger) return;
    if (this.trigger.tool === 'flame') this.sfx.flameStop();
    this.weapons[this.trigger.tool]?.release?.();
    this.trigger = null;
  }

  /** 수동 재장전 (R) */
  reload(tool: ToolId) {
    if (tool !== 'gun' && tool !== 'm4') return;
    const g = this.guns[tool];
    if (g.reload > 0 || g.ammo === GUN_SPEC[tool].mag) return;
    this.startReload(tool);
  }

  /** HUD 표시용 탄약 정보 (총기가 아니면 null) */
  ammoInfo(tool: ToolId) {
    if (tool !== 'gun' && tool !== 'm4') return null;
    const g = this.guns[tool];
    const spec = GUN_SPEC[tool];
    return { ammo: g.ammo, mag: spec.mag, reloading: g.reload > 0, reloadDur: spec.reload, reloadLeft: g.reload };
  }

  // ───────────── 무기 모듈용 헬퍼 ─────────────

  addParticle(p: Particle) {
    this.particles.push(p);
  }

  addCrack(c: Crack) {
    this.active.push(c);
  }

  /** damage 레이어를 base에 합친다 (화면을 비틀 때 금도 같이 움직이게) */
  flatten() {
    this.bctx.drawImage(this.damage, 0, 0);
    this.dctx.clearRect(0, 0, this.w, this.h);
  }

  /** 화면 조각 이동 예약 (앞의 것이 끝나면 시작) */
  queueShift(s: RegionShift) {
    if (this.shifts.length < 6) this.shifts.push(s);
  }

  /** 반경 안의 바퀴벌레를 얼린다 */
  freezeRoaches(x: number, y: number, r: number) {
    for (const rc of this.roaches) {
      if (Math.hypot(rc.x - x, rc.y - y) < r) rc.frozen = 6;
    }
  }

  /** 블랙홀: 반경 안의 바퀴벌레를 빨아들이고, 중심에 닿으면 사라짐 (점수 5) */
  pullRoaches(x: number, y: number, R: number, amount: number) {
    for (let i = this.roaches.length - 1; i >= 0; i--) {
      const rc = this.roaches[i];
      const d = Math.hypot(rc.x - x, rc.y - y);
      if (d > R) continue;
      if (d < 20 * this.k) {
        this.roaches.splice(i, 1);
        this.scoreRoach(rc);
        continue;
      }
      const pull = amount * (R - d) * 3;
      rc.x += ((x - rc.x) / d) * pull;
      rc.y += ((y - rc.y) / d) * pull;
      rc.a += amount * 6;
    }
  }

  /** 성장 단계 (0~3) */
  private roachStage(r: Roach) {
    let s = 0;
    ROACH_STAGE.forEach((st, i) => {
      if (r.eaten >= st.eaten) s = i;
    });
    return s;
  }

  /** 바퀴벌레 처치 점수 (크기 단계별 5/7/10/15) + 팝업 */
  private scoreRoach(r: Roach) {
    const st = this.roachStage(r);
    const pts = ROACH_STAGE[st].points;
    this.onScore?.(pts);
    this.popups.push({ x: r.x, y: r.y, t: 0, text: `+${pts}`, big: st === ROACH_STAGE.length - 1 });
  }

  /** 쓰나미: 물에 잠긴 바퀴벌레는 익사 (거품 + 점수) */
  drownRoaches(underwater: (x: number, y: number) => boolean) {
    for (let i = this.roaches.length - 1; i >= 0; i--) {
      const rc = this.roaches[i];
      if (!underwater(rc.x, rc.y)) continue;
      this.roaches.splice(i, 1);
      this.scoreRoach(rc);
      for (let n = 0; n < 6; n++) {
        this.particles.push({
          x: rc.x,
          y: rc.y,
          vx: (Math.random() - 0.5) * 40 * this.k,
          vy: -(60 + Math.random() * 120) * this.k,
          life: 1,
          max: 1,
          size: (2 + Math.random() * 4) * this.k,
          color: '220,240,255',
          alpha: 0.7,
          gravity: 0,
          drag: 0,
          grow: 0,
          additive: false,
          square: false,
        });
      }
    }
  }

  /** 핵폭탄: 모든 바퀴벌레가 타 죽음 */
  killAllRoaches() {
    for (const rc of this.roaches) {
      this.charred(rc);
      this.scoreRoach(rc);
    }
    this.roaches = [];
  }

  /** 점수 1 + 커서 반동 */
  private fired() {
    this.onScore?.(1);
    this.onFire?.();
  }

  private toCanvas(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return {
      x: ((clientX - r.left) * this.w) / r.width,
      y: ((clientY - r.top) * this.h) / r.height,
    };
  }

  // ───────────── 도구: 망치 ─────────────

  private hammer(x: number, y: number) {
    const k = this.k;
    const scale = Math.min(this.w, this.h);

    // 퍼져나가는 균열
    this.active.push(createCrack(x, y, scale * 0.78, k));

    // 충격 지점의 영구 흔적: 하얗게 갈린 부분 + 작은 유리 조각
    const g = this.dctx.createRadialGradient(x, y, 0, x, y, 28 * k);
    g.addColorStop(0, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    this.dctx.fillStyle = g;
    this.dctx.beginPath();
    this.dctx.arc(x, y, 28 * k, 0, Math.PI * 2);
    this.dctx.fill();

    this.dctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 13 * k;
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
    this.flashes.push({ x, y, t: 0, dur: 0.14, r: 120 * k, color: '220,235,255' });
    this.shake = Math.max(this.shake, 13 * k);
    this.spawnShards(x, y, 12);
    this.hits += 1;
    this.sfx.crack();
  }

  // ───────────── 도구: 총 / M4A1 (탄창 + 재장전) ─────────────

  /**
   * 한 발 발사. 탄이 없거나 재장전 중이면 (직접 누른 경우에만) 빈 격발음
   * @param manual 마우스를 막 누른 경우 true, M4A1 연사로 자동 발사면 false
   */
  private shoot(tool: GunId, x: number, y: number, manual: boolean) {
    const g = this.guns[tool];
    if (g.reload > 0) {
      if (manual) this.sfx.dryFire();
      return;
    }
    if (g.ammo <= 0) {
      if (manual) {
        this.sfx.dryFire();
        this.startReload(tool);
      }
      return;
    }
    if (g.cooldown > 0) return;

    const k = this.k;
    g.ammo -= 1;
    g.cooldown = GUN_SPEC[tool].interval;
    g.burst += 1;

    // M4A1 연사는 쏠수록 반동으로 탄이 퍼진다
    let hx = x;
    let hy = y;
    if (tool === 'm4') {
      const spread = Math.min(30, 1 + g.burst * 1.6) * k;
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * spread;
      hx += Math.cos(a) * d;
      hy += Math.sin(a) * d - Math.min(20, g.burst * 0.8) * k; // 총구가 살짝 들림
    }

    if (tool === 'm4') {
      this.rifleHole(hx, hy);
      this.scopeKick = Math.min(40 * k, this.scopeKick + 9 * k);
    } else {
      this.pistolHole(hx, hy);
    }
    this.hitRoaches(hx, hy, 0);
    this.ejectCasing(x, y);
    if (tool === 'm4') this.sfx.rifle();
    else this.sfx.gunshot();
    this.fired();

    if (g.ammo === 0) this.startReload(tool);
    this.onAmmo?.();
  }

  private startReload(tool: GunId) {
    this.guns[tool].reload = GUN_SPEC[tool].reload;
    this.sfx.reloadStart();
    this.onAmmo?.();
  }

  /** 재장전 타이머 / 발사 간격 / M4A1 연사 */
  private updateGuns(dt: number) {
    for (const tool of ['gun', 'm4'] as GunId[]) {
      const g = this.guns[tool];
      g.cooldown = Math.max(0, g.cooldown - dt);
      if (g.reload > 0) {
        g.reload -= dt;
        if (g.reload <= 0) {
          g.reload = 0;
          g.ammo = GUN_SPEC[tool].mag;
          g.burst = 0;
          this.sfx.reloadEnd();
          this.onAmmo?.();
        }
      }
    }

    const t = this.trigger;
    if (t && t.tool === 'm4') this.shoot('m4', t.x, t.y, false);
  }

  /** 권총 탄흔: 작고 깔끔한 구멍 + 짧은 잔금 몇 가닥 (소총보다 약함) */
  private pistolHole(x: number, y: number) {
    const k = this.k;
    const scale = Math.min(this.w, this.h);
    const d = this.dctx;

    // 아주 짧은 잔금 몇 가닥만
    this.active.push(
      createCrack(x, y, scale * 0.025, k, {
        rays: 3 + Math.floor(Math.random() * 2),
        width: 0.8,
        rings: false,
        style: CRACK_STYLE.pistol,
      }),
    );

    const g = d.createRadialGradient(x, y, 0, x, y, 6 * k);
    g.addColorStop(0, 'rgba(230,235,240,0.3)');
    g.addColorStop(1, 'rgba(230,235,240,0)');
    d.fillStyle = g;
    d.beginPath();
    d.arc(x, y, 6 * k, 0, Math.PI * 2);
    d.fill();

    // 작은 구멍
    d.fillStyle = 'rgba(8,8,10,0.95)';
    d.beginPath();
    d.arc(x, y, 2.4 * k, 0, Math.PI * 2);
    d.fill();

    this.flashes.push({ x, y, t: 0, dur: 0.04, r: 28 * k, color: '255,240,200' });
    this.shake = Math.max(this.shake, 2.5 * k);
    this.hits += 1;
  }

  /** 소총 탄흔: 권총보다 조금 큰 구멍 + 옅은 화약 그을음 + 조금 더 긴 잔금 */
  private rifleHole(x: number, y: number) {
    const k = this.k;
    const scale = Math.min(this.w, this.h);
    const d = this.dctx;

    this.active.push(
      createCrack(x, y, scale * 0.05, k, {
        rays: 4 + Math.floor(Math.random() * 3),
        width: 1.2,
        rings: false,
        style: CRACK_STYLE.rifle,
      }),
    );

    // 하얗게 부서진 자리
    const g = d.createRadialGradient(x, y, 0, x, y, 10 * k);
    g.addColorStop(0, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = g;
    d.beginPath();
    d.arc(x, y, 10 * k, 0, Math.PI * 2);
    d.fill();

    // 화약 그을음 고리
    const soot = d.createRadialGradient(x, y, 3 * k, x, y, 8 * k);
    soot.addColorStop(0, 'rgba(40,36,32,0.45)');
    soot.addColorStop(1, 'rgba(40,36,32,0)');
    d.fillStyle = soot;
    d.beginPath();
    d.arc(x, y, 8 * k, 0, Math.PI * 2);
    d.fill();

    // 살짝 들쭉날쭉한 구멍 (권총보다 조금 큼)
    d.fillStyle = 'rgba(4,4,5,1)';
    d.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = (3.4 + Math.random() * 1) * k;
      if (i === 0) d.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else d.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    d.closePath();
    d.fill();

    this.flashes.push({ x, y, t: 0, dur: 0.05, r: 55 * k, color: '255,190,110' });
    this.shake = Math.max(this.shake, 3.5 * k);
    this.spawnShards(x, y, 1);
    this.hits += 1;
  }

  /** 탄피: 오른쪽 위로 튀었다가 떨어진다 */
  private ejectCasing(x: number, y: number) {
    const k = this.k;
    this.casings.push({
      x: x + 20 * k,
      y: y - 10 * k,
      vx: (250 + Math.random() * 250) * k,
      vy: -(400 + Math.random() * 300) * k,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 40,
      life: 0.9,
    });
  }

  // ───────────── 도구: 화염방사기 ─────────────

  /** 분사 중일 때 매 프레임 호출: 불꽃 파티클 + 그을음 누적 + 바퀴벌레 태우기 */
  private flameTick(dt: number) {
    if (!this.trigger || this.trigger.tool !== 'flame') return;
    const k = this.k;
    const { x, y } = this.trigger;
    const d = this.dctx;

    // 그을음: 같은 곳에 오래 쏠수록 점점 새까매진다
    const a = Math.min(0.25, dt * 2.2);
    const soot = d.createRadialGradient(x, y, 0, x, y, 60 * k);
    soot.addColorStop(0, `rgba(12,6,2,${a})`);
    soot.addColorStop(0.6, `rgba(40,18,6,${a * 0.5})`);
    soot.addColorStop(1, 'rgba(40,18,6,0)');
    d.fillStyle = soot;
    d.beginPath();
    d.arc(x, y, 60 * k, 0, Math.PI * 2);
    d.fill();

    // 불꽃 + 연기
    const nFire = Math.ceil(dt * 420);
    for (let i = 0; i < nFire; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = (60 + Math.random() * 260) * k;
      const max = 0.25 + Math.random() * 0.35;
      this.fire.push({
        x: x + (Math.random() - 0.5) * 10 * k,
        y: y + (Math.random() - 0.5) * 10 * k,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 120 * k,
        size: (10 + Math.random() * 16) * k,
        life: max,
        max,
        smoke: false,
      });
    }
    if (Math.random() < dt * 40) this.spawnSmoke(x, y, 1);

    // 달궈진 자리: 주황빛으로 빛나다가 서서히 식는다
    this.heatTimer -= dt;
    if (this.heatTimer <= 0) {
      this.heatTimer = 0.04;
      this.heat.push({ x, y, r: (45 + Math.random() * 20) * k, life: 2.2, max: 2.2 });
      if (this.heat.length > 150) this.heat.shift();
    }

    this.hits = Math.max(this.hits, 1);
    this.shake = Math.max(this.shake, 1.5 * k);
    this.hitRoaches(x, y, 55 * k, true);
  }

  /** 연기. life/size는 [최소, 최대], spread = 생성 범위, speed = 퍼지는 속도 (모두 1080p 기준 px) */
  spawnSmoke(
    x: number,
    y: number,
    n: number,
    o: { life?: [number, number]; size?: [number, number]; spread?: number; speed?: number } = {},
  ) {
    const k = this.k;
    const [l0, l1] = o.life ?? [0.9, 1.7];
    const [s0, s1] = o.size ?? [18, 40];
    const spread = o.spread ?? 30;
    const speed = o.speed ?? 60;
    for (let i = 0; i < n; i++) {
      const max = l0 + Math.random() * (l1 - l0);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread * 0.5;
      const sp = Math.random() * speed;
      this.fire.push({
        x: x + Math.cos(a) * r * k,
        y: y + Math.sin(a) * r * k,
        vx: Math.cos(a) * sp * k,
        vy: (Math.sin(a) * sp - (40 + Math.random() * 80)) * k,
        size: (s0 + Math.random() * (s1 - s0)) * k,
        life: max,
        max,
        smoke: true,
      });
    }
  }

  // ───────────── 도구: 폭탄 ─────────────

  private placeBomb(x: number, y: number) {
    if (this.bombs.length >= 8) return false;
    this.bombs.push({ x, y, t: 0, fuse: 1.3 + Math.random() * 0.3 });
    this.sfx.bombPlace();
    return true;
  }

  /** 폭발: 유리는 조금만 깨지고, 화구·충격파·그을음·연기가 넓게 퍼진다 */
  private explode(b: Bomb) {
    const k = this.k;
    const { x, y } = b;
    const scale = Math.min(this.w, this.h);
    const d = this.dctx;

    // 폭심 근처에만 시커멓게 탄 짧은 금
    this.active.push(
      createCrack(x, y, scale * 0.2, k, {
        rays: 6 + Math.floor(Math.random() * 4),
        width: 4,
        rings: false,
        style: CRACK_STYLE.char,
      }),
    );

    // 넓게 번진 탄 자국 → 새까만 폭심
    const outer = d.createRadialGradient(x, y, 0, x, y, 340 * k);
    outer.addColorStop(0, 'rgba(45,22,8,0.5)');
    outer.addColorStop(1, 'rgba(45,22,8,0)');
    d.fillStyle = outer;
    d.beginPath();
    d.arc(x, y, 340 * k, 0, Math.PI * 2);
    d.fill();

    const core = d.createRadialGradient(x, y, 0, x, y, 150 * k);
    core.addColorStop(0, 'rgba(5,3,2,0.96)');
    core.addColorStop(0.6, 'rgba(15,8,4,0.75)');
    core.addColorStop(1, 'rgba(15,8,4,0)');
    d.fillStyle = core;
    d.beginPath();
    d.arc(x, y, 150 * k, 0, Math.PI * 2);
    d.fill();

    // 폭풍이 쓸고 간 방사형 그을음 줄기
    d.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = 50 * k;
      const r1 = (180 + Math.random() * 260) * k;
      const x0 = x + Math.cos(a) * r0;
      const y0 = y + Math.sin(a) * r0;
      const x1 = x + Math.cos(a) * r1;
      const y1 = y + Math.sin(a) * r1;
      const lg = d.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, 'rgba(10,6,3,0.7)');
      lg.addColorStop(1, 'rgba(10,6,3,0)');
      d.strokeStyle = lg;
      d.lineWidth = (4 + Math.random() * 9) * k;
      d.beginPath();
      d.moveTo(x0, y0);
      d.lineTo(x1, y1);
      d.stroke();
    }

    // 사방으로 튄 검댕
    d.fillStyle = 'rgba(10,6,3,0.75)';
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = (120 + Math.random() * 300) * k;
      d.beginPath();
      d.arc(x + Math.cos(a) * dist, y + Math.sin(a) * dist, (2 + Math.random() * 6) * k, 0, Math.PI * 2);
      d.fill();
    }

    // 화구 + 바깥으로 밀려나는 불덩이
    this.blasts.push({ x, y, t: 0, dur: 0.7, r: 420 * k });
    for (let i = 0; i < 120; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (300 + Math.random() * 1100) * k;
      const max = 0.4 + Math.random() * 0.5;
      this.fire.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        size: (24 + Math.random() * 40) * k,
        life: max,
        max,
        smoke: false,
      });
    }

    // 오래 남아 천천히 퍼지는 연기
    this.spawnSmoke(x, y, 45, { life: [2.5, 5], size: [40, 90], spread: 260, speed: 160 });

    this.rings.push({ x, y, t: 0, dur: 0.35, r: 700 * k });
    this.rings.push({ x, y, t: 0, dur: 0.8, r: 420 * k });
    this.flashes.push({ x, y, t: 0, dur: 0.3, r: 950 * k, color: '255,150,60' });
    this.shake = Math.max(this.shake, 38 * k);
    this.spawnShards(x, y, 22, true);
    this.hits += 3;
    this.sfx.boom();
    this.hitRoaches(x, y, 260 * k, true, 700 * k);
  }

  spawnShards(x: number, y: number, base = 16, dark = false) {
    const k = this.k;
    const n = base + Math.floor(Math.random() * (base / 2));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (350 + Math.random() * 900) * k;
      const max = 0.5 + Math.random() * 0.6;
      this.shards.push({
        dark,
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

  // ───────────── 바퀴벌레 ─────────────

  /** 화면 가장자리 바깥에서 생성해 화면 안쪽 임의 지점을 향해 기어 들어오게 한다 */
  private spawnRoach() {
    const k = this.k;
    const len = (26 + Math.random() * 12) * k;
    const m = len * 2;
    const side = Math.floor(Math.random() * 4);
    let x: number;
    let y: number;
    if (side === 0) {
      x = Math.random() * this.w;
      y = -m;
    } else if (side === 1) {
      x = this.w + m;
      y = Math.random() * this.h;
    } else if (side === 2) {
      x = Math.random() * this.w;
      y = this.h + m;
    } else {
      x = -m;
      y = Math.random() * this.h;
    }
    const tx = this.w * (0.2 + Math.random() * 0.6);
    const ty = this.h * (0.2 + Math.random() * 0.6);
    const base = (140 + Math.random() * 120) * k;
    this.roaches.push({
      x,
      y,
      a: Math.atan2(ty - y, tx - x),
      speed: base,
      base,
      turn: 0,
      wander: 0.8 + Math.random(),
      pause: 0,
      flee: 0,
      phase: Math.random() * 10,
      len,
      entered: false,
      frozen: 0,
      len0: len,
      eaten: 0,
    });
  }

  /**
   * 타격 지점의 바퀴벌레는 죽이고, 근처 바퀴벌레는 놀라서 도망간다
   * @param killR  이 반경 안이면 죽음 (0이면 몸에 직접 맞았을 때만)
   * @param burnt  true면 터지는 대신 새까맣게 탄다 (화염/폭발)
   * @param fearR  이 반경 안이면 도망감
   */
  hitRoaches(x: number, y: number, killR: number, burnt = false, fearR = 320 * this.k) {
    for (let i = this.roaches.length - 1; i >= 0; i--) {
      const r = this.roaches[i];
      const d = Math.hypot(r.x - x, r.y - y);
      if (d < Math.max(killR, r.len * 0.75)) {
        this.roaches.splice(i, 1);
        if (burnt) this.charred(r);
        else this.splat(r);
        this.scoreRoach(r);
      } else if (d < fearR) {
        r.a = Math.atan2(r.y - y, r.x - x) + (Math.random() - 0.5) * 0.6;
        r.flee = 0.9;
        r.pause = 0;
      }
    }
  }

  /** 바퀴벌레 타 죽음: 새까만 몸통 + 오그라든 다리 + 연기 */
  charred(r: Roach) {
    const k = this.k;
    const d = this.dctx;
    const L = r.len;

    d.save();
    d.translate(r.x, r.y);
    d.rotate(r.a + (Math.random() - 0.5) * 0.6);
    d.strokeStyle = 'rgba(8,5,3,0.95)';
    d.lineWidth = 1.4 * k;
    d.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        const bx = (0.2 - i * 0.2) * L;
        d.beginPath();
        d.moveTo(bx, side * L * 0.1);
        d.quadraticCurveTo(bx + L * 0.12, side * L * 0.32, bx - L * 0.02, side * L * 0.22); // 오그라든 다리
        d.stroke();
      }
    }
    d.fillStyle = 'rgba(10,6,4,0.97)';
    d.beginPath();
    d.ellipse(-L * 0.05, 0, L * 0.4, L * 0.19, 0, 0, Math.PI * 2);
    d.fill();
    d.beginPath();
    d.ellipse(L * 0.38, 0, L * 0.12, L * 0.15, 0, 0, Math.PI * 2);
    d.fill();
    d.fillStyle = 'rgba(255,120,40,0.25)'; // 남은 불씨
    d.beginPath();
    d.ellipse(-L * 0.1, -L * 0.05, L * 0.12, L * 0.05, 0, 0, Math.PI * 2);
    d.fill();
    d.restore();

    this.spawnSmoke(r.x, r.y, 4);
    this.sfx.sizzle();
  }

  /** 바퀴벌레 터짐: 영구 얼룩 + 튀는 체액 + 소리 */
  splat(r: Roach) {
    const k = this.k;
    const d = this.dctx;
    const L = r.len;

    // 튄 방울
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = L * (0.4 + Math.random() * 1.4);
      const s = (1 + Math.random() * 3.5) * k;
      d.fillStyle = `rgba(${90 + Math.random() * 40},${75 + Math.random() * 30},${20 + Math.random() * 15},0.85)`;
      d.beginPath();
      d.arc(r.x + Math.cos(a) * dist, r.y + Math.sin(a) * dist, s, 0, Math.PI * 2);
      d.fill();
    }

    // 얼룩 덩어리
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = Math.random() * L * 0.35;
      d.fillStyle = i < 4 ? 'rgba(120,98,34,0.8)' : 'rgba(70,40,14,0.9)';
      d.beginPath();
      d.ellipse(
        r.x + Math.cos(a) * dist,
        r.y + Math.sin(a) * dist,
        L * (0.18 + Math.random() * 0.22),
        L * (0.12 + Math.random() * 0.15),
        Math.random() * Math.PI,
        0,
        Math.PI * 2,
      );
      d.fill();
    }

    // 납작해진 몸통 잔해 + 흩어진 다리
    d.save();
    d.translate(r.x, r.y);
    d.rotate(r.a);
    d.fillStyle = 'rgba(48,22,8,0.92)';
    d.beginPath();
    d.ellipse(0, 0, L * 0.42, L * 0.26, 0, 0, Math.PI * 2);
    d.fill();
    d.restore();
    d.strokeStyle = 'rgba(35,16,6,0.9)';
    d.lineWidth = 1.4 * k;
    d.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = L * (0.3 + Math.random() * 0.6);
      const px = r.x + Math.cos(a) * dist;
      const py = r.y + Math.sin(a) * dist;
      const la = Math.random() * Math.PI * 2;
      d.beginPath();
      d.moveTo(px, py);
      d.lineTo(px + Math.cos(la) * L * 0.3, py + Math.sin(la) * L * 0.3);
      d.stroke();
    }

    // 튀는 체액 파티클
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (200 + Math.random() * 600) * k;
      const max = 0.3 + Math.random() * 0.4;
      this.goo.push({
        x: r.x,
        y: r.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        size: (2 + Math.random() * 3.5) * k,
        life: max,
        max,
      });
    }

    this.sfx.squish();
  }

  private updateRoaches(dt: number) {
    const k = this.k;

    this.roachTimer -= dt;
    if (this.roachTimer <= 0) {
      if (this.roaches.length < (this.bugsUnlocked ? 9 : 4)) this.spawnRoach();
      this.roachTimer = this.bugsUnlocked ? 1 + Math.random() * 2.5 : 2.5 + Math.random() * 4.5;
    }

    for (let i = this.roaches.length - 1; i >= 0; i--) {
      const r = this.roaches[i];
      if (r.frozen > 0) {
        r.frozen -= dt;
        r.speed = 0;
        continue;
      }

      // 행동 바꾸기: 방향 틀기 / 가끔 멈칫
      r.wander -= dt;
      if (r.wander <= 0) {
        r.wander = 0.4 + Math.random() * 1.2;
        r.turn = r.entered ? (Math.random() - 0.5) * 3 : 0;
        if (r.entered && r.flee <= 0 && Math.random() < 0.22) r.pause = 0.3 + Math.random() * 1.1;
      }

      if (r.flee > 0) {
        r.flee -= dt;
        r.speed = r.base * 2.6;
      } else if (r.pause > 0) {
        r.pause -= dt;
        r.speed = 0;
      } else {
        r.speed = r.base;
        r.a += r.turn * dt;
        // 근처에 풀어놓은 벌레가 있으면 쫓아간다
        const prey = r.entered ? this.bugs.nearest(r.x, r.y, 350 * k) : null;
        if (prey) {
          const want = Math.atan2(prey.y - r.y, prey.x - r.x);
          let diff = want - r.a;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          r.a += diff * Math.min(1, dt * 6);
          r.pause = 0;
        }
      }

      // 벌레를 먹으면 한 단계씩 커진다 (최대 2배)
      const hx = r.x + Math.cos(r.a) * r.len * 0.45;
      const hy = r.y + Math.sin(r.a) * r.len * 0.45;
      const ate = this.bugs.eatNear(hx, hy, r.len * 0.45);
      if (ate > 0) {
        const before = this.roachStage(r);
        r.eaten += ate;
        this.sfx.chew();
        if (this.roachStage(r) > before) this.sfx.grow();
      }
      const target = r.len0 * ROACH_STAGE[this.roachStage(r)].scale;
      r.len += (target - r.len) * Math.min(1, dt * 3);

      r.x += Math.cos(r.a) * r.speed * dt;
      r.y += Math.sin(r.a) * r.speed * dt;
      r.phase += (r.speed * dt) / (4 * k) + dt * 2; // 멈춰 있어도 더듬이는 살짝 움직임

      if (r.x > 0 && r.x < this.w && r.y > 0 && r.y < this.h) r.entered = true;
      const m = r.len * 3;
      const far = r.x < -m || r.x > this.w + m || r.y < -m || r.y > this.h + m;
      if (far) this.roaches.splice(i, 1);
    }
  }

  private drawRoach(r: Roach) {
    const { ctx, k } = this;
    const L = r.len;
    const moving = r.speed > 0;

    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.a);

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2 * k, 3 * k, L * 0.5, L * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // 다리 (좌우 3쌍, 번갈아 움직임)
    ctx.strokeStyle = '#2a1408';
    ctx.lineWidth = 1.5 * k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const legX = [0.22, 0.02, -0.2];
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        const swing = moving ? Math.sin(r.phase + i * Math.PI + (side > 0 ? Math.PI : 0)) * 0.45 : 0;
        const bx = legX[i] * L;
        const by = side * L * 0.12;
        const back = (i - 1) * 0.6; // 앞다리는 앞으로, 뒷다리는 뒤로
        const a1 = side * (Math.PI / 2 + back) + swing;
        const kx = bx + Math.cos(a1) * L * 0.28;
        const ky = by + Math.sin(a1) * L * 0.28;
        const a2 = a1 + side * (0.4 + back * 0.4);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(kx, ky);
        ctx.lineTo(kx + Math.cos(a2) * L * 0.3, ky + Math.sin(a2) * L * 0.3);
        ctx.stroke();
      }
    }

    // 몸통
    const g = ctx.createLinearGradient(0, -L * 0.22, 0, L * 0.22);
    g.addColorStop(0, '#3a1a08');
    g.addColorStop(0.5, '#6e3814');
    g.addColorStop(1, '#3a1a08');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(-L * 0.06, 0, L * 0.44, L * 0.21, 0, 0, Math.PI * 2);
    ctx.fill();
    // 날개 가운데 선 + 광택
    ctx.strokeStyle = 'rgba(25,10,3,0.8)';
    ctx.lineWidth = 1 * k;
    ctx.beginPath();
    ctx.moveTo(L * 0.3, 0);
    ctx.lineTo(-L * 0.48, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,180,0.18)';
    ctx.beginPath();
    ctx.ellipse(-L * 0.02, -L * 0.08, L * 0.26, L * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // 앞가슴 + 머리
    ctx.fillStyle = '#7a4520';
    ctx.beginPath();
    ctx.ellipse(L * 0.36, 0, L * 0.12, L * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1206';
    ctx.beginPath();
    ctx.ellipse(L * 0.48, 0, L * 0.06, L * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // 더듬이 (길고 휘청거림)
    ctx.strokeStyle = '#2a1408';
    ctx.lineWidth = 1 * k;
    for (const side of [-1, 1]) {
      const wob = Math.sin(r.phase * 0.7 + side) * 0.25;
      ctx.beginPath();
      ctx.moveTo(L * 0.52, side * L * 0.04);
      ctx.quadraticCurveTo(L * 0.85, side * L * (0.12 + wob * 0.5), L * 1.25, side * L * (0.35 + wob));
      ctx.stroke();
    }

    // 많이 먹은 바퀴벌레는 등이 붉게 번들거림
    const stage = this.roachStage(r);
    if (stage > 0) {
      ctx.fillStyle = `rgba(255,90,40,${0.1 * stage})`;
      ctx.beginPath();
      ctx.ellipse(-L * 0.06, 0, L * 0.44, L * 0.21, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 얼어 있으면 하얗게 성에 낀 얼음 덧칠
    if (r.frozen > 0) {
      ctx.fillStyle = 'rgba(200,235,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(0, 0, L * 0.62, L * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1 * k;
      ctx.stroke();
    }

    ctx.restore();
  }

  /** 설치된 폭탄. 도화선이 타들어가고, 터지기 직전엔 빨갛게 깜빡이며 부풀어 오른다 */
  private drawBomb(b: Bomb) {
    const { ctx, k } = this;
    const left = b.fuse - b.t;
    const pulse = left < 0.5 ? 1 + 0.12 * Math.sin(b.t * 60) : 1;

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(pulse, pulse);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(3 * k, 15 * k, 16 * k, 5 * k, 0, 0, Math.PI * 2);
    ctx.fill();

    // 도화선 (타들어갈수록 짧아짐)
    const burn = Math.max(0, left / b.fuse);
    ctx.strokeStyle = '#c9a26b';
    ctx.lineWidth = 2.2 * k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -20 * k);
    ctx.quadraticCurveTo(2 * k, -20 * k - 10 * k * burn, 12 * k * burn, -20 * k - 8 * k * burn);
    ctx.stroke();

    ctx.fillStyle = '#4a4d52';
    ctx.fillRect(-5 * k, -21 * k, 10 * k, 6 * k);

    const g = ctx.createRadialGradient(-5 * k, -5 * k, 2 * k, 0, 0, 17 * k);
    g.addColorStop(0, '#5a5e66');
    g.addColorStop(1, '#0d0d10');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 16 * k, 0, Math.PI * 2);
    ctx.fill();

    if (left < 0.5 && Math.sin(b.t * 40) > 0) {
      ctx.fillStyle = 'rgba(255,40,30,0.45)';
      ctx.beginPath();
      ctx.arc(0, 0, 16 * k, 0, Math.PI * 2);
      ctx.fill();
    }

    // 도화선 불꽃
    ctx.globalCompositeOperation = 'lighter';
    const sx = 12 * k * burn;
    const sy = -20 * k - 8 * k * burn;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 9 * k);
    sg.addColorStop(0, 'rgba(255,240,180,0.95)');
    sg.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, 9 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
        strokeSegs(this.dctx, c.segs, c.n, k, c.style);
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

    // 체액
    for (let i = this.goo.length - 1; i >= 0; i--) {
      const p = this.goo[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.goo.splice(i, 1);
        continue;
      }
      p.vx *= Math.exp(-dt * 6);
      p.vy *= Math.exp(-dt * 6);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    this.updateRoaches(dt);

    // 총기 / 화염방사기
    this.updateGuns(dt);
    this.flameTick(dt);

    // 확장 무기: 누르고 있는 무기는 hold, 전부 update
    const t = this.trigger;
    if (t) this.weapons[t.tool]?.hold?.(t.x, t.y, dt);
    for (const wpn of Object.values(this.weapons)) wpn?.update?.(dt);

    // 화면 조각 이동 (차례로 하나씩)
    if (this.shifts.length > 0 && this.shifts[0].step(dt)) this.shifts.shift();

    // 범용 파티클
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      if (p.drag) {
        const dr = Math.exp(-dt * p.drag);
        p.vx *= dr;
        p.vy *= dr;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
    if (this.particles.length > 3000) this.particles.splice(0, this.particles.length - 3000);

    // 탄피
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.casings.splice(i, 1);
        continue;
      }
      c.vy += 2600 * k * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
    }

    // 불꽃/연기: 불꽃은 위로 솟고, 연기는 천천히 퍼진다
    for (let i = this.fire.length - 1; i >= 0; i--) {
      const f = this.fire[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.fire.splice(i, 1);
        continue;
      }
      const drag = Math.exp(-dt * (f.smoke ? 1.2 : 3.5));
      f.vx *= drag;
      f.vy = f.vy * drag - (f.smoke ? 20 : 220) * k * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.size += (f.smoke ? 30 : 14) * k * dt;
    }
    if (this.fire.length > 2000) this.fire.splice(0, this.fire.length - 2000);

    // 폭탄: 도화선 불꽃 → 시간이 되면 폭발
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.t += dt;
      if (b.t >= b.fuse) {
        this.bombs.splice(i, 1);
        this.explode(b);
        continue;
      }
      if (Math.random() < dt * 30) {
        const max = 0.15 + Math.random() * 0.15;
        const burn = 1 - b.t / b.fuse; // drawBomb의 도화선 끝 위치와 맞춘다
        this.fire.push({
          x: b.x + 12 * k * burn,
          y: b.y - 20 * k - 8 * k * burn,
          vx: (Math.random() - 0.5) * 120 * k,
          vy: -(Math.random() * 120) * k,
          size: (2 + Math.random() * 3) * k,
          life: max,
          max,
          smoke: false,
        });
      }
    }

    // 달궈진 자리 식기 / 화구
    for (let i = this.heat.length - 1; i >= 0; i--) {
      this.heat[i].life -= dt;
      if (this.heat[i].life <= 0) this.heat.splice(i, 1);
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      this.blasts[i].t += dt;
      if (this.blasts[i].t >= this.blasts[i].dur) this.blasts.splice(i, 1);
    }
    this.scopeKick *= Math.exp(-dt * 12);

    // 충격파
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].t += dt;
      if (this.rings[i].t >= this.rings[i].dur) this.rings.splice(i, 1);
    }

    // 섬광
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].t += dt;
      if (this.flashes[i].t >= this.flashes[i].dur) this.flashes.splice(i, 1);
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].t += dt;
      if (this.popups[i].t >= 0.9) this.popups.splice(i, 1);
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

    ctx.drawImage(this.base, 0, 0);
    ctx.drawImage(this.damage, 0, 0);

    // 퍼지는 중인 균열
    for (const c of this.active) {
      strokeSegs(ctx, c.segs, c.n, k, c.style);
    }

    // 달궈진 자리 (주황빛 → 식으며 사라짐)
    if (this.heat.length > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (const ht of this.heat) {
        const a = 0.3 * (ht.life / ht.max) ** 2;
        const g = ctx.createRadialGradient(ht.x, ht.y, 0, ht.x, ht.y, ht.r);
        g.addColorStop(0, `rgba(255,120,30,${a})`);
        g.addColorStop(0.6, `rgba(200,50,10,${a * 0.5})`);
        g.addColorStop(1, 'rgba(200,50,10,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ht.x, ht.y, ht.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    for (const b of this.bombs) this.drawBomb(b);
    for (const r of this.roaches) this.drawRoach(r);
    for (const wpn of Object.values(this.weapons)) wpn?.draw?.(ctx);

    // 범용 파티클 (일반)
    for (const p of this.particles) {
      if (p.additive) continue;
      this.drawParticle(p);
    }

    for (const p of this.goo) {
      ctx.fillStyle = `rgba(115,92,30,${0.9 * (p.life / p.max)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 연기 (일반 합성)
    for (const f of this.fire) {
      if (!f.smoke) continue;
      const a = 0.28 * (f.life / f.max);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size);
      g.addColorStop(0, `rgba(28,26,26,${a})`);
      g.addColorStop(1, 'rgba(28,26,26,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 섬광 / 불꽃 (밝게 겹치기)
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (p.additive) this.drawParticle(p);
    }
    for (const f of this.fire) {
      if (f.smoke) continue;
      const t = 1 - f.life / f.max; // 0 = 막 생김(노랑) → 1 = 꺼짐(빨강)
      const r = 255;
      const gg = Math.round(230 - t * 180);
      const b = Math.round(120 - t * 110);
      const a = 0.5 * (1 - t);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size);
      g.addColorStop(0, `rgba(${r},${gg},${b},${a})`);
      g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const bl of this.blasts) {
      const p = bl.t / bl.dur;
      const rad = bl.r * (0.25 + 0.75 * (1 - (1 - p) ** 3));
      const a = (1 - p) ** 1.5;
      const g = ctx.createRadialGradient(bl.x, bl.y, 0, bl.x, bl.y, rad);
      g.addColorStop(0, `rgba(255,250,225,${a})`);
      g.addColorStop(0.3, `rgba(255,180,70,${a * 0.8})`);
      g.addColorStop(0.7, `rgba(220,70,20,${a * 0.35})`);
      g.addColorStop(1, 'rgba(220,70,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const ring of this.rings) {
      const p = ring.t / ring.dur;
      const rad = ring.r * (1 - (1 - p) * (1 - p));
      ctx.strokeStyle = `rgba(255,240,220,${0.6 * (1 - p)})`;
      ctx.lineWidth = (14 * (1 - p) + 2) * k;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const f of this.flashes) {
      const a = 0.55 * (1 - f.t / f.dur);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, `rgba(${f.color},${a})`);
      g.addColorStop(1, `rgba(${f.color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // 탄피
    for (const c of this.casings) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.globalAlpha = Math.min(1, c.life * 3);
      ctx.fillStyle = '#d9a441';
      ctx.fillRect(-4 * k, -1.5 * k, 8 * k, 3 * k);
      ctx.fillStyle = '#8a5f1c';
      ctx.fillRect(3 * k, -1.5 * k, 1.5 * k, 3 * k);
      ctx.restore();
    }

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
      if (s.dark) {
        ctx.fillStyle = `rgba(28,24,22,${0.95 * a})`;
        ctx.strokeStyle = `rgba(90,70,55,${0.8 * a})`;
      } else {
        ctx.fillStyle = `rgba(215,235,255,${0.5 * a})`;
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`;
      }
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

    for (const wpn of Object.values(this.weapons)) wpn?.drawTop?.(ctx);

    // 점수 팝업
    ctx.save();
    ctx.textAlign = 'center';
    for (const p of this.popups) {
      const a = 1 - p.t / 0.9;
      ctx.font = `bold ${(p.big ? 30 : 20) * k}px Consolas, monospace`;
      ctx.shadowColor = p.big ? 'rgba(255,200,40,0.9)' : 'rgba(255,255,255,0.8)';
      ctx.shadowBlur = 10 * k;
      ctx.fillStyle = p.big ? `rgba(255,214,10,${a})` : `rgba(242,244,247,${a})`;
      ctx.fillText(p.text, p.x, p.y - 20 * k - p.t * 50 * k);
    }
    ctx.restore();

    // 화면 캔버스로 옮기고 스코프를 얹는다 (CRT처럼 출력을 대신 그리는 무기가 있으면 그쪽 우선)
    let presented = false;
    for (const wpn of Object.values(this.weapons)) {
      if (!presented && wpn?.present?.(this.out, this.scene)) presented = true;
    }
    if (!presented) {
      this.out.drawImage(this.scene, 0, 0);
      if (this.scope) this.drawScope();
    }
  }

  private drawParticle(p: Particle) {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(${p.color},${p.alpha * (p.life / p.max)})`;
    if (p.square) {
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** M4A1 레드도트 배율 스코프: 조준점 주변을 확대해서 보여준다 */
  private drawScope() {
    const { out, k } = this;
    const R = 140 * k;
    const z = this.zoom;
    const { x: ax, y: ay } = this.aim;
    // 반동: 위로 튀고 살짝 흔들림
    const cx = ax + (Math.random() - 0.5) * this.scopeKick * 0.3;
    const cy = ay - this.scopeKick;

    out.save();
    // 렌즈 바깥 그림자
    out.beginPath();
    out.arc(cx, cy, R + 12 * k, 0, Math.PI * 2);
    out.fillStyle = 'rgba(0,0,0,0.35)';
    out.fill();

    // 확대된 장면
    out.beginPath();
    out.arc(cx, cy, R, 0, Math.PI * 2);
    out.save();
    out.clip();
    const src = R / z;
    out.drawImage(this.scene, ax - src, ay - src, src * 2, src * 2, cx - R, cy - R, R * 2, R * 2);

    // 렌즈 질감: 살짝 푸른 코팅 + 가장자리 어둡게 + 반사광
    out.fillStyle = 'rgba(20,40,60,0.08)';
    out.fillRect(cx - R, cy - R, R * 2, R * 2);
    const vg = out.createRadialGradient(cx, cy, R * 0.6, cx, cy, R);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    out.fillStyle = vg;
    out.fillRect(cx - R, cy - R, R * 2, R * 2);
    const glare = out.createLinearGradient(cx - R, cy - R, cx, cy);
    glare.addColorStop(0, 'rgba(255,255,255,0.12)');
    glare.addColorStop(1, 'rgba(255,255,255,0)');
    out.fillStyle = glare;
    out.fillRect(cx - R, cy - R, R * 2, R * 2);

    // 레드도트 레티클: 바깥 링 + 눈금 + 가운데 점
    out.shadowColor = 'rgba(255,30,30,0.9)';
    out.shadowBlur = 8 * k;
    out.strokeStyle = 'rgba(255,45,45,0.85)';
    out.lineWidth = 1.6 * k;
    out.beginPath();
    out.arc(cx, cy, 34 * k, 0, Math.PI * 2);
    out.stroke();
    out.beginPath();
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      out.moveTo(cx + dx * 34 * k, cy + dy * 34 * k);
      out.lineTo(cx + dx * 44 * k, cy + dy * 44 * k);
    }
    out.stroke();
    out.fillStyle = '#ff3030';
    out.beginPath();
    out.arc(cx, cy, 2.6 * k, 0, Math.PI * 2);
    out.fill();
    out.shadowBlur = 0;

    // 렌즈 안 정보: 배율 / 탄약 / 재장전
    const g = this.guns.m4;
    out.font = `${13 * k}px Consolas, monospace`;
    out.textAlign = 'center';
    out.fillStyle = 'rgba(255,255,255,0.75)';
    out.fillText(`${z.toFixed(1)}x`, cx, cy + R - 18 * k);
    out.fillStyle = g.ammo <= 5 ? 'rgba(255,80,70,0.9)' : 'rgba(255,255,255,0.75)';
    out.fillText(`${g.ammo}`, cx + R - 30 * k, cy + 4 * k);
    if (g.reload > 0) {
      out.fillStyle = 'rgba(255,80,70,0.95)';
      out.fillText('RELOADING', cx, cy + 66 * k);
    }
    out.restore();

    // 경통 테두리
    out.lineWidth = 16 * k;
    out.strokeStyle = '#0c0c0e';
    out.beginPath();
    out.arc(cx, cy, R + 8 * k, 0, Math.PI * 2);
    out.stroke();
    out.lineWidth = 2 * k;
    out.strokeStyle = 'rgba(255,255,255,0.18)';
    out.beginPath();
    out.arc(cx, cy, R + 1 * k, 0, Math.PI * 2);
    out.stroke();
    out.restore();
  }
}
