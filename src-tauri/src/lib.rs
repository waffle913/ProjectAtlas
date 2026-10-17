use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
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
/// character set so no path traversal is possible. An id that filters down to
/// nothing is rejected by the callers.
fn safe_save_id(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '.' || *c == '_')
        .collect::<String>()
}

/// Crash-safe file replacement: write to a same-directory temp file, sync it to
/// disk, then atomically rename over the target. On failure the pre-existing
/// target is left intact and the temp file is removed. `std::fs::rename` on
/// Windows uses `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`, so the rename is
/// atomic on the supported platforms.
fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "invalid save path".to_string())?;
    let tmp_name = format!("{file_name}.tmp");
    let tmp = path.with_file_name(tmp_name.as_str());

    let write_result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(data)?;
        file.sync_all()?;
        Ok(())
    })();
    if let Err(error) = write_result {
        let _ = fs::remove_file(&tmp);
        return Err(error.to_string());
    }

    if let Err(error) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
fn save_file_list(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = saves_dir(&app)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if name.ends_with(".json.tmp") {
            // Best-effort cleanup of a temp file left behind by an interrupted write.
            let _ = fs::remove_file(&path);
            continue;
        }
        if let Some(stem) = name.strip_suffix(".json") {
            out.push(stem.to_string());
        }
    }
    out.sort();
    Ok(out)
}

#[tauri::command]
fn save_file_read(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    let safe = safe_save_id(&id);
    if safe.is_empty() {
        return Err("invalid save id".to_string());
    }
    let path = saves_dir(&app)?.join(format!("{safe}.json"));
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file_write(app: tauri::AppHandle, id: String, data: String) -> Result<(), String> {
    let safe = safe_save_id(&id);
    if safe.is_empty() {
        return Err("invalid save id".to_string());
    }
    let path = saves_dir(&app)?.join(format!("{safe}.json"));
    atomic_write(&path, data.as_bytes())
}

#[tauri::command]
fn save_file_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let safe = safe_save_id(&id);
    if safe.is_empty() {
        return Err("invalid save id".to_string());
    }
    let path = saves_dir(&app)?.join(format!("{safe}.json"));
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
    atomic_write(&settings_path(&app)?, json.as_bytes())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_save_id_strips_path_separators() {
        let id = safe_save_id("..\\..\\windows\\system32");
        assert!(!id.contains('/') && !id.contains('\\'));
        // Dots are permitted characters but no separator survives, so the id is a
        // single flat filename and cannot traverse out of the saves directory.
        assert_eq!(id, "....windowssystem32");
    }

    #[test]
    fn safe_save_id_rejects_id_that_filters_to_empty() {
        assert_eq!(safe_save_id("///\\\\"), "");
        assert_eq!(safe_save_id(""), "");
    }

    #[test]
    fn atomic_write_roundtrip_replaces_and_cleans_temp() {
        let dir = std::env::temp_dir().join("projectatlas_atomic_test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("slot.one.json");
        atomic_write(&path, b"first").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "first");
        atomic_write(&path, b"second-longer").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "second-longer");
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "temp file left behind: {leftovers:?}");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn atomic_write_cleans_temp_when_rename_fails() {
        let dir = std::env::temp_dir().join("projectatlas_atomic_rename_fail");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("slot.one.json");
        atomic_write(&target, b"original").unwrap();
        // Replace the target file with a directory so the rename cannot succeed.
        fs::remove_file(&target).unwrap();
        fs::create_dir_all(&target).unwrap();
        assert!(atomic_write(&target, b"new").is_err());
        // The temp file must have been cleaned up.
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "temp file left behind: {leftovers:?}");
        let _ = fs::remove_dir_all(&dir);
    }
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
