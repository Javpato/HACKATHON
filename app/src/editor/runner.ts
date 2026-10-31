export type CodeLanguage = 'typescript' | 'python' | 'cpp';

export interface RunResult {
  ok: boolean;
  language: CodeLanguage;
  output: string[];
  error?: string;
  durationMs: number;
}

export function detectLanguage(code: string): CodeLanguage {
  const trimmed = code.trim();
  if (/^\s*#include\s*<|int\s+main\s*\(|std::cout|cout\s*<</m.test(trimmed)) return 'cpp';
  if (/^\s*def\s+\w+\s*\(|^\s*import\s+math|^\s*for\s+\w+\s+in\s+range\(|^\s*print\s*\(/m.test(trimmed) && !/function\s+|const\s+|let\s+/.test(trimmed)) {
    return 'python';
  }
  return 'typescript';
}

function formatVal(val: unknown): string {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

/**
 * Strips common TypeScript type annotations so standard TS study snippets execute
 * directly in the local JS engine without requiring a full compiler bundle.
 */
export function transpileTypeScriptLite(source: string): string {
  let code = source
    // Remove interface declarations
    .replace(/^\s*export\s+interface\s+\w+\s*\{[\s\S]*?^\}/gm, '')
    .replace(/^\s*interface\s+\w+\s*\{[\s\S]*?^\}/gm, '')
    // Remove type aliases
    .replace(/^\s*(?:export\s+)?type\s+\w+\s*=\s*[^;\n]+;?/gm, '')
    // Remove `export ` prefix on functions/consts
    .replace(/^\s*export\s+(?=(?:async\s+)?function\b|const\b|let\b|class\b)/gm, '')
    // Remove function return types like `): void {` or `): Promise<number> =>`
    .replace(/\)\s*:\s*[A-Za-z0-9_<>\[\]|&\s]+(?=\s*\{|\s*=>)/g, ')')
    // Remove variable type annotations like `const x: number =`
    .replace(/\b(const|let|var)\s+(\w+)\s*:\s*[A-Za-z0-9_<>\[\]|&\s]+(?=\s*=)/g, '$1 $2')
    // Remove parameter type annotations like `(nombre: string, edad: number = 1)`
    .replace(/([(\s,])(\w+)\??\s*:\s*(?:readonly\s+)?[A-Za-z0-9_<>\[\]|&]+(?=\s*[,)=])/g, '$1$2')
    // Remove `as Type` casts
    .replace(/\s+as\s+[A-Za-z0-9_<>\[\]|&]+/g, '');
  return code;
}

async function runTypeScript(source: string): Promise<{ output: string[]; error?: string }> {
  const logs: string[] = [];
  const push = (prefix: string, args: unknown[]) => {
    const line = args.map(formatVal).join(' ');
    logs.push(prefix ? `${prefix} ${line}` : line);
  };
  const customConsole = {
    log: (...args: unknown[]) => push('', args),
    info: (...args: unknown[]) => push('ℹ', args),
    warn: (...args: unknown[]) => push('⚠', args),
    error: (...args: unknown[]) => push('✖', args),
  };

  try {
    const js = transpileTypeScriptLite(source);
    // If the user defined a single function like `function saludar(nombre)` and never logged anything,
    // we also auto-preview calling it if no output was produced.
    const fnMatch = js.match(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
    const wrapped = `
      "use strict";
      return (async () => {
        ${js}
        ${fnMatch ? `;if (typeof ${fnMatch[1]} === "function" && __logs.length === 0) {
          const __res = await ${fnMatch[1]}("StudyVillage");
          if (__res !== undefined) console.log(${fnMatch[1]}("StudyVillage"));
        }` : ''}
      })();
    `;
    const runner = new Function('console', '__logs', wrapped);
    const result = await runner(customConsole, logs);
    if (result !== undefined && logs.length === 0) {
      logs.push(formatVal(result));
    }
    if (logs.length === 0) {
      logs.push('(Ejecución completada sin salida en consola. Usa console.log(...) para mostrar valores.)');
    }
    return { output: logs };
  } catch (err) {
    return { output: logs, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Translates educational Python snippets (def, for/in, while, if/elif/else,
 * f-strings, print, range, len, sum, min, max, math.*, list comprehensions)
 * into sandboxed JS so students can run Python algorithms 100% offline.
 */
export function transpilePythonToJs(pySource: string): string {
  const lines = pySource.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [
    'const math = { pi: Math.PI, e: Math.E, sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log, exp: Math.exp, pow: Math.pow, floor: Math.floor, ceil: Math.ceil, fabs: Math.abs, factorial: (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; } };',
    'const range = (a, b, step = 1) => { const start = b === undefined ? 0 : a; const end = b === undefined ? a : b; const res = []; if (step > 0) { for (let i = start; i < end; i += step) res.push(i); } else if (step < 0) { for (let i = start; i > end; i += step) res.push(i); } return res; };',
    'const len = (x) => x?.length ?? Object.keys(x || {}).length;',
    'const sum = (arr) => (arr || []).reduce((a, b) => a + b, 0);',
    'const min = (...args) => Array.isArray(args[0]) ? Math.min(...args[0]) : Math.min(...args);',
    'const max = (...args) => Array.isArray(args[0]) ? Math.max(...args[0]) : Math.max(...args);',
    'const abs = Math.abs; const round = (n, d = 0) => Number(Math.round(Number(n + "e" + d)) + "e-" + d);',
    'const int = (x) => parseInt(x, 10); const float = (x) => parseFloat(x); const str = (x) => String(x);',
    'const sorted = (arr) => [...arr].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));',
    'const enumerate = (arr) => arr.map((v, i) => [i, v]);',
  ];

  const indentStack: number[] = [0];
  const declaredVars = new Set<string>();

  const transformExpr = (expr: string): string => {
    let e = expr.trim();
    // f-strings: f"hola {x}" or f'hola {x}'
    e = e.replace(/\bf"([^"]*)"/g, (_, inner: string) => '`' + inner.replace(/\{([^}]+)\}/g, '${$1}') + '`');
    e = e.replace(/\bf'([^']*)'/g, (_, inner: string) => '`' + inner.replace(/\{([^}]+)\}/g, '${$1}') + '`');
    // List comprehension: [expr for v in iter]
    e = e.replace(/\[\s*([^\[\]]+?)\s+for\s+(\w+)\s+in\s+([^\[\]]+?)\s*\]/g, '($3).map(($2) => ($1))');
    // Python operators & literals
    e = e
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null')
      .replace(/\band\b/g, '&&')
      .replace(/\bor\b/g, '||')
      .replace(/\bnot\s+/g, '!')
      .replace(/\/\//g, '/')
      .replace(/\*\*/g, '**')
      .replace(/\.append\s*\(/g, '.push(');
    return e;
  };

  for (const rawLine of lines) {
    const strippedComment = rawLine.replace(/#.*$/, '');
    if (!strippedComment.trim()) continue;
    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = strippedComment.trim();

    while (indent < indentStack[indentStack.length - 1]) {
      indentStack.pop();
      out.push('}');
    }

    if (/^(?:import|from)\s+/.test(trimmed)) {
      continue;
    }

    // elif / else
    if (trimmed.startsWith('elif ') && trimmed.endsWith(':')) {
      // Replace previous closing '}'
      if (out[out.length - 1] === '}') out.pop();
      const cond = transformExpr(trimmed.slice(5, -1));
      out.push(`} else if (${cond}) {`);
      indentStack.push(indent + 2);
      continue;
    }
    if (trimmed === 'else:') {
      if (out[out.length - 1] === '}') out.pop();
      out.push('} else {');
      indentStack.push(indent + 2);
      continue;
    }

    // def foo(a, b):
    const defMatch = trimmed.match(/^def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*[^:]+)?\s*:$/);
    if (defMatch) {
      const [, name, params] = defMatch;
      declaredVars.add(name);
      const cleanParams = params
        .split(',')
        .map((p) => p.trim().split(':')[0].trim())
        .filter(Boolean)
        .join(', ');
      out.push(`function ${name}(${cleanParams}) {`);
      indentStack.push(indent + 2);
      continue;
    }

    // for x in iter:
    const forMatch = trimmed.match(/^for\s+([\w,\s]+)\s+in\s+(.+):$/);
    if (forMatch) {
      const [, target, iter] = forMatch;
      const cleanTarget = target.includes(',') ? `[${target}]` : target.trim();
      if (!target.includes(',')) declaredVars.add(target.trim());
      out.push(`for (const ${cleanTarget} of ${transformExpr(iter)}) {`);
      indentStack.push(indent + 2);
      continue;
    }

    // while cond:
    const whileMatch = trimmed.match(/^while\s+(.+):$/);
    if (whileMatch) {
      out.push(`while (${transformExpr(whileMatch[1])}) {`);
      indentStack.push(indent + 2);
      continue;
    }

    // if cond:
    const ifMatch = trimmed.match(/^if\s+(.+):$/);
    if (ifMatch) {
      out.push(`if (${transformExpr(ifMatch[1])}) {`);
      indentStack.push(indent + 2);
      continue;
    }

    // return
    if (trimmed === 'return' || trimmed.startsWith('return ')) {
      const expr = trimmed.slice(6).trim();
      out.push(`return ${expr ? transformExpr(expr) : ''};`);
      continue;
    }

    // print(...)
    const printMatch = trimmed.match(/^print\s*\((.*)\)$/);
    if (printMatch) {
      out.push(`console.log(${transformExpr(printMatch[1])});`);
      continue;
    }

    // Tuple/multiple assignment: a, b = b, a + b
    const tupleAssign = trimmed.match(/^(\w+\s*,\s*\w+)\s*=\s*(.+)$/);
    if (tupleAssign) {
      const lhsVars = tupleAssign[1].split(',').map((s) => s.trim());
      const rhsItems = tupleAssign[2].split(',').map((s) => transformExpr(s.trim()));
      for (const v of lhsVars) {
        if (!declaredVars.has(v)) {
          declaredVars.add(v);
          out.push(`let ${v};`);
        }
      }
      out.push(`[${lhsVars.join(', ')}] = [${rhsItems.join(', ')}];`);
      continue;
    }

    // Simple assignment: x = expr
    const assignMatch = trimmed.match(/^([A-Za-z_]\w*)\s*(?::\s*[^=]+)?=\s*(?!=)(.+)$/);
    if (assignMatch) {
      const [, varName, rhs] = assignMatch;
      const prefix = declaredVars.has(varName) ? '' : 'let ';
      declaredVars.add(varName);
      out.push(`${prefix}${varName} = ${transformExpr(rhs)};`);
      continue;
    }

    out.push(`${transformExpr(trimmed)};`);
  }

  while (indentStack.length > 1) {
    indentStack.pop();
    out.push('}');
  }

  return out.join('\n');
}

/**
 * Translates standard educational C++ snippets (`int main()`, `cout << ...`,
 * `printf`, functions, loops, vectors/arrays, math) into sandboxed JS for instant
 * offline verification.
 */
export function transpileCppToJs(cppSource: string): string {
  let code = cppSource
    .replace(/\r\n/g, '\n')
    // Remove preprocessor directives and using namespace
    .replace(/^\s*#include\s*<[^>]+>\s*$/gm, '')
    .replace(/^\s*using\s+namespace\s+std\s*;\s*$/gm, '')
    .replace(/\bstd::/g, '');

  // Convert cout << a << b << endl; to console.log
  code = code.replace(/cout\s*<<\s*([^;]+);/g, (_, chain: string) => {
    const parts = chain
      .split('<<')
      .map((p) => p.trim())
      .filter((p) => p && p !== 'endl' && p !== "'\\n'" && p !== '"\\n"');
    return `console.log(${parts.join(', ')});`;
  });

  // Convert printf("...", a, b)
  code = code.replace(/\bprintf\s*\(([^;]+)\)\s*;/g, '__printf($1);');

  // Convert vector<T> v = {1, 2, 3} -> let v = [1, 2, 3]
  code = code.replace(/\bvector\s*<[^>]+>\s+(\w+)\s*=\s*\{([^}]*)\}/g, 'let $1 = [$2]');
  code = code.replace(/\bvector\s*<[^>]+>\s+(\w+)\s*\(([^)]+)\)/g, 'let $1 = new Array($2).fill(0)');
  code = code.replace(/\.push_back\s*\(/g, '.push(');
  code = code.replace(/\.size\s*\(\)/g, '.length');

  // Convert C-style array declarations: int arr[] = {1, 2, 3}; or int arr[5] = {1, 2};
  code = code.replace(/\b(?:const\s+)?(?:int|double|float|long|char|bool|string|auto)\s+(\w+)\s*\[\s*\d*\s*\]\s*=\s*\{([^}]*)\}/g, 'let $1 = [$2]');

  // Convert function definitions: int main() { or double calc(int a, double b) {
  code = code.replace(
    /\b(?:int|double|float|long|bool|string|void|auto)\s+(\w+)\s*\(([^)]*)\)\s*\{/g,
    (_, fnName: string, params: string) => {
      const cleanParams = params
        .split(',')
        .map((p) => p.trim().replace(/^(?:const\s+)?(?:int|double|float|long|bool|string|auto|vector<[^>]+>)\s*[&*]?\s*/, '').trim())
        .filter(Boolean)
        .join(', ');
      return `function ${fnName}(${cleanParams}) {`;
    },
  );

  // Convert typed variable declarations: int x = 5, y = 10;
  code = code.replace(/\b(?:const\s+)?(?:long\s+long|int|double|float|long|bool|string|auto)\s+/g, 'let ');

  const prelude = `
    const sqrt = Math.sqrt, pow = Math.pow, abs = Math.abs, sin = Math.sin, cos = Math.cos, tan = Math.tan,
          floor = Math.floor, ceil = Math.ceil, round = Math.round, max = Math.max, min = Math.min;
    const __printf = (fmt, ...args) => {
      let i = 0;
      const out = String(fmt).replace(/%[0-9.]*[dfsu]/g, () => args[i++] ?? '').replace(/\\n$/, '');
      console.log(out);
    };
  `;

  return `${prelude}\n${code}\nif (typeof main === 'function') main();`;
}

export async function executeLocalCode(source: string, language?: CodeLanguage): Promise<RunResult> {
  const start = performance.now();
  const lang = language ?? detectLanguage(source);
  if (!source.trim()) {
    return {
      ok: true,
      language: lang,
      output: ['(El editor está vacío. Escribe o inserta una plantilla para ejecutar.)'],
      durationMs: 0,
    };
  }

  let jsToRun = source;
  try {
    if (lang === 'python') {
      jsToRun = transpilePythonToJs(source);
    } else if (lang === 'cpp') {
      jsToRun = transpileCppToJs(source);
    }
  } catch (err) {
    return {
      ok: false,
      language: lang,
      output: [],
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.round(performance.now() - start),
    };
  }

  const res = await runTypeScript(jsToRun);
  return {
    ok: !res.error,
    language: lang,
    output: res.output,
    error: res.error,
    durationMs: Math.max(1, Math.round(performance.now() - start)),
  };
}
