import { describe, expect, it } from 'vitest';
import { insertAtSelection, SNIPPETS } from '../src/editor/snippets';

describe('local snippet editor', () => {
  it('inserts at the caret without discarding surrounding text', () => {
    const result = insertAtSelection('before\nafter', SNIPPETS[0].text, 7, 7);
    expect(result.text.startsWith('before\n# Tema')).toBe(true);
    expect(result.text.endsWith('after')).toBe(true);
    expect(result.text.slice(result.caret)).toBe('after');
  });

  it('replaces an explicit selection', () => {
    const result = insertAtSelection('one two three', 'dos', 4, 7);
    expect(result.text).toBe('one \ndos three');
  });
});

describe('local code runner (TS, Python, C++) and asset packs', () => {
  it('executes TypeScript/JavaScript locally and captures console output', async () => {
    const { executeLocalCode, detectLanguage } = await import('../src/editor/runner');
    const code = SNIPPETS.find((s) => s.id === 'code')!.text;
    expect(detectLanguage(code)).toBe('typescript');
    const res = await executeLocalCode(code, 'typescript');
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.output.join('\n')).toContain('Resuelto en TypeScript ✓');
  });

  it('executes Python code locally including functions, loops, and f-strings', async () => {
    const { executeLocalCode, detectLanguage } = await import('../src/editor/runner');
    const pyCode = SNIPPETS.find((s) => s.id === 'python')!.text;
    expect(detectLanguage(pyCode)).toBe('python');
    const res = await executeLocalCode(pyCode, 'python');
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.output.join('\n')).toContain('Fibonacci(8): [0,1,1,2,3,5,8,13]');
    expect(res.output.join('\n')).toContain('Raíz de 2: 1.4142');
  });

  it('executes C++ code locally including int main(), vector, and cout', async () => {
    const { executeLocalCode, detectLanguage } = await import('../src/editor/runner');
    const cppCode = SNIPPETS.find((s) => s.id === 'cpp')!.text;
    expect(detectLanguage(cppCode)).toBe('cpp');
    const res = await executeLocalCode(cppCode, 'cpp');
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.output.join('\n')).toContain('Suma total:');
    expect(res.output.join('\n')).toContain('43');
    expect(res.output.join('\n')).toContain('8.6');
  });

  it('validates declarative JSON asset packs and rejects executable payloads', async () => {
    const { validateAssetPack } = await import('../src/assets/custom-assets');
    const valid = validateAssetPack({
      schemaVersion: 1,
      name: 'Pack seguro',
      author: 'Javi',
      license: 'CC-BY-4.0',
      avatar: { hairStyle: 'curly', hairColor: '#2a2018', skinTone: '#c98f63', accessory: 'glasses' },
      furnitureColors: { desk: '#8a5a36' },
      furnitureSprites: {},
    });
    expect(valid.name).toBe('Pack seguro');
    expect(() => validateAssetPack({ schemaVersion: 2, name: 'Invalido' })).toThrow();
    expect(() => validateAssetPack({
      schemaVersion: 1,
      name: 'Inyeccion SVG',
      furnitureSprites: { desk: 'data:image/svg+xml;base64,PHN2Zz4=' },
    })).toThrow();
    expect(() => validateAssetPack({
      schemaVersion: 1,
      name: 'Script malicioso',
      scripts: 'alert(1)',
    })).toThrow();
  });
});

