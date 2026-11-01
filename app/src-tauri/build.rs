fn main() {
    #[cfg(feature = "desktop")]
    {
        let attributes = tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["load_local", "save_local", "choose_local_file", "open_external"]),
        );
        tauri_build::try_build(attributes).expect("Tauri build configuration is invalid");
    }
}
