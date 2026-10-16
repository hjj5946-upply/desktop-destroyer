/**
 * 효과음: 파일 없이 WebAudio로 즉석 합성한다.
 * (유리 "쨍!" 노이즈 + 묵직한 "쿵" 저음)
 */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;

  private ensure(): AudioContext {
    if (!this.ctx) {
      const AC: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /** 유리 금 가는 소리 */
  crack() {
    if (this.muted) return;
    const ctx = this.ensure();
    const now = ctx.currentTime;

    // 1) 고음 노이즈 (유리 깨지는 질감)
    const len = Math.floor(ctx.sampleRate * 0.3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.7, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    noise.connect(hp);
    hp.connect(ng);
    ng.connect(ctx.destination);
    noise.start(now);

    // 2) 저음 타격감
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.9, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(og);
    og.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /** 짧은 노이즈 버스트 (필터 종류/주파수/길이/볼륨 지정) */
  private burst(type: BiquadFilterType, freq: number, dur: number, vol: number, at = 0) {
    const ctx = this.ensure();
    const now = ctx.currentTime + at;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start(now);
  }

  /** 낮은 "퉁" 톤 */
  private thump(from: number, to: number, dur: number, vol: number, at = 0, type: OscillatorType = 'sine') {
    const ctx = this.ensure();
    const now = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  /** 총: 날카로운 "탕" */
  gunshot() {
    if (this.muted) return;
    this.burst('lowpass', 3500, 0.12, 0.6);
    this.burst('highpass', 3200, 0.04, 0.3);
    this.thump(200, 70, 0.08, 0.5);
  }

  /** M4A1: 권총보다 짧고 날카로운 "탕" (연사용) */
  rifle() {
    if (this.muted) return;
    this.burst('lowpass', 4500, 0.14, 1);
    this.burst('highpass', 3500, 0.05, 0.6);
    this.thump(160, 45, 0.1, 1);
  }

  /** 탄 없을 때 "틱" */
  dryFire() {
    if (this.muted) return;
    this.thump(2400, 1800, 0.025, 0.3);
  }

  /** 재장전 시작: 탄창 빼는 "철컥" */
  reloadStart() {
    if (this.muted) return;
    this.burst('bandpass', 2200, 0.05, 0.5);
    this.thump(900, 500, 0.04, 0.3);
  }

  /** 재장전 끝: 탄창 끼우고 장전하는 "철-컥" */
  reloadEnd() {
    if (this.muted) return;
    this.burst('bandpass', 1800, 0.05, 0.6);
    window.setTimeout(() => {
      if (this.muted) return;
      this.burst('bandpass', 3000, 0.07, 0.6);
      this.thump(700, 350, 0.05, 0.35);
    }, 110);
  }

  /** 폭탄 설치: 짧은 "딸깍" */
  bombPlace() {
    if (this.muted) return;
    this.thump(1200, 700, 0.04, 0.25);
  }

  /** 폭발: 길고 묵직한 "콰앙" */
  boom() {
    if (this.muted) return;
    this.thump(90, 22, 0.9, 1.2);
    this.burst('lowpass', 600, 1.1, 1.1);
    this.burst('highpass', 1800, 0.35, 0.5);
  }

  /** 바퀴벌레 타는 "치익" */
  sizzle() {
    if (this.muted) return;
    this.burst('highpass', 4000, 0.3, 0.3);
  }

  private flameSrc: AudioBufferSourceNode | null = null;
  private flameGain: GainNode | null = null;

  /** 화염방사기: 분사하는 동안 "화르르" 반복 재생 */
  flameStart() {
    if (this.muted || this.flameSrc) return;
    const ctx = this.ensure();
    const now = ctx.currentTime;
    const len = ctx.sampleRate; // 1초짜리 노이즈를 반복
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      // 가끔 튀는 "탁탁" 소리를 섞어 불타는 질감
      data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.002 ? 3 : 1);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.45, now + 0.08);
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start(now);
    this.flameSrc = src;
    this.flameGain = g;
  }

  flameStop() {
    const src = this.flameSrc;
    const g = this.flameGain;
    this.flameSrc = null;
    this.flameGain = null;
    if (!src || !g || !this.ctx) return;
    const now = this.ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.001), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    src.stop(now + 0.2);
  }

  /** 바퀴벌레 터지는 "찍" 소리 */
  squish() {
    if (this.muted) return;
    this.burst('bandpass', 700, 0.12, 0.9);
    this.burst('lowpass', 400, 0.18, 0.7);
    this.thump(220, 60, 0.08, 0.5);
  }

  // ───────────── 확장 무기 ─────────────

  private loops = new Map<string, () => void>();

  /** 1초짜리 노이즈를 반복 재생하는 소스 */
  private noise(ctx: AudioContext) {
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  /** 누르고 있는 동안 반복되는 소리 (드릴 윙~ / 레이저 지잉~ / 타는 소리) */
  loopStart(key: 'drill' | 'laser' | 'burn') {
    if (this.muted || this.loops.has(key)) return;
    const ctx = this.ensure();
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.001, now);
    out.connect(ctx.destination);
    const nodes: AudioScheduledSourceNode[] = [];
    let vol = 0.2;

    if (key === 'drill') {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 140;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 18;
      const lg = ctx.createGain();
      lg.gain.value = 25;
      lfo.connect(lg);
      lg.connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1500;
      o.connect(f);
      f.connect(out);
      const n = this.noise(ctx);
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 3200;
      const ng = ctx.createGain();
      ng.gain.value = 0.5;
      n.connect(nf);
      nf.connect(ng);
      ng.connect(out);
      nodes.push(o, lfo, n);
      vol = 0.22;
    } else if (key === 'laser') {
      for (const fr of [880, 886]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = fr;
        o.connect(out);
        nodes.push(o);
      }
      const n = this.noise(ctx);
      const nf = ctx.createBiquadFilter();
      nf.type = 'highpass';
      nf.frequency.value = 5000;
      const ng = ctx.createGain();
      ng.gain.value = 0.4;
      n.connect(nf);
      nf.connect(ng);
      ng.connect(out);
      nodes.push(n);
      vol = 0.1;
    } else {
      const n = this.noise(ctx);
      const nf = ctx.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.value = 900;
      n.connect(nf);
      nf.connect(out);
      nodes.push(n);
      vol = 0.16;
    }

    out.gain.exponentialRampToValueAtTime(vol, now + 0.08);
    nodes.forEach((nd) => nd.start(now));
    this.loops.set(key, () => {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(out.gain.value, 0.001), t);
      out.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      nodes.forEach((nd) => nd.stop(t + 0.15));
    });
  }

  loopStop(key: string) {
    this.loops.get(key)?.();
    this.loops.delete(key);
  }

  /** 반복 소리 전부 정지 (앱 종료 / 음소거) */
  stopAll() {
    for (const stop of this.loops.values()) stop();
    this.loops.clear();
    this.flameStop();
  }

  /** 레이저로 갈라질 때 "쩌억" */
  laserSplit() {
    if (this.muted) return;
    this.burst('highpass', 2500, 0.25, 0.6);
    this.thump(120, 40, 0.3, 0.8);
  }

  /** 지진: 길게 우르릉 */
  rumble() {
    if (this.muted) return;
    this.burst('lowpass', 120, 1.8, 1.3);
    this.burst('lowpass', 400, 0.6, 0.6);
    this.thump(60, 25, 1.3, 1);
  }

  /** 번개: 날카로운 "콰직" + 뒤따르는 천둥 */
  thunder() {
    if (this.muted) return;
    this.burst('highpass', 2000, 0.15, 1);
    this.burst('lowpass', 800, 0.3, 0.8);
    this.burst('lowpass', 200, 1.9, 1.1, 0.15);
    this.thump(70, 30, 1.2, 0.8, 0.1);
  }

  /** 냉동: "치이익" */
  freeze() {
    if (this.muted) return;
    this.burst('highpass', 5000, 0.6, 0.3);
    this.burst('bandpass', 8000, 0.35, 0.18);
  }

  /** 얼음 깨짐: 높고 맑은 "쨍그랑" */
  iceShatter() {
    if (this.muted) return;
    this.burst('highpass', 4000, 0.45, 0.9);
    for (let i = 0; i < 5; i++) {
      const f = 2000 + Math.random() * 2500;
      this.thump(f, f * 0.8, 0.12, 0.18, i * 0.04, 'triangle');
    }
  }

  /** 산성액: "치익~" + 보글 */
  acid() {
    if (this.muted) return;
    this.burst('highpass', 3000, 0.9, 0.35);
    this.burst('bandpass', 600, 0.2, 0.4);
    for (let i = 0; i < 4; i++) this.thump(500 + Math.random() * 500, 900, 0.04, 0.12, 0.15 + i * 0.12);
  }

  /** 페인트탄: "퍽" */
  paint() {
    if (this.muted) return;
    this.burst('bandpass', 500, 0.1, 0.9);
    this.thump(300, 80, 0.08, 0.7);
  }

  /** 글리치: 디지털 삑삑 */
  glitch() {
    if (this.muted) return;
    for (let i = 0; i < 12; i++) {
      const f = 200 + Math.random() * 1800;
      this.thump(f, f, 0.035, 0.08, i * 0.05, 'square');
      if (Math.random() < 0.4) this.burst('highpass', 6000, 0.03, 0.25, i * 0.05);
    }
  }

  /** 블랙홀: 낮게 웅~ 하다가 빨려 들어가는 소리 */
  blackhole() {
    if (this.muted) return;
    const ctx = this.ensure();
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(55, now);
    o.frequency.exponentialRampToValueAtTime(28, now + 3.2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(200, now);
    f.frequency.exponentialRampToValueAtTime(900, now + 1.6);
    f.frequency.exponentialRampToValueAtTime(120, now + 3.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 1.2);
    g.gain.exponentialRampToValueAtTime(0.001, now + 3.3);
    o.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 3.4);
    this.thump(200, 30, 0.4, 0.6, 3.1);
  }

  /** 중력 해제: 와르르 */
  crumble() {
    if (this.muted) return;
    this.burst('highpass', 3000, 0.2, 0.5);
    for (let i = 0; i < 7; i++) this.burst('lowpass', 1200 + Math.random() * 800, 0.08, 0.5, 0.1 + i * 0.06);
  }

  /** 벌레 풀기: 사각사각 */
  chitter() {
    if (this.muted) return;
    for (let i = 0; i < 8; i++) this.burst('highpass', 5000, 0.02, 0.3, i * 0.04);
  }

  /** 벌레가 갉아먹는 작은 소리 */
  chew() {
    if (this.muted) return;
    this.burst('bandpass', 4000, 0.025, 0.15);
  }

  /** 바퀴벌레가 한 단계 커짐: "뿌욱" */
  grow() {
    if (this.muted) return;
    this.thump(120, 260, 0.18, 0.5, 0, 'triangle');
  }

  /** 운석 떨어지는 "슈우" */
  whoosh() {
    if (this.muted) return;
    this.burst('bandpass', 700, 0.5, 0.35);
  }

  /** 운석 충돌 */
  impact() {
    if (this.muted) return;
    this.thump(100, 30, 0.4, 0.9);
    this.burst('lowpass', 700, 0.5, 0.7);
  }

  /** CRT 꺼짐: "뚝" + 높은 잔음 */
  crtOff() {
    if (this.muted) return;
    this.thump(800, 40, 0.3, 0.4);
    this.burst('highpass', 3000, 0.06, 0.3);
    this.thump(12000, 11000, 0.9, 0.04);
  }

  /** CRT 켜짐: "팅" */
  crtOn() {
    if (this.muted) return;
    this.thump(40, 600, 0.15, 0.3);
    this.burst('highpass', 2500, 0.1, 0.25);
  }

  /** 프레스 내려옴: 유압 "치이익" */
  pressDown() {
    if (this.muted) return;
    this.burst('bandpass', 1800, 0.35, 0.4);
  }

  /** 프레스 쾅: 묵직한 충격 + 철판 울림 */
  clang() {
    if (this.muted) return;
    this.thump(90, 35, 0.5, 1.2);
    this.burst('lowpass', 900, 0.3, 0.8);
    this.thump(320, 300, 1.2, 0.25, 0, 'triangle');
    this.thump(475, 460, 0.9, 0.15, 0, 'triangle');
  }

  /** 스티커: "뽁" */
  sticker() {
    if (this.muted) return;
    this.thump(380, 950, 0.09, 0.35);
    this.burst('highpass', 3000, 0.03, 0.15);
  }

  /** 되감기: 테이프 감기는 "끼리릭" */
  rewind() {
    if (this.muted) return;
    const ctx = this.ensure();
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, now);
    o.frequency.exponentialRampToValueAtTime(1800, now + 1.6);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 22;
    const lg = ctx.createGain();
    lg.gain.value = 60;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.1, now + 0.1);
    g.gain.setValueAtTime(0.1, now + 1.5);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.7);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    lfo.start(now);
    o.stop(now + 1.75);
    lfo.stop(now + 1.75);
  }

  /** 되감기 끝: "딸깍" */
  rewindEnd() {
    if (this.muted) return;
    this.thump(1500, 900, 0.04, 0.3);
    this.burst('bandpass', 2500, 0.05, 0.4);
  }

  /** 쓰나미: 점점 커지는 물소리 */
  tsunami() {
    if (this.muted) return;
    const ctx = this.ensure();
    const now = ctx.currentTime;
    const n = this.noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, now);
    f.frequency.exponentialRampToValueAtTime(1200, now + 2.2);
    f.frequency.exponentialRampToValueAtTime(250, now + 5.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.7, now + 2.2);
    g.gain.exponentialRampToValueAtTime(0.25, now + 4.5);
    g.gain.exponentialRampToValueAtTime(0.001, now + 5.8);
    n.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    n.start(now);
    n.stop(now + 6);
  }

  /** 파도가 덮침: "촤아악" */
  splash() {
    if (this.muted) return;
    this.burst('lowpass', 2500, 1.2, 1);
    this.burst('highpass', 1500, 0.6, 0.5);
    this.thump(80, 30, 0.6, 0.8);
  }

  /** 핵 경보: 삐- 뽀- */
  alarm() {
    if (this.muted) return;
    this.thump(880, 880, 0.2, 0.12, 0, 'square');
    this.thump(660, 660, 0.2, 0.12, 0.25, 'square');
  }

  /** 핵폭발: 아주 길고 묵직한 굉음 */
  nukeBoom() {
    if (this.muted) return;
    this.thump(50, 18, 3, 1.4);
    this.burst('lowpass', 300, 3.5, 1.3);
    this.burst('highpass', 1500, 0.6, 0.5);
    this.burst('lowpass', 120, 4, 0.9, 0.3);
  }

  /** 엔딩: 유리가 연달아 깨져 떨어짐 */
  shatterCascade() {
    if (this.muted) return;
    for (let i = 0; i < 12; i++) {
      this.burst('highpass', 3000 + Math.random() * 2000, 0.25, 0.4, 0.3 + i * 0.13);
      const f = 2500 + Math.random() * 2000;
      this.thump(f, f * 0.7, 0.1, 0.1, 0.3 + i * 0.13, 'triangle');
    }
  }
}
