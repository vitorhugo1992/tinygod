// Tiny static server for the sandbox (ES modules need http, not file://).
//   node tools/serve.mjs [port]          this computer only: http://localhost:5180/sandbox/
//   node tools/serve.mjs --lan [port]    also phones and other devices on the same Wi-Fi (prints the address)
// It serves only sandbox/ and sim/, never the rest of the project (notes, git history). The one thing it writes:
// POST /design?name=... (the sandbox's Send to Claude) saves a design as designs/<name>.json, JSON only, at most 256 KB;
// GET /designs lists the designs Claude wrote there (marked from: 'Claude'), for the sandbox's From Claude.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const LAN = args.includes('--lan');
const PORT = Number(args.find((a) => /^\d+$/.test(a))) || 5180;
const SHARED = ['sandbox', 'sim'].map((d) => join(ROOT, d) + sep);
// the addresses a phone on the same Wi-Fi can use (empty without --lan)
const lanUrls = () => !LAN ? [] : Object.values(networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${PORT}/sandbox/`);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

// A design sent from the sandbox, kept in designs/ so Claude can read it (a file name from its letters and digits only)
async function saveDesign(req, res) {
  const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'design').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'design';
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 256 * 1024) { res.writeHead(413); res.end('too big'); return; } }
  try {
    const design = JSON.parse(body);
    if (!design || typeof design !== 'object' || !design.body) throw new Error('not a design');
    await mkdir(join(ROOT, 'designs'), { recursive: true });
    const file = name.replace(/ /g, '_') + '.json';
    await writeFile(join(ROOT, 'designs', file), JSON.stringify({ name, sent: new Date().toISOString(), design }, null, 2));
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ file: 'designs/' + file }));
  } catch (e) { res.writeHead(400); res.end(String(e.message)); }
}

// The designs Claude left in designs/ for the author
async function listDesigns(res) {
  const out = [];
  try {
    for (const f of await readdir(join(ROOT, 'designs'))) {
      if (!f.endsWith('.json')) continue;
      try { const j = JSON.parse(await readFile(join(ROOT, 'designs', f), 'utf8')); if (j.from === 'Claude' && j.design) out.push({ name: j.name, note: j.note, design: j.design }); } catch { /* not a design */ }
    }
  } catch { /* no designs yet */ }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(out));
}

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') { res.writeHead(302, { Location: '/sandbox/' }); res.end(); return; }
  if (path === '/lan') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(lanUrls())); return; }
  if (path === '/design' && req.method === 'POST') { await saveDesign(req, res); return; }
  if (path === '/designs') { await listDesigns(res); return; }
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!SHARED.some((d) => file.startsWith(d))) { res.writeHead(404); res.end('not found'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, LAN ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`TinyGod sandbox: http://localhost:${PORT}/sandbox/`);
  for (const url of lanUrls()) console.log(`  on the same Wi-Fi: ${url}`);
});
