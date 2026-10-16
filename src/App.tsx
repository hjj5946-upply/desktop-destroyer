import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DestroyEngine, type ToolId } from './game/engine';
import './App.css';

interface ToolInfo {
  id: ToolId;
  key: string;
  label: string;
  /** 구현 완료 여부 (1단계에서는 망치만 true) */
  ready: boolean;
}

const TOOLS: ToolInfo[] = [
  { id: 'hammer', key: '1', label: 'HAMMER', ready: true },
  { id: 'gun', key: '2', label: 'GUN', ready: false },
  { id: 'flame', key: '3', label: 'FLAME', ready: false },
  { id: 'bomb', key: '4', label: 'BOMB', ready: false },
];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const quit = () => {
  void invoke('quit_app');
};
const fmt = (sec: number | null) =>
  sec === null ? '--:--' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hammerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DestroyEngine | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const mutedRef = useRef(false);

  const [tool, setTool] = useState<ToolId>('hammer');
  const [hud, setHud] = useState(true);
  const [muted, setMuted] = useState(false);
  const [remain, setRemain] = useState<number | null>(null);

  // ── 시작: 스크린샷 받기 → 엔진 시작 → 첫 화면을 그린 뒤 Rust에 "창 띄워도 됨" 신호 ──
  useEffect(() => {
    let cancelled = false;
    let engine: DestroyEngine | null = null;

    (async () => {
      try {
        // 캡처가 끝날 때까지 대기 (Rust가 5초 뒤 캡처)
        for (;;) {
          if (cancelled) return;
          const status = await invoke<string>('screenshot_status');
          if (status === 'ready') break;
          if (status.startsWith('error')) throw new Error(status);
          await sleep(150);
        }

        const buf = await invoke<ArrayBuffer>('get_screenshot');
        const bitmap = await createImageBitmap(new Blob([buf], { type: 'image/png' }));
        if (cancelled || !canvasRef.current) return;

        engine = new DestroyEngine(canvasRef.current, bitmap);
        engine.sfx.muted = mutedRef.current;
        engineRef.current = engine;
        engine.start(); // 첫 프레임은 동기적으로 그려짐

        // 창이 숨겨진 동안은 브라우저가 렌더링을 쉴 수 있으므로 rAF 대신 잠깐 시간만 둔다
        await sleep(200);
        if (cancelled) return;

        const secs = await invoke<number>('overlay_ready');
        deadlineRef.current = performance.now() + secs * 1000;
      } catch (e) {
        console.error('[desktop-destroyer] 시작 실패', e);
        quit();
      }
    })();

    return () => {
      cancelled = true;
      engine?.stop();
    };
  }, []);

  // ── 남은 시간 표시 ──
  useEffect(() => {
    const id = window.setInterval(() => {
      if (deadlineRef.current !== null) {
        setRemain(Math.max(0, Math.ceil((deadlineRef.current - performance.now()) / 1000)));
      }
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // ── 키보드: ESC 종료 / H HUD / M 음소거 / R 되돌리기 / 1~4 도구 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'escape') {
        quit();
      } else if (key === 'h') {
        setHud((v) => !v);
      } else if (key === 'm') {
        const next = !mutedRef.current;
        mutedRef.current = next;
        setMuted(next);
        if (engineRef.current) engineRef.current.sfx.muted = next;
      } else if (key === 'r') {
        engineRef.current?.reset();
      } else {
        const t = TOOLS.find((x) => x.key === key && x.ready);
        if (t) setTool(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── 마우스: 망치 커서 이동 / 클릭 타격 ──
  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = hammerRef.current;
    if (el) el.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  };

  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.hud')) return; // HUD 클릭은 타격 아님
    engineRef.current?.hit(tool, e.clientX, e.clientY);

    const inner = hammerRef.current?.firstElementChild;
    if (inner) {
      inner.classList.add('hit');
      window.setTimeout(() => inner.classList.remove('hit'), 90);
    }
  };

  return (
    <div className="stage" onMouseMove={onMouseMove} onMouseDown={onMouseDown} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} />

      {/* 망치 커서 (시스템 커서는 숨김, 끝점이 클릭 위치) */}
      <div className="hammer" ref={hammerRef} style={{ transform: 'translate(50vw, 50vh)' }}>
        <div className="hammer-inner">
          <svg width="120" height="120" viewBox="-30 -80 120 120" style={{ position: 'absolute', left: -30, top: -80 }}>
            <rect x="-5" y="-78" width="10" height="46" rx="3" fill="#8a5a2b" stroke="#2b1a0b" strokeWidth="2" />
            <rect x="-27" y="-36" width="54" height="36" rx="5" fill="#9aa3ad" stroke="#1d2329" strokeWidth="2.5" />
            <rect x="-27" y="-36" width="54" height="10" rx="5" fill="#c8d0d8" opacity="0.7" />
            <rect x="-27" y="-8" width="54" height="8" rx="3" fill="#6c757e" />
          </svg>
        </div>
      </div>

      {hud && (
        <>
          <div className="hud hud-top">
            <span>DESKTOP DESTROYER</span>
            <span className="timer">AUTO-EXIT {fmt(remain)}</span>
          </div>

          <div className="hud hud-bottom">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                tabIndex={-1}
                disabled={!t.ready}
                className={'tool' + (tool === t.id ? ' active' : '')}
                onClick={() => t.ready && setTool(t.id)}
              >
                <b>{t.key}</b>
                <span>{t.label}</span>
                {!t.ready && <i>SOON</i>}
              </button>
            ))}
          </div>

          <div className="hud hud-help">
            ESC 종료 · H HUD 숨김 · R 되돌리기 · M {muted ? '소리 켜기' : '음소거'}
          </div>
        </>
      )}
    </div>
  );
}
