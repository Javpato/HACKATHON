use crate::storage::LocalDatabase;
use base64::Engine;
use serde::Serialize;
use std::io::Read;
use std::sync::Mutex;
use tauri::Manager;

struct DatabaseState(Mutex<Result<LocalDatabase, String>>);

#[tauri::command]
fn load_local(state: tauri::State<DatabaseState>) -> Result<Option<String>, String> {
    let guard = state.0.lock().map_err(|_| "Almacenamiento no disponible.")?;
    guard.as_ref().map_err(Clone::clone)?.load()
}

#[tauri::command]
fn save_local(state: tauri::State<DatabaseState>, json: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "Almacenamiento no disponible.")?;
    guard.as_mut().map_err(|e| e.clone())?.save(&json)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChosenFile { name: String, kind: String, content: String, private_path: String }

/// No path argument. Only the local OS picker grants this read; no command execution exists.
#[tauri::command]
async fn choose_local_file() -> Result<Option<ChosenFile>, String> {
    let selection = rfd::AsyncFileDialog::new()
        .add_filter("Código, texto, foto o PDF", &["txt", "md", "ts", "tsx", "js", "json", "py", "rs", "c", "cpp", "h", "css", "html", "java", "cs", "sql", "png", "jpg", "jpeg", "pdf"])
        .pick_file().await;
    let Some(file) = selection else { return Ok(None); };
    let path = file.path();
    let opened = std::fs::File::open(path).map_err(|_| "No se pudo abrir el archivo seleccionado.")?;
    let metadata = opened.metadata().map_err(|_| "No se pudo comprobar el archivo.")?;
    if !metadata.is_file() || metadata.len() > 4 * 1024 * 1024 { return Err("Elige un archivo de hasta 4 MiB.".into()); }
    let mut bytes = Vec::new();
    opened.take(4 * 1024 * 1024 + 1).read_to_end(&mut bytes).map_err(|_| "No se pudo leer el archivo.")?;
    if bytes.len() > 4 * 1024 * 1024 { return Err("El archivo supera 4 MiB.".into()); }
    let (kind, content) = if bytes.starts_with(b"%PDF-") {
        ("pdf", base64::engine::general_purpose::STANDARD.encode(&bytes))
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") || bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        ("image", base64::engine::general_purpose::STANDARD.encode(&bytes))
    } else {
        if bytes.len() > 1024 * 1024 { return Err("El editor admite hasta 1 MiB.".into()); }
        let text = String::from_utf8(bytes).map_err(|_| "Formato no permitido. Elige texto UTF-8, PNG, JPEG o PDF.")?;
        if text.contains('\0') { return Err("No se admiten archivos binarios en el editor.".into()); }
        ("text", text)
    };
    Ok(Some(ChosenFile { name: file.file_name(), kind: kind.into(), content, private_path: path.to_string_lossy().into_owned() }))
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let database = app.path().app_data_dir().map_err(|_| "No se pudo localizar el directorio de la aplicación.".to_string()).and_then(|dir| {
                std::fs::create_dir_all(&dir).map_err(|_| "No se pudo crear el directorio local.".to_string())?;
                LocalDatabase::open(&dir.join("studyvillage.sqlite3"))
            });
            app.manage(DatabaseState(Mutex::new(database)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_local, save_local, choose_local_file])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar StudyVillage");
}
