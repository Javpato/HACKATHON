# Tres megaprompts para reconstruir StudyVillage 0.2.0 + cámaras 0.2.1

Entrega cada Markdown completo a la otra IA junto con su proyecto antiguo. No necesita esta conversación. Son documentos largos: conviene adjuntarlos como archivos para que no se pierdan los anexos al copiar.

Para llegar a la versión completa, aplicar **1 → 2 → 3**. Puedes detenerte después de 1 o 2 para conservar las distribuciones sin juegos o sin IA.

| Documento | Resultado |
|---|---|
| `01_BASE_VISUAL_Y_FUNCIONES_CLASICAS.md` | Madera/papel, shell, escenas, sprint, decoración, pizarras independientes, apuntes, VS Code, sesiones/medios y tarjetas manuales. Sin juegos ni IA. |
| `02_JUEGOS_Y_CONCURSOS_SIN_IA.md` | Hombres Lobo con cartas/sets, Gartic exclusivamente humano y concursos manuales compartidos. Sin configuración, dependencia o llamadas Ollama. |
| `03_OLLAMA_E_INTEGRACION_LOCAL.md` | Detección explícita local, generación de tarjetas, verificación visión/dibujo, bots optativos, límites, cancelación y ciclo de vida completo. |

Cada documento contiene alcance, arquitectura, contratos, reglas, estados, archivos, pseudocódigo, errores que deben evitarse y pruebas de aceptación. Los anexos incorporan archivos reales de referencia y variantes separadas por fase. Los fragmentos de clase están identificados como tales: se integran en el controlador antiguo, declarando sus campos y dependencias; no son un archivo aislado listo para compilar sin el proyecto.

Las variantes sin IA del repositorio/panel de tarjetas, el motor/panel humano de Gartic y los registros/áreas por fase se comprobaron con TypeScript. También pasaron dos pruebas funcionales aisladas: una partida humana completa de Gartic con álbum/cancelación y la biblioteca manual con concurso/puntuación/stop. La app final pasó 100 pruebas de código, 34 de interfaz y cinco LIVE con dos navegadores.

Los prompts distinguen límites reales de prestaciones inexistentes: servidor permanente pendiente, notas locales, sincronización de red de la pizarra principal frente a otras pizarras persistentes locales, inferencia en el anfitrión y backend de IA antiguo distinto de Ollama. No deben convertirse en promesas de funciones que no existen.

`source-blocks-manifest.json` registra procedencia y hash de cada bloque. `reference-source-0.2.0.zip` es una copia adicional del código final completo para resolver dependencias o comparar visualmente; **no copiar sus funciones de IA/juegos a una fase que las excluye**. Los prompts ya contienen los bloques principales de su fase; el snapshot es una referencia complementaria.

`visual-reference/` contiene capturas de la interfaz final. En los documentos extensos, conservar primero la especificación y su índice de archivos; si una herramienta limita el contexto, hacer que la IA lea los anexos necesarios desde el archivo adjunto y registre su avance por bloques. Nunca aceptar una réplica como terminada solo porque su primera pantalla se parece: ejecutar las pruebas de aceptación.

Código de referencia: `871e85e51ae204d10eaf301bbac85ad437438471`.
Build de los binarios finales: https://github.com/Javpato/HACKATHON/actions/runs/41243610268

Actualización de cámaras: el segundo documento incorpora una adenda 0.2.1 con código completo de captura, transporte, UI y pruebas. Mantenerla al aplicar el tercer documento. La copia completa actualizada está en `reference-source-0.2.1.zip`; la copia 0.2.0 se conserva como base histórica. Build de cámaras: https://github.com/Javpato/HACKATHON/actions/runs/41247811287
