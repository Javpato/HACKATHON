export const SNIPPETS = [
  { id: 'notes', label: 'Apuntes', text: '# Tema\n\n## Ideas clave\n- \n\n## Preguntas\n- \n' },
  { id: 'plan', label: 'Plan de estudio', text: 'Objetivo:\n\n1. Leer\n2. Practicar\n3. Repasar\n\nPróximo paso: ' },
  { id: 'code', label: 'Código TypeScript', text: 'function resolver(): void {\n  // Escribe tu idea aquí\n  console.log("Resuelto en TypeScript ✓");\n}\nresolver();\n' },
  { id: 'python', label: 'Python · Algoritmo', text: 'import math\n\ndef fibonacci(n):\n  a, b = 0, 1\n  serie = []\n  for i in range(n):\n    serie.append(a)\n    a, b = b, a + b\n  return serie\n\nprint("Fibonacci(8):", fibonacci(8))\nprint("Raíz de 2:", round(math.sqrt(2), 4))\n' },
  { id: 'cpp', label: 'C++ · Estudio', text: '#include <iostream>\n#include <vector>\n#include <cmath>\nusing namespace std;\n\nint main() {\n  vector<int> notas = {8, 9, 10, 7, 9};\n  int suma = 0;\n  for (int i = 0; i < notas.size(); i++) {\n    suma = suma + notas[i];\n  }\n  cout << "Suma total: " << suma << endl;\n  cout << "Promedio: " << (suma / 5.0) << endl;\n  return 0;\n}\n' },
] as const;

export function insertAtSelection(source: string, snippet: string, start: number, end: number): { text: string; caret: number } {
  const before = source.slice(0, start);
  const after = source.slice(end);
  const separator = before && !before.endsWith('\n') ? '\n' : '';
  const text = before + separator + snippet + after;
  return { text, caret: (before + separator + snippet).length };
}
