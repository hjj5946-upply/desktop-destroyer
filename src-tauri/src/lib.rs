//! 바탕화면 부수기 - Rust 백엔드
//!
//! 역할
//!  1. 앱 시작 후 CAPTURE_DELAY_SECS 초 뒤에 주 모니터를 캡처 (창이 아직 숨겨져 있을 때)
//!  2. 프론트가 캡처 이미지를 불러와 첫 화면을 그린 뒤 `overlay_ready`를 부르면 창을 전체화면으로 띄움
//!  3. 안전장치 (이 프로젝트에서 가장 중요한 부분!)
//!     - 전역 ESC 단축키: 웹뷰가 멈추거나 포커스를 잃어도 종료 가능
//!     - 시작 워치독: 프론트가 준비 신호를 못 보내면(오류 등) 창을 띄우지 않고 READY_TIMEOUT_SECS 초 뒤 종료
//!       (오버레이가 뜬 뒤에는 시간 제한 없음. 종료는 ESC로만 한다)

use std::{
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use tauri::{ipc::Response, AppHandle, Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

/// 앱 시작 후 캡처까지 기다리는 시간. 이 사이에 바탕화면을 정리(Win+D 등)한다.
const CAPTURE_DELAY_SECS: u64 = 5;
/// 캡처 이후 프론트가 `overlay_ready`를 불러야 하는 제한 시간. 넘기면 앱 종료.
const READY_TIMEOUT_SECS: u64 = 20;

enum ShotData {
    Pending,
    Ready(Vec<u8>),
    Failed(String),
}

struct AppState {
    shot: Mutex<ShotData>,
    /// 이 시각이 지나면 워치독이 앱을 종료한다. None이면 시간 제한 없음(오버레이 표시 후).
    deadline: Mutex<Option<Instant>>,
}

/// 주 모니터를 캡처해서 PNG 바이트로 돌려준다.
fn capture_primary_png() -> Result<Vec<u8>, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("모니터를 찾지 못했습니다".to_string());
    }
    // 주 모니터 우선, 못 찾으면 첫 번째 모니터
    let idx = monitors
        .iter()
        .position(|m| m.is_primary().unwrap_or(false))
        .unwrap_or(0);
    let img = monitors[idx].capture_image().map_err(|e| e.to_string())?;

    let (w, h) = (img.width(), img.height());
    let mut raw = img.into_raw();
    // 캡처 결과의 알파가 0으로 오는 경우를 막기 위해 전부 불투명으로 고정
    for px in raw.chunks_exact_mut(4) {
        px[3] = 255;
    }

    let mut out: Vec<u8> = Vec::with_capacity(raw.len() / 3);
    {
        use image::{
            codecs::png::{CompressionType, FilterType, PngEncoder},
            ExtendedColorType, ImageEncoder,
        };
        PngEncoder::new_with_quality(&mut out, CompressionType::Fast, FilterType::Adaptive)
            .write_image(&raw, w, h, ExtendedColorType::Rgba8)
            .map_err(|e| e.to_string())?;
    }
    Ok(out)
}

// ───────────────────────── 프론트에서 부르는 커맨드 ─────────────────────────

/// "pending" | "ready" | "error: ..."
#[tauri::command]
fn screenshot_status(state: State<AppState>) -> String {
    match &*state.shot.lock().unwrap() {
        ShotData::Pending => "pending".to_string(),
        ShotData::Ready(_) => "ready".to_string(),
        ShotData::Failed(e) => format!("error: {e}"),
    }
}

/// 캡처된 PNG 바이트 (JS에서는 ArrayBuffer로 받음)
#[tauri::command]
fn get_screenshot(state: State<AppState>) -> Result<Response, String> {
    match &*state.shot.lock().unwrap() {
        ShotData::Ready(bytes) => Ok(Response::new(bytes.clone())),
        _ => Err("아직 캡처되지 않았습니다".to_string()),
    }
}

/// 프론트가 첫 화면을 그린 뒤 호출 -> 창을 전체화면으로 띄우고 시작 워치독을 해제한다.
#[tauri::command]
fn overlay_ready(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main 창을 찾지 못했습니다".to_string())?;

    // 캡처한 주 모니터 위로 이동한 뒤 전체화면 (작업표시줄까지 덮음)
    if let Ok(Some(mon)) = win.primary_monitor() {
        let _ = win.set_position(*mon.position());
        let _ = win.set_size(*mon.size());
    }
    win.set_always_on_top(true).map_err(|e| e.to_string())?;
    win.set_fullscreen(true).map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    let _ = win.set_focus();

    // 정상적으로 떴으므로 시간 제한 해제 (이후 종료는 ESC)
    *state.deadline.lock().unwrap() = None;
    Ok(())
}

/// ESC 등으로 프론트에서 종료 요청
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

// ───────────────────────────────── 앱 시작 ─────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        // 전역 ESC: 등록된 단축키는 ESC 하나뿐이라 어떤 단축키가 눌렸는지 따로 검사하지 않는다.
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if matches!(event.state(), ShortcutState::Pressed) {
                        app.exit(0);
                    }
                })
                .build(),
        )
        .manage(AppState {
            shot: Mutex::new(ShotData::Pending),
            // 처음에는 "캡처 대기 + 준비 제한시간"까지만 살아 있도록 설정
            deadline: Mutex::new(Some(
                Instant::now() + Duration::from_secs(CAPTURE_DELAY_SECS + READY_TIMEOUT_SECS),
            )),
        })
        .invoke_handler(tauri::generate_handler![
            screenshot_status,
            get_screenshot,
            overlay_ready,
            quit_app
        ])
        .setup(|app| {
            // 1) 전역 ESC 등록 (실패해도 앱은 계속 진행 - 프론트 ESC가 있으므로)
            if let Err(e) = app
                .global_shortcut()
                .register(Shortcut::new(None, Code::Escape))
            {
                eprintln!("[desktop-destroyer] 전역 ESC 등록 실패: {e}");
            }

            // 2) 시작 워치독: 100ms마다 마감 시각 확인. 마감이 지나면 종료. (마감이 None이면 통과)
            //    app.exit()가 먹지 않는 최악의 경우를 대비해 2초 뒤 프로세스를 강제 종료한다.
            let watchdog_app = app.handle().clone();
            thread::spawn(move || loop {
                thread::sleep(Duration::from_millis(100));
                let deadline = *watchdog_app.state::<AppState>().deadline.lock().unwrap();
                if deadline.is_some_and(|d| Instant::now() >= d) {
                    eprintln!("[desktop-destroyer] 시간 초과 - 종료합니다");
                    watchdog_app.exit(0);
                    thread::sleep(Duration::from_secs(2));
                    std::process::exit(0);
                }
            });

            // 3) 캡처 스레드: 메인 스레드를 막지 않도록 별도 스레드에서 대기 후 캡처
            let capture_app = app.handle().clone();
            thread::spawn(move || {
                println!(
                    "[desktop-destroyer] {CAPTURE_DELAY_SECS}초 뒤 화면을 캡처합니다. 바탕화면을 정리하세요! (ESC = 종료)"
                );
                for left in (1..=CAPTURE_DELAY_SECS).rev() {
                    println!("  캡처까지 {left}...");
                    thread::sleep(Duration::from_secs(1));
                }

                let result = capture_primary_png();
                let state = capture_app.state::<AppState>();
                match result {
                    Ok(png) => {
                        println!("[desktop-destroyer] 캡처 완료 ({} KB)", png.len() / 1024);
                        *state.shot.lock().unwrap() = ShotData::Ready(png);
                    }
                    Err(e) => {
                        eprintln!("[desktop-destroyer] 캡처 실패: {e}");
                        *state.shot.lock().unwrap() = ShotData::Failed(e);
                        capture_app.exit(1);
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri 앱 실행 중 오류가 발생했습니다");
}
