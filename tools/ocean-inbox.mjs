// The Ocean's releases from GitHub issues (2026-11-20, the Ocean redone, step 6). The game's release ceremony
// (sandbox/release.js) opens an issue "Release: <name>" carrying the design's TG1 code; this reads every open one,
// queues it with tools/ocean.mjs release under the issue's AUTHOR (their GitHub login is the player), answers on the
// issue and closes it. Run by .github/workflows/ocean-release.yml (on a new issue) and ocean-night.yml (before each
// night, so a release whose own run was skipped is never lost). Needs the gh CLI (GH_TOKEN on GitHub).
//   node tools/ocean-inbox.mjs [--dir=ocean] [--dry]   (--dry: say what it would do, touch nothing)
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2), dry = args.includes('--dry');
const dir = (args.find((a) => a.startsWith('--dir=')) || '--dir=ocean').slice(6);
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', maxBuffer: 64 << 20 });

const issues = JSON.parse(gh('issue', 'list', '--state', 'open', '--limit', '100', '--search', 'Release: in:title', '--json', 'number,title,body,author'))
  .filter((i) => /^Release:/i.test(i.title)).sort((a, b) => a.number - b.number);
if (!issues.length) console.log('no releases waiting');
for (const i of issues) {
  const player = i.author && i.author.login, code = ((i.body || '').match(/TG1\.[A-Za-z0-9_-]+/) || [])[0];
  const name = i.title.replace(/^Release:\s*/i, '').trim().slice(0, 40);
  let answer, ok = false;
  if (!player) answer = 'This release has no author, so it can\'t be given to a player.';
  else if (!code) answer = 'No design code found in this issue. Release from the game (🌊 Release into the Ocean in the Lab): it fills this in.';
  else {
    try {
      const out = execFileSync(process.execPath, ['tools/ocean.mjs', 'release', player, code, `--name=${name}`, `--dir=${dir}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      ok = true;
      answer = `🌊 **${out}**\n\nIt is waiting at the surface. The Ocean's night runs every day at 04:00 UTC: next morning it arrives as 3 cells, and the game opens on it (if you gave the game your GitHub name, **${player}**). Once out there it can't be edited; you may release a new version every 3 nights.`;
    } catch (e) {
      const why = String(e.stderr || e.message).split('\n').find((l) => /not released|Error:/.test(l)) || 'it could not be queued';
      answer = `Not released: ${why.replace(/^.*?(not released: |Error: )/, '')}\n\nFix it in the Lab and release again.`;
    }
  }
  console.log(`#${i.number} ${player}: ${ok ? 'queued' : 'refused'}: ${answer.split('\n')[0]}`);
  if (dry) continue;
  gh('issue', 'comment', String(i.number), '--body', answer);
  gh('issue', 'close', String(i.number), ...(ok ? [] : ['--reason', 'not planned']));
}
