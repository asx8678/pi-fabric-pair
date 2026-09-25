import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(argument => argument !== '--check')) throw new Error('Expected only --check');
for (const name of ['actor-archive', 'actor-host-quiescence', 'actor-host-domain']) {
  const source = new URL(`src/${name}.mts`, root), destination = new URL(`src/${name}.mjs`, root);
  const result = ts.transpileModule(await fs.readFile(source, 'utf8'), {
    fileName: fileURLToPath(source), reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.Node16, verbatimModuleSyntax: true, newLine: ts.NewLineKind.LineFeed },
  });
  if (result.diagnostics?.some(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)) throw new Error(ts.formatDiagnostics(result.diagnostics, { getCanonicalFileName: name => name, getCurrentDirectory: () => fileURLToPath(root), getNewLine: () => '\n' }));
  if (check) {
    if (await fs.readFile(destination, 'utf8') !== result.outputText) throw new Error(`Stale generated Host module: ${destination.pathname}; run npm run build:host`);
  } else await fs.writeFile(destination, result.outputText);
}
console.log(check ? 'Host generated modules match checked sources' : 'Host production modules generated');
