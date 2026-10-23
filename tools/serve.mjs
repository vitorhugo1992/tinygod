// Tiny static server for the sandbox (ES modules need http, not file://).
//   node tools/serve.mjs [port]          this computer only: http://localhost:5180/sandbox/
//   node tools/serve.mjs --lan [port]    also phones and other devices on the same Wi-Fi (prints the address)
// It serves only sandbox/ and sim/, never the rest of the project (notes, git history).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const LAN = args.includes('--lan');
const PORT = Number(args.find((a) => /^\d+$/.test(a))) || 5180;
const SHARED = ['sandbox', 'sim'].map((d) => join(ROOT, d) + sep);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') { res.writeHead(302, { Location: '/sandbox/' }); res.end(); return; }
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
  if (LAN) {
    const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
    for (const ip of ips) console.log(`  on the same Wi-Fi: http://${ip}:${PORT}/sandbox/`);
  }
});
