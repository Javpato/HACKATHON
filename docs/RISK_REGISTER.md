# Riesgos abiertos

| Riesgo | Control implementado / verificación requerida |
|---|---|
| Captura Tauri Linux | Diagnóstico compartido; build/captura nativa pendiente de bibliotecas del sistema y prueba real. No elegir runtime por intuición. |
| NAT o proveedor PeerJS inaccesible | Timeouts y reintento; STUN explícito; sin TURN ni promesa de conexión universal. |
| Identidad persistente | Clave en RAM por defecto; persistencia cifrada opt-in por contraseña. Sin integración con keyring del SO; sin recuperación si se pierde contraseña. |
| Host malicioso / enlaces filtrados | Host controla admisión/roster, cada dueño su casa; aprobación manual, huellas, invitaciones revocables. Colaboradores autorizados pueden copiar lo que ven. |
| Concurrencia y congestión | Límites de conexiones, mensajes, colas y trazos; pruebas automatizadas. Seis clientes reales y stress de medios pendientes. |
| Privacidad local | Proyección de campos públicos, archivos elegidos localmente, sin shell/IPC de rutas arbitrarias; SQLite no cifra los proyectos locales. |
| Corrupción de datos | Versionado, transacción, error visible sin reset automático; respaldar datos antes de reparación manual. |
| Windows | Configuración NSIS y CI provistas; no build ni ejecución Windows observada en este entorno. |
| Licencias/publicación | Decisión humana pendiente para código/assets; ninguna release ni repo público creados. |
| GitHub | Token inválido; workflows no ejecutados remotamente. |

P2/P3 conservados: múltiples pantallas y métricas 3–6 participantes, transferencia validada de packs, webcam/audio del sistema, editor colaborativo, IA local opt-in, plugins sandboxed, reputación/karma. No ejecutar plugins o código recibido.
