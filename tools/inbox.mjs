// Designs the author sent from the website (📤 Send to Claude opens a GitHub issue "Design: <name>" holding a packed
// code, "TG1." + base64url of the deflated JSON): unpacks each open one into designs/<name>.json, comments and closes it.
//   node tools/inbox.mjs           (needs the gh command, logged in)
//   node tools/inbox.mjs TG1.xxxx  (unpack a code pasted in the chat instead)
// AI tournament entries (the entry page, enter/, opens "Entry: <AI>: <species>"): saved as designs/entries/<AI>.json
// (a later entry from the same AI replaces it).
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'designs'), REPO = 'vitorhugo1992/tinygod';
export const unpack = (code) => JSON.parse(inflateRawSync(Buffer.from(code.slice(4), 'base64url')).toString('utf8'));
const save = (got, sent) => {
  const name = String(got.name || 'design').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'design';
  const file = (name === 'index' ? 'index_' : name.replace(/ /g, '_')) + '.json';   // index.json is the website's list
  writeFileSync(join(DIR, file), JSON.stringify({ name, sent, design: got.design || got }, null, 2));
  return 'designs/' + file;
};

const saveEntry = (got, sent) => {
  const ai = String(got.ai || 'AI').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 60) || 'AI';
  mkdirSync(join(DIR, 'entries'), { recursive: true });
  const file = ai.replace(/ /g, '_') + '.json';
  writeFileSync(join(DIR, 'entries', file), JSON.stringify({ name: got.name, ai, sent, note: got.note || '', design: got.design || got }, null, 2));
  return 'designs/entries/' + file;
};

const arg = process.argv[2];
if (arg && arg.startsWith('TG1.')) {
  const got = unpack(arg);
  console.log('saved', got.ai ? saveEntry(got, new Date().toISOString()) : save(got, new Date().toISOString()));
} else {
  const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' });
  const issues = JSON.parse(gh('issue', 'list', '--repo', REPO, '--state', 'open', '--limit', '50', '--json', 'number,title,body,createdAt'));
  let n = 0;
  for (const it of issues) {
    const isEntry = /^Entry:/.test(it.title);
    if (!/^Design:/.test(it.title) && !isEntry) continue;
    const code = (it.body || '').match(/TG1\.[A-Za-z0-9_-]+/);
    if (!code) { console.log(`#${it.number} "${it.title}": no code in it (left open)`); continue; }
    try {
      const file = isEntry ? saveEntry(unpack(code[0]), it.createdAt) : save(unpack(code[0]), it.createdAt);
      gh('issue', 'close', String(it.number), '--repo', REPO, '--comment', `Received by Claude as ${file}.`);
      console.log(`#${it.number} "${it.title}" -> ${file}`); n++;
    } catch (e) { console.log(`#${it.number} "${it.title}": could not unpack (${e.message}); left open`); }
  }
  if (!n) console.log('no new designs');
}
