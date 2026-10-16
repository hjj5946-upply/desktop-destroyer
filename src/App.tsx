import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DestroyEngine, type ToolId } from './game/engine';
import { CURSOR_SVG, HOLD_TOOLS, ICON_SVG, TOOLS, type ToolInfo } from './tools';
import './App.css';

/** 인벤토리 슬롯 수 (빈 칸 포함, 무기가 늘어나면 자리만 채우면 됨) */
const INV_COLS = 6;
const INV_SLOTS = 24;
const SLOT = 64;
const GAP = 8;
const PAD = 12;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const quit = () => {
  void invoke('quit_app');
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DestroyEngine | null>(null);
  const mutedRef = useRef(false);
  const hitsRef = useRef(0);
  const toastTimer = useRef(0);
  const toolRef = useRef<ToolId>('hammer');

  const [tool, setTool] = useState<ToolId>('hammer');
  const [hud, setHud] = useState(true);
  const [muted, setMuted] = useState(false);
  /** 우클릭 인벤토리 위치 (null이면 닫힘) */
  const [inv, setInv] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<ToolInfo | null>(null);
  /** 누적 타격 횟수 (Space 초기화해도 유지) */
  const [hits, setHits] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  /** 엔진의 탄약 상태가 바뀌면 증가 (다시 그리기용) */
  const [, setAmmoTick] = useState(0);

  // 벌레 풀기 해금 → 바퀴벌레 증가
  const bugsAt = TOOLS.find((t) => t.id === 'bugs')?.unlockAt ?? Infinity;
  useEffect(() => {
    if (engineRef.current) engineRef.current.bugsUnlocked = hits >= bugsAt;
  }, [hits, bugsAt]);

  useEffect(() => {
    toolRef.current = tool;
    if (engineRef.current) {
      engineRef.current.scope = tool === 'm4';
      engineRef.current.tool = tool;
    }
  }, [tool]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  /** 미션 점수 추가 (엔진 콜백에서 호출되므로 ref/setter만 사용) */
  const addScore = (n: number) => {
    const prev = hitsRef.current;
    const next = prev + n;
    hitsRef.current = next;
    setHits(next);
    const opened = TOOLS.filter((x) => x.ready && x.unlockAt > prev && x.unlockAt <= next);
    if (opened.length > 0) showToast(`${opened[opened.length - 1].label} UNLOCKED`);
  };

  /** 공격이 나갈 때마다 커서 반동 */
  const kickCursor = () => {
    const inner = cursorRef.current?.firstElementChild;
    if (!inner) return;
    inner.classList.remove('hit');
    void (inner as HTMLElement).offsetWidth; // 연사 중에도 애니메이션이 다시 걸리도록
    inner.classList.add('hit');
    window.setTimeout(() => inner.classList.remove('hit'), 70);
  };

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
        engine.onScore = addScore;
        engine.onFire = kickCursor;
        engine.onAmmo = () => setAmmoTick((v) => v + 1);
        engine.scope = toolRef.current === 'm4';
        engine.tool = toolRef.current;
        engine.bugsUnlocked = hitsRef.current >= (TOOLS.find((t) => t.id === 'bugs')?.unlockAt ?? Infinity);
        engineRef.current = engine;
        engine.start(); // 첫 프레임은 동기적으로 그려짐

        // 창이 숨겨진 동안은 브라우저가 렌더링을 쉴 수 있으므로 rAF 대신 잠깐 시간만 둔다
        await sleep(200);
        if (cancelled) return;

        await invoke('overlay_ready');
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

  // ── 키보드: ESC 종료 / H HUD / M 음소거 / Space 초기화 / R 재장전 ──
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
        if (engineRef.current) {
          engineRef.current.sfx.muted = next;
          if (next) engineRef.current.sfx.stopAll();
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) engineRef.current?.reset();
      } else if (key === 'r') {
        engineRef.current?.reload(toolRef.current);
      } else if (key === 'u' && e.shiftKey) {
        // 촬영/테스트용: Shift+U = 전체 해금
        const need = Math.max(...TOOLS.map((t) => t.unlockAt));
        if (hitsRef.current < need) addScore(need - hitsRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const unlocked = (t: ToolInfo) => hits >= t.unlockAt;
  const usable = (t: ToolInfo) => t.ready && unlocked(t);

  // ── 마우스: 커서 이동 / 클릭 타격 ──
  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = cursorRef.current;
    if (el) el.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    engineRef.current?.move(e.clientX, e.clientY);
  };

  // ── 연사/분사 중지: 마우스를 떼거나 창이 포커스를 잃으면 ──
  useEffect(() => {
    const stop = () => {
      engineRef.current?.release();
      cursorRef.current?.firstElementChild?.classList.remove('firing');
    };
    window.addEventListener('mouseup', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('blur', stop);
    };
  }, []);

  const openInventory = (cx: number, cy: number) => {
    // 화면 밖으로 나가지 않게 위치 보정
    const rows = Math.ceil(INV_SLOTS / INV_COLS);
    const w = PAD * 2 + INV_COLS * SLOT + (INV_COLS - 1) * GAP;
    const h = PAD * 2 + 22 + rows * SLOT + (rows - 1) * GAP;
    const x = Math.max(8, Math.min(cx, window.innerWidth - w - 8));
    const y = Math.max(8, Math.min(cy, window.innerHeight - h - 8));
    setHover(null);
    setInv({ x, y });
  };

  const closeInventory = () => {
    setInv(null);
    setHover(null);
  };

  const pickTool = (t: ToolInfo) => {
    if (!usable(t)) return;
    engineRef.current?.release();
    setTool(t.id);
    closeInventory();
  };

  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    const inInventory = (e.target as HTMLElement).closest('.inventory');
    if (e.button === 2) {
      engineRef.current?.release();
      if (!inInventory) openInventory(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    if (inInventory) return; // 슬롯 클릭은 타격 아님
    if (inv) {
      closeInventory(); // 열려 있으면 바깥 클릭은 닫기만
      return;
    }
    if (!engineRef.current) return;
    // 점수/커서 반동은 엔진 콜백(onScore/onFire)에서 처리
    engineRef.current.press(tool, e.clientX, e.clientY);
    if (HOLD_TOOLS.includes(tool)) cursorRef.current?.firstElementChild?.classList.add('firing');
  };

  const toolInfo = TOOLS.find((t) => t.id === tool)!;
  const ammo = engineRef.current?.ammoInfo(tool) ?? null;
  const cursorSvg = CURSOR_SVG[tool];
  const [bx, by, bw, bh] = cursorSvg.box;

  return (
    <div
      className="stage"
      onMouseMove={onMouseMove}
      onMouseDown={onMouseDown}
      onWheel={(e) => tool === 'm4' && engineRef.current?.zoomBy(e.deltaY < 0 ? 1 : -1)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} />

      {/* 무기 커서 (시스템 커서는 숨김, (0,0)이 클릭 위치) */}
      <div className="cursor" ref={cursorRef} style={{ transform: 'translate(50vw, 50vh)' }}>
        <div className={'cursor-inner ' + tool}>
          {toolInfo.cursor ? (
            <img
              src={toolInfo.cursor.src}
              alt=""
              draggable={false}
              style={{ position: 'absolute', left: -toolInfo.cursor.hotX, top: -toolInfo.cursor.hotY, width: toolInfo.cursor.width }}
            />
          ) : (
            <svg width={bw} height={bh} viewBox={`${bx} ${by} ${bw} ${bh}`} style={{ position: 'absolute', left: bx, top: by }}>
              {cursorSvg.body}
            </svg>
          )}
        </div>
      </div>

      {hud && (
        <>
          <div className="hud hud-keys">
            <span className="keyhint">
              {/* 마우스 (오른쪽 버튼 강조) */}
              <svg width="16" height="22" viewBox="0 0 16 22" aria-hidden="true">
                <rect x="1" y="1" width="14" height="20" rx="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 1 A7 7 0 0 1 15 8 V9 H8 Z" fill="currentColor" />
                <line x1="1" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="1.2" />
                <line x1="8" y1="1" x2="8" y2="9" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              Inven
            </span>
            <span className="keyhint">
              <kbd className="space">SPACE</kbd>
              Return
            </span>
            {ammo && (
              <span className="keyhint">
                <kbd>R</kbd>
                Reload
              </span>
            )}
            {tool === 'm4' && (
              <span className="keyhint">
                <kbd>WHEEL</kbd>
                Zoom
              </span>
            )}
            <span className="keyhint">
              <kbd>ESC</kbd>
              Exit
            </span>
          </div>

          {ammo && (
            <div className="hud hud-ammo">
              <div className="ammo-count">
                <b className={ammo.ammo === 0 ? 'empty' : ''}>{ammo.ammo}</b>
                <span>/ {ammo.mag}</span>
              </div>
              <div className={'ammo-pips' + (ammo.mag > 10 ? ' dense' : '')}>
                {Array.from({ length: ammo.mag }, (_, i) => (
                  <i key={i} className={i < ammo.ammo ? 'on' : ''} />
                ))}
              </div>
              {ammo.reloading && (
                <div className="ammo-reload">
                  <span>RELOADING</span>
                  <div className="bar">
                    <div
                      style={{
                        animationDuration: `${ammo.reloadDur}s`,
                        animationDelay: `-${ammo.reloadDur - ammo.reloadLeft}s`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="hud hud-help">
            H HUD 숨김 · M {muted ? '소리 켜기' : '음소거'}
          </div>

          {toast && (
            <div className="hud hud-toast" key={toast}>
              <b>{toast}</b>
              <span>Right-click to equip</span>
            </div>
          )}
        </>
      )}

      {/* 우클릭 인벤토리 (HUD를 숨겨도 우클릭하면 뜬다) */}
      {inv && (
        <div className="inventory" style={{ left: inv.x, top: inv.y }} onMouseLeave={() => setHover(null)}>
          <div className="inv-title">INVENTORY</div>
          <div className="inv-grid" style={{ gridTemplateColumns: `repeat(${INV_COLS}, ${SLOT}px)`, gap: GAP }}>
            {Array.from({ length: INV_SLOTS }, (_, i) => {
              const t = TOOLS[i];
              const style = { width: SLOT, height: SLOT, animationDelay: `${i * 35}ms` };
              if (!t) return <div key={i} className="slot empty" style={style} />;
              const svg = ICON_SVG[t.id] ?? CURSOR_SVG[t.id];
              return (
                <div
                  key={t.id}
                  className={'slot' + (tool === t.id ? ' active' : '') + (usable(t) ? '' : ' locked')}
                  style={style}
                  onMouseEnter={() => setHover(t)}
                  onClick={() => pickTool(t)}
                >
                  {t.icon ? (
                    <img src={t.icon} alt={t.label} draggable={false} />
                  ) : (
                    <svg width="42" height="42" viewBox={svg.box.join(' ')}>
                      {svg.body}
                    </svg>
                  )}
                  {!unlocked(t) ? <i>LOCK</i> : !t.ready && <i>SOON</i>}
                </div>
              );
            })}
          </div>

          {hover && (
            <div className={'inv-tooltip' + (inv.y > window.innerHeight / 2 ? ' above' : '')}>
              <b>{hover.label}</b>
              <p>{hover.desc}</p>
              {!unlocked(hover) ? (
                <em>
                  LOCKED · {hits} / {hover.unlockAt} pts (Roach = +5~15)
                </em>
              ) : (
                !hover.ready && <em>COMING SOON</em>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
