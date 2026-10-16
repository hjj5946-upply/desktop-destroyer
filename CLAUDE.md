# CLAUDE.md — 바탕화면 부수기 (Desktop Destroyer)

이 파일은 이 저장소에서 Claude Code가 지켜야 할 **최우선 규칙**이다.

## 0. 안전 규칙 (비타협)

- **자체 실행 금지**: 코드는 작성/수정하되, 아래 행동은 절대 스스로 하지 않는다.
  - `npm run tauri dev`, `npm run tauri build`, `cargo run`, `cargo build`, `cargo test`
  - 앱을 띄우는 모든 명령, 테스트/빌드 반복 사이클, 백그라운드 실행
  - 실행·테스트·화면 확인은 **깜자가 직접** 한다. Claude는 "확인 순서(번호 목록)"만 제시한다.
- 이유: 이전 CursorToy 프로젝트에서 전체화면 오버레이가 불안정하게 자동 실행되어 모니터가 먹통이 된 사고가 있었다.
  이 앱도 전체화면 + 항상 위 오버레이라 같은 위험 구조다.
- 단순 문법/타입 점검 목적의 `cargo check`, `tsc --noEmit`도 깜자가 요청하기 전에는 돌리지 않는다.

## 1. 종료 안전장치 (절대 약화/제거 금지)

수정할 때 아래 4가지는 항상 유지한다. 새 기능을 넣다가 이 중 하나라도 깨질 가능성이 있으면 작업을 멈추고 먼저 알린다.

1. **전역 ESC** (`src-tauri/src/lib.rs`, tauri-plugin-global-shortcut): 웹뷰가 멈춰도 종료
2. **프론트 ESC** (`App.tsx`의 keydown → `quit_app`)
3. **시작 워치독** (`lib.rs`): `overlay_ready` 전까지만 동작. 마감이 지나면 `app.exit(0)` 후 2초 뒤 `process::exit(0)`
   - 오버레이가 뜬 뒤의 실행 시간 제한(구 `MAX_RUN_SECS` 60초)은 깜자 요청으로 제거함 (2026-10-16). 종료는 ESC로만 한다.
   - 예외: 진짜 바탕화면 엔딩(`enter_reveal`, 투명 + 클릭 통과)에 들어가면 `REVEAL_SECS`(12초) 마감을 다시 건다 (깜자 승인).
     전역 ESC 등록에 실패했으면 `enter_reveal`은 거부되고 스크린샷 엔딩으로 진행한다.
4. **창은 `overlay_ready` 전까지 숨김**: 프론트가 실패하면 창이 뜨지 않고 `READY_TIMEOUT_SECS` 뒤 종료

추가 규칙
- 종료 로직은 가장 단순하게 유지한다 (복잡한 조건 분기 금지).
- 전체화면/항상 위 설정은 종료 안전장치가 코드에 있을 때만 켠다.
- 멀티 모니터는 **주 모니터 1개만** 지원한다 (확장하지 않는다).

## 2. 구조

```
src-tauri/src/lib.rs   캡처(xcap) · 워치독 · 전역 ESC · 커맨드 5개
                       screenshot_status / get_screenshot / overlay_ready / enter_reveal / quit_app
src/App.tsx            시작 시퀀스, 키보드, HUD, 인벤토리, 무기 커서
src/tools.tsx          무기 목록(이름/설명/해금 점수) + 기본 커서·아이콘 SVG
src/game/engine.ts     캔버스 렌더 루프, 기본 무기 5종(망치/권총/M4A1/화염/폭탄), 바퀴벌레, 스코프
src/game/weapons/      확장 무기 15종 (engine에 Weapon 인터페이스로 꽂힘)
  util.ts              Weapon 인터페이스, 범용 파티클, 화면 조각 이동(RegionShift)
  tools.ts             드릴/레이저/돋보기/냉동총/산성액/페인트
  disasters.ts         지진/번개/운석/블랙홀/중력해제/벌레
  special.ts           글리치/CRT OFF/핵폭탄(+엔딩)
  extra.ts             거대 프레스/스티커/시간 되감기/쓰나미
src/game/crack.ts      유리 금 생성/그리기 (무기별 색 CRACK_STYLE, 테마 글로우 CrackTint)
src/game/grid.ts       격자 상태 맵 (셀 피해/플래그, 파괴율 BREAK_GOAL, 임시 플래그 수명)
src/game/combo.ts      콤보 + SCORE (해금 점수와 별개)
src/game/reactions.ts  무기 조합 규칙표 (e.react(속성, x, y, r)로 판정)
src/game/theme.ts      화면 뒤 세계 테마 (T키)
src/game/collapse.ts   시스템 붕괴 연출 (노이즈/어두운 깜빡임/경고 패널)
src/game/devlog.ts     개발자 유머 로그 (L키)
src/game/ending.ts     엔딩 연출: RewindEnding(Space/시간 되감기 무기) · ShatterEnding(100%/핵폭탄 유리 조각 낙하)
src/game/audio.ts      WebAudio 효과음 합성
```

시작 시퀀스: 앱 실행 → 5초 대기(바탕화면 정리) → 주 모니터 캡처(창은 숨김 상태) → 프론트가 이미지로 첫 화면을 그림
→ `overlay_ready` → 전체화면으로 표시(이때 화면이 바탕화면과 똑같아 보임) → 부수기 시작.

## 3. 작업 단계

- 1단계 (완료): 스크린샷 전체화면 + 안전장치 + 망치(유리 금)
- 2단계 (완료): 무기 24종(핵폭탄이 마지막) + 누적 점수 해금(바퀴벌레 1마리=5점, Shift+U 전체 해금) + 우클릭 인벤토리 + 바퀴벌레
  - 입력은 `engine.ts`의 `press/move/release`, 총기 제원은 `GUN_SPEC`
  - 화면을 비트는 무기는 `engine.base`(스크린샷 사본)를 직접 고친다. Space 초기화 때 스크린샷으로 복구
  - 무기 이미지는 `tools.tsx`의 `TOOLS[].icon`(인벤토리) / `TOOLS[].cursor`(커서)로 교체, 없으면 기본 SVG
  - 핵폭탄 엔딩은 창 투명화 없이 "깨끗한 스크린샷"을 드러내는 방식 (진짜 바탕화면 노출은 3단계)
- 3단계: 엔딩 연출 — 유리 조각이 우수수 떨어지며 진짜 바탕화면이 드러남
  (오버레이 창을 투명 + 클릭 통과로 전환해야 하므로 `set_ignore_cursor_events`를 **창이 보이기 전에** 적용하는 CursorToy 패턴 재사용)

## 4. 컨셉/톤

어두운 시네마틱 톤 + 게임 HUD(블랙 패널 + 화이트 네온 모노스페이스) 약간. 릴스 촬영용이므로 `H`로 HUD를 숨길 수 있어야 한다.

## 5. 알려진 주의점

- 캔버스 해상도는 **스크린샷 해상도 기준**이다 (창이 숨겨진 상태에서 만들어져 `window.innerWidth`가 800이기 때문).
- 숨겨진 창에서는 `requestAnimationFrame`이 멈출 수 있어서, 시작 시퀀스에서 rAF를 기다리지 않는다.
- `xcap` 0.9의 Monitor API는 전부 `Result`를 반환한다. 버전을 올리면 시그니처부터 확인한다.
- `tauri-plugin-global-shortcut`은 Rust 1.90 이상이 필요하다.
- Rust 쪽 Tauri/플러그인 내부 동작은 확정적으로 단정하지 말고, 의심되면 깜자에게 확인을 요청한다.
