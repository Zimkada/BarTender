#!/usr/bin/env node
/**
 * Régénère src/lib/database.types.ts depuis Supabase, en filtrant
 * les messages parasites du CLI (npm warn, infos d'install, suggestions
 * d'update) qui sinon polluent le fichier et cassent TypeScript.
 *
 * Usage : npm run gen:types
 *
 * Pourquoi un script Node plutôt qu'un pipe shell :
 * - Marche sur Windows (PowerShell n'a pas `grep`) ET sur bash
 * - Encodage UTF-8 garanti (PowerShell `>` produit de l'UTF-16 LE)
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUTPUT_PATH = resolve(process.cwd(), 'src/lib/database.types.ts');

// Patterns à filtrer (lignes parasites connues du CLI Supabase + npx)
const PARASITE_PATTERNS = [
  /^npm warn/,
  /^npm notice/,
  /^Initialising/,
  /^A new version of Supabase CLI/,
  /^We recommend updating/,
  /^Need to install the following packages/,
  /^Ok to proceed/,
];

const isParasite = (line) => PARASITE_PATTERNS.some((p) => p.test(line));

const isWin = process.platform === 'win32';
const proc = spawn(
  isWin ? 'npx.cmd' : 'npx',
  ['supabase', 'gen', 'types', 'typescript', '--linked'],
  // shell: true requis sur Windows — Node récent refuse de spawn un .cmd
  // directement (EINVAL) sans passer par le shell.
  { stdio: ['inherit', 'pipe', 'inherit'], shell: isWin }
);

let stdout = '';
proc.stdout.setEncoding('utf8');
proc.stdout.on('data', (chunk) => { stdout += chunk; });

proc.on('close', (code) => {
  if (code !== 0) {
    console.error(`\n❌ supabase gen types a échoué (code ${code})`);
    process.exit(code ?? 1);
  }

  const cleaned = stdout
    .split(/\r?\n/)
    .filter((line) => !isParasite(line))
    .join('\n')
    .replace(/^\s*\n+/, ''); // trim lignes vides en tête

  writeFileSync(OUTPUT_PATH, cleaned, 'utf8');
  console.log(`✅ ${OUTPUT_PATH} régénéré (${cleaned.split('\n').length} lignes)`);
});

proc.on('error', (err) => {
  console.error('❌ Impossible de lancer npx supabase:', err.message);
  process.exit(1);
});
