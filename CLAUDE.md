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
3. **워치독 타이머** (`lib.rs`): `MAX_RUN_SECS`(60초) 뒤 반드시 종료, `app.exit(0)` 후 2초 뒤 `process::exit(0)`
4. **창은 `overlay_ready` 전까지 숨김**: 프론트가 실패하면 창이 뜨지 않고 `READY_TIMEOUT_SECS` 뒤 종료

추가 규칙
- 종료 로직은 가장 단순하게 유지한다 (복잡한 조건 분기 금지).
- 전체화면/항상 위 설정은 종료 안전장치가 코드에 있을 때만 켠다.
- 멀티 모니터는 **주 모니터 1개만** 지원한다 (확장하지 않는다).

## 2. 구조

```
src-tauri/src/lib.rs   캡처(xcap) · 워치독 · 전역 ESC · 커맨드 4개
                       screenshot_status / get_screenshot / overlay_ready / quit_app
src/App.tsx            시작 시퀀스, 키보드, HUD, 망치 커서
src/game/engine.ts     캔버스 렌더 루프, 도구별 타격 처리 (hit)
src/game/crack.ts      유리 금 생성/그리기
src/game/audio.ts      WebAudio 효과음 합성
```

시작 시퀀스: 앱 실행 → 5초 대기(바탕화면 정리) → 주 모니터 캡처(창은 숨김 상태) → 프론트가 이미지로 첫 화면을 그림
→ `overlay_ready` → 전체화면으로 표시(이때 화면이 바탕화면과 똑같아 보임) → 부수기 시작.

## 3. 작업 단계

- 1단계 (현재): 스크린샷 전체화면 + 안전장치 + 망치(유리 금) 1종
- 2단계: 총(총알 자국+균열), 화염방사기(그을음), 폭탄(폭발+파편) 추가 — `engine.ts`의 `hit()` switch에 case 추가
- 3단계: 엔딩 연출 — 유리 조각이 우수수 떨어지며 진짜 바탕화면이 드러남
  (오버레이 창을 투명 + 클릭 통과로 전환해야 하므로 `set_ignore_cursor_events`를 **창이 보이기 전에** 적용하는 CursorToy 패턴 재사용)

## 4. 컨셉/톤

어두운 시네마틱 톤 + 레트로 게임 HUD(앰버 모노스페이스) 약간. 릴스 촬영용이므로 `H`로 HUD를 숨길 수 있어야 한다.

## 5. 알려진 주의점

- 캔버스 해상도는 **스크린샷 해상도 기준**이다 (창이 숨겨진 상태에서 만들어져 `window.innerWidth`가 800이기 때문).
- 숨겨진 창에서는 `requestAnimationFrame`이 멈출 수 있어서, 시작 시퀀스에서 rAF를 기다리지 않는다.
- `xcap` 0.9의 Monitor API는 전부 `Result`를 반환한다. 버전을 올리면 시그니처부터 확인한다.
- `tauri-plugin-global-shortcut`은 Rust 1.90 이상이 필요하다.
- Rust 쪽 Tauri/플러그인 내부 동작은 확정적으로 단정하지 말고, 의심되면 깜자에게 확인을 요청한다.
