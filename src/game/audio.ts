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
}
