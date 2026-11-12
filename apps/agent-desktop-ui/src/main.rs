#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(windows)]
mod agent;
#[cfg(windows)]
mod app;
#[cfg(windows)]
mod model;
#[cfg(windows)]
mod policy_form;
#[cfg(windows)]
mod theme;
#[cfg(windows)]
mod views;
#[cfg(windows)]
mod widgets;

#[cfg(windows)]
fn main() -> eframe::Result {
    app::run()
}

#[cfg(not(windows))]
fn main() {
    eprintln!("Mimorii Agent desktop controls are available on Windows");
}
