// build-prompt.mjs — Assemble le system prompt de l'agent WhatsApp.
//
// Sorties :
//   1. whatsapp-agent/PROMPT_ASSEMBLE.txt  → à coller dans la console Anthropic (tests)
//   2. supabase/functions/wa-webhook/prompt.ts → module importé par l'Edge Function
//
// À relancer après TOUTE modification de SYSTEM_PROMPT.md ou des fichiers knowledge/.
// Usage : node whatsapp-agent/build-prompt.mjs  (depuis la racine du repo)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

let prompt = readFileSync(join(here, 'SYSTEM_PROMPT.md'), 'utf8');
const base = readFileSync(join(here, 'knowledge', 'base-commune.md'), 'utf8');
const prospects = readFileSync(join(here, 'knowledge', 'prospects.md'), 'utf8');
const clients = readFileSync(join(here, 'knowledge', 'clients.md'), 'utf8');

// Retirer le bloc de note d'en-tête (entre le titre et le premier ---)
prompt = prompt.replace(/^# System prompt[\s\S]*?\n---\n\n/, '');
prompt = prompt
  .replace('{{BASE_COMMUNE}}', base)
  .replace('{{PROSPECTS}}', prospects)
  .replace('{{CLIENTS}}', clients);

// Garde-fou : aucun placeholder ne doit rester
if (/\{\{[A-Z_]+\}\}/.test(prompt)) {
  console.error('ERREUR : placeholder(s) non remplacé(s) dans le prompt.');
  process.exit(1);
}

// 1. Fichier de test console
writeFileSync(join(here, 'PROMPT_ASSEMBLE.txt'), prompt);

// 2. Module TypeScript pour l'Edge Function (JSON.stringify = échappement sûr)
const funcDir = join(repoRoot, 'supabase', 'functions', 'wa-webhook');
mkdirSync(funcDir, { recursive: true });
const ts = `// GÉNÉRÉ par whatsapp-agent/build-prompt.mjs — NE PAS ÉDITER À LA MAIN.
// Source : whatsapp-agent/SYSTEM_PROMPT.md + knowledge/*.md
// Relancer : node whatsapp-agent/build-prompt.mjs

export const SYSTEM_PROMPT: string = ${JSON.stringify(prompt)};
`;
writeFileSync(join(funcDir, 'prompt.ts'), ts);

const tokens = Math.round(prompt.length / 4);
console.log(`PROMPT_ASSEMBLE.txt + wa-webhook/prompt.ts générés (~${tokens} tokens).`);
