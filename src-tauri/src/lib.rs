use std::fs;
use std::path::PathBuf;
use tauri::{Manager, Window};

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn saves_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?.join("saves");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

/// A save id maps to `<app-data>/saves/<id>.json`. Ids are restricted to a safe
/// character set so no path traversal is possible.
fn safe_save_id(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '.' || *c == '_')
        .collect::<String>()
}

#[tauri::command]
fn save_file_list(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = saves_dir(&app)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Some(name) = entry.file_name().to_str() {
            if let Some(stem) = name.strip_suffix(".json") {
                out.push(stem.to_string());
            }
        }
    }
    out.sort();
    Ok(out)
}

#[tauri::command]
fn save_file_read(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    let path = saves_dir(&app)?.join(format!("{}.json", safe_save_id(&id)));
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file_write(app: tauri::AppHandle, id: String, data: String) -> Result<(), String> {
    let path = saves_dir(&app)?.join(format!("{}.json", safe_save_id(&id)));
    fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = saves_dir(&app)?.join(format!("{}.json", safe_save_id(&id)));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn settings_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn settings_write(app: tauri::AppHandle, json: String) -> Result<(), String> {
    fs::write(settings_path(&app)?, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_display_mode(window: Window, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "fullscreen" => window.set_fullscreen(true).map_err(|e| e.to_string()),
        "borderless" => {
            window.set_decorations(false).map_err(|e| e.to_string())?;
            window.set_fullscreen(false).map_err(|e| e.to_string())
        }
        _ => {
            window.set_decorations(true).map_err(|e| e.to_string())?;
            window.set_fullscreen(false).map_err(|e| e.to_string())
        }
    }
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save_file_list,
            save_file_read,
            save_file_write,
            save_file_delete,
            settings_read,
            settings_write,
            set_display_mode,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running ProjectAtlas");
}
