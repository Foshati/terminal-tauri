#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{Arc, Mutex},
};
use tauri::State;

struct TerminalSession {
    writer: Box<dyn Write + Send>,
    reader: Box<dyn Read + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    _slave: Box<dyn portable_pty::SlavePty + Send>,
}

struct AppState {
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

#[tauri::command]
async fn async_create_shell(tab_id: String, state: State<'_, AppState>) -> Result<(), String> {
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

    let mut cmd = CommandBuilder::new("zsh");
    cmd.env("TERM", "xterm-256color");

    let _child = pty_pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let session = TerminalSession {
        writer,
        reader,
        master: pty_pair.master,
        _slave: pty_pair.slave,
    };

    state.sessions.lock().unwrap().insert(tab_id, session);

    Ok(())
}

#[tauri::command]
async fn async_write_to_pty(data: &str, tab_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&tab_id) {
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn async_read_from_pty(tab_id: String, state: State<'_, AppState>) -> Result<String, String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&tab_id) {
        let mut buffer = [0u8; 4096];
        match session.reader.read(&mut buffer) {
            Ok(0) => Ok(String::new()),
            Ok(n) => Ok(String::from_utf8_lossy(&buffer[..n]).to_string()),
            Err(_) => Ok(String::new()),
        }
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
async fn async_resize_pty(tab_id: String, rows: u16, cols: u16, state: State<'_, AppState>) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&tab_id) {
        session.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn async_close_shell(tab_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.sessions.lock().unwrap().remove(&tab_id);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        })
        .invoke_handler(tauri::generate_handler![
            async_write_to_pty,
            async_resize_pty,
            async_create_shell,
            async_read_from_pty,
            async_close_shell
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}