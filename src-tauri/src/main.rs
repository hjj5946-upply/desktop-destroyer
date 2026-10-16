// 릴리즈 빌드에서 콘솔 창이 같이 뜨지 않게 함
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    desktop_destroyer_lib::run()
}
