# Estudio y Ollama personal

Desde **Menú → Estudio**, la estantería o las estaciones de estudio se abre una
portada a pantalla completa con tres tarjetas ilustradas:

- **Cuadernos**: abre tus cuadernos. La portada discontinua con un + crea otro.
  Dentro se conservan las páginas y el editor de bloques, Markdown y fórmulas.
- **Flashcards**: elige Repasar o Crear. Cada tarjeta tiene pregunta y respuesta;
  pistas, etiquetas y dificultad son opcionales. El progreso se guarda localmente.
- **Quiz**: elige Jugar o Crear. Añade preguntas con 2–4 respuestas distintas y
  marca una correcta. Puedes practicar solo, sin conexión, o abrir un concurso.

En un concurso de aldea, el anfitrión selecciona un quiz e inicia la partida cuando
hay al menos otra persona. El anfitrión también responde. Los invitados pueden
unirse aunque su biblioteca esté vacía. Las soluciones no aparecen hasta que todos
hayan respondido o termine el tiempo; la puntuación la calcula el anfitrión.
El tiempo es configurable. El anfitrión puede terminar el concurso para todos.

Las antiguas tarjetas con «Usar en concursos» se conservan como flashcards y sus
preguntas se copian una sola vez a la biblioteca de quizzes. Borrar un quiz migrado
no hace que vuelva a aparecer. La migración solo se registra tras guardar.

## Configurar Ollama

En la Biblioteca, camina hasta el mueble **Configurar Ollama**. La guía permite:

1. Abrir las instrucciones oficiales de instalación para tu sistema.
2. Comprobar Ollama en el propio equipo, en `127.0.0.1:11434`.
3. Elegir uno de los modelos locales realmente instalados.
4. Probar y activar cada función, o usar Configurar todo.

Hay un modelo común y excepciones para flashcards, quizzes, asistente de pizarra,
conversión visual a LaTeX, sprites y bots de Gartic. Las funciones visuales requieren
un modelo con visión; las pruebas comprueban que el modelo devuelve resultados
válidos para la función concreta. Si falla una función, las demás pueden seguir activas.

Cada persona configura su propia IA, también si es invitada. Los bots de Gartic se
ejecutan en el equipo anfitrión. La configuración de Ollama no se publica en la aldea.
No se instala software, descarga modelos ni ejecuta comandos desde la app.

Sin configuración verificada, los accesos de IA no aparecen en el estudio, la
pizarra ni Gartic. La guía del mueble sigue disponible. Después de configurar,
la app vuelve a comprobar los modelos al abrirse. Un modelo cambiado o eliminado
requiere otra prueba. La generación muestra un borrador para revisar antes de
incorporarlo a un mazo o quiz. Ya no se usan Gemini ni respuestas prefabricadas.

Si hay un bloqueo de navegador, la guía muestra el origen concreto a autorizar en
`OLLAMA_ORIGINS` y enlaza las instrucciones oficiales. No es necesario exponer
Ollama a otros equipos. Documentación: https://docs.ollama.com/faq

## Pizarra y ajustes

La pizarra ocupa el espacio disponible sin desplazar la página. Usa Mano para
recorrer el lienzo, la rueda para desplazar y Ctrl + rueda para zoom. Las opciones
avanzadas se superponen al lienzo y tienen su propio desplazamiento cuando hace falta.
Las fórmulas manuales siempre están disponibles; la IA depende de su configuración.

Ajustes separa Perfil, Ambiente, Controles e Identidad. Ambiente incluye tarjetas
para luz y clima, sonido independiente, volumen y opciones de partículas. Todos
los espacios con desplazamiento comparten una scrollbar de madera y papel.

Los fallos se presentan en español, con indicaciones junto a los campos o avisos
accesibles. No se muestran JSON de validación, trazas ni mensajes internos.
