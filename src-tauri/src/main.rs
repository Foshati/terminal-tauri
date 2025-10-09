#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::{
    io::{Read, Write},
    sync::{Arc, Mutex},
};
use tauri::State;

struct AppState {
    writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    reader: Arc<Mutex<Option<Box<dyn Read + Send>>>>,
    master: Arc<Mutex<Option<Box<dyn portable_pty::MasterPty + Send>>>>,
    slave: Arc<Mutex<Option<Box<dyn portable_pty::SlavePty + Send>>>>,
}

#[tauri::command]
async fn async_create_shell(state: State<'_, AppState>) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pty_pair = pty_system
        .openpty(PtySize {
            rows: 30,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let writer = pty_pair.master.take_writer().map_err(|e| e.to_string())?;
    let reader = pty_pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    *state.writer.lock().unwrap() = Some(writer);
    *state.reader.lock().unwrap() = Some(reader);
    *state.master.lock().unwrap() = Some(pty_pair.master);
    *state.slave.lock().unwrap() = Some(pty_pair.slave);

    let mut cmd = CommandBuilder::new("zsh");
    cmd.env("TERM", "xterm-256color");

    if let Some(ref slave) = *state.slave.lock().unwrap() {
        let _child = slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn async_write_to_pty(data: &str, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(ref mut writer) = *state.writer.lock().unwrap() {
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn async_read_from_pty(state: State<'_, AppState>) -> Result<String, String> {
    if let Some(ref mut reader) = *state.reader.lock().unwrap() {
        let mut buffer = [0u8; 4096];
        match reader.read(&mut buffer) {
            Ok(0) => Ok(String::new()),
            Ok(n) => Ok(String::from_utf8_lossy(&buffer[..n]).to_string()),
            Err(_) => Ok(String::new()),
        }
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
async fn async_resize_pty(rows: u16, cols: u16, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(ref master) = *state.master.lock().unwrap() {
        master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            writer: Arc::new(Mutex::new(None)),
            reader: Arc::new(Mutex::new(None)),
            master: Arc::new(Mutex::new(None)),
            slave: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            async_write_to_pty,
            async_resize_pty,
            async_create_shell,
            async_read_from_pty
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}