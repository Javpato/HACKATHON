use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::path::Path;

pub const MAX_LOCAL_BYTES: usize = 2 * 1024 * 1024;

/// An internal database location only. No renderer or peer supplies a SQL statement or path.
pub struct LocalDatabase { connection: Connection }

pub fn validate_document(json: &str) -> Result<(), String> {
    if json.len() > MAX_LOCAL_BYTES { return Err("Datos locales demasiado grandes (2 MiB).".into()); }
    let value: Value = serde_json::from_str(json).map_err(|_| "Datos locales inválidos.")?;
    let obj = value.as_object().ok_or("Se esperaba un documento local.")?;
    let allowed = ["schemaVersion", "profile", "house", "friendCode", "contacts", "encryptedIdentity", "editor", "projectLinks"];
    if obj.len() != allowed.len() || obj.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err("Campos locales no permitidos; no se guardará una caché de sesión.".into());
    }
    if value["schemaVersion"].as_u64() != Some(1) { return Err("Versión local no compatible; conserva la base de datos.".into()); }
    if !value["profile"].is_object() || !(value["house"].is_null() || value["house"].is_object())
        || !value["friendCode"].is_string() || !value["editor"].is_string()
        || value["contacts"].as_array().is_none_or(|v| v.len() > 100)
        || value["projectLinks"].as_object().is_none_or(|v| v.len() > 32) {
        return Err("Tipos o límites locales inválidos.".into());
    }
    let encrypted = &value["encryptedIdentity"];
    if !encrypted.is_null() {
        let object = encrypted.as_object().ok_or("Identidad cifrada inválida.")?;
        let keys = ["v", "kdf", "iterations", "salt", "iv", "ciphertext", "publicIdentity"];
        if object.len() != keys.len() || object.keys().any(|key| !keys.contains(&key.as_str()))
            || encrypted["v"].as_u64() != Some(1) || encrypted["kdf"].as_str() != Some("PBKDF2-SHA256")
            || !encrypted["ciphertext"].is_string() {
            return Err("Solo se permite persistir una identidad cifrada.".into());
        }
    }
    Ok(())
}

impl LocalDatabase {
    pub fn open(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(|_| "No se pudo abrir SQLite. No se ha borrado ningún dato.")?;
        Self::initialize(connection)
    }
    pub fn memory() -> Result<Self, String> {
        Self::initialize(Connection::open_in_memory().map_err(|_| "SQLite no disponible.")?)
    }
    fn initialize(mut connection: Connection) -> Result<Self, String> {
        let result: String = connection.query_row("PRAGMA quick_check", [], |row| row.get(0))
            .map_err(|_| "SQLite dañada. Conserva una copia de la base antes de repararla.")?;
        if result != "ok" { return Err("SQLite dañada; se conserva la copia original.".into()); }
        let version: u32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0)).map_err(|_| "No se pudo leer la versión de SQLite.")?;
        if version > 1 { return Err("La base de datos pertenece a una versión posterior. No se modificó.".into()); }
        if version == 0 {
            let tx = connection.transaction().map_err(|_| "No se pudo iniciar la migración.")?;
            tx.execute_batch("CREATE TABLE IF NOT EXISTS local_state (id INTEGER PRIMARY KEY CHECK (id = 1), document TEXT NOT NULL); PRAGMA user_version = 1;")
                .map_err(|_| "Migración fallida; no se guardaron cambios.")?;
            tx.commit().map_err(|_| "No se pudo confirmar la migración.")?;
        }
        Ok(Self { connection })
    }
    pub fn load(&self) -> Result<Option<String>, String> {
        let json: Option<String> = self.connection.query_row("SELECT document FROM local_state WHERE id=1", [], |row| row.get(0))
            .optional().map_err(|_| "No se pudieron leer los datos. No se ha borrado nada.")?;
        if let Some(ref text) = json { validate_document(text)?; }
        Ok(json)
    }
    pub fn save(&mut self, json: &str) -> Result<(), String> {
        validate_document(json)?;
        let tx = self.connection.transaction().map_err(|_| "SQLite no está disponible para guardar.")?;
        tx.execute("INSERT INTO local_state (id, document) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET document=excluded.document", params![json])
            .map_err(|_| "No se pudo guardar. Comprueba el espacio disponible; se conserva la copia anterior.")?;
        tx.commit().map_err(|_| "No se pudo confirmar el guardado.")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn document(editor: &str) -> String { serde_json::json!({"schemaVersion":1,"profile":{"displayName":"A","color":"#aabbcc"},"house":null,"friendCode":"friend-code","contacts":[],"encryptedIdentity":null,"editor":editor,"projectLinks":{}}).to_string() }
    #[test]
    fn migration_and_roundtrip() {
        let mut db = LocalDatabase::memory().unwrap();
        assert_eq!(db.load().unwrap(), None);
        db.save(&document("hello")).unwrap();
        assert_eq!(db.load().unwrap(), Some(document("hello")));
        db.save(&document("new")).unwrap();
        assert_eq!(db.load().unwrap(), Some(document("new")));
    }
    #[test]
    fn invalid_save_preserves_previous_data() {
        let mut db = LocalDatabase::memory().unwrap(); db.save(&document("keep")).unwrap();
        assert!(db.save("{\"schemaVersion\":99}").is_err());
        assert!(db.save(&"x".repeat(MAX_LOCAL_BYTES + 1)).is_err());
        assert_eq!(db.load().unwrap(), Some(document("keep")));
    }
    #[test]
    fn rejects_session_caches_and_plaintext_keys() {
        let mut value: Value = serde_json::from_str(&document("")).unwrap();
        value["remoteHouses"] = serde_json::json!([]);
        assert!(validate_document(&value.to_string()).is_err());
        value.as_object_mut().unwrap().remove("remoteHouses");
        value["encryptedIdentity"] = serde_json::json!({"privateKey":"no"});
        assert!(validate_document(&value.to_string()).is_err());
    }
    #[test]
    fn newer_schema_is_never_reset() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA user_version=2;").unwrap();
        assert!(LocalDatabase::initialize(connection).is_err());
    }
    #[test]
    fn corrupted_data_is_reported_without_overwriting() {
        let db = LocalDatabase::memory().unwrap();
        db.connection.execute("INSERT INTO local_state VALUES(1, 'broken')", []).unwrap();
        assert!(db.load().is_err());
        let text: String = db.connection.query_row("SELECT document FROM local_state", [], |r| r.get(0)).unwrap();
        assert_eq!(text, "broken");
    }
}
