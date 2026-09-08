// Run a real table host: `npm run host` (add PORT=... to move it).
//
// This is the same MatchService the browser runs in-process, listening on a socket. Point a
// client at it and the rules are enforced on this side of the wire — which is the only version
// of "server-authoritative" that actually stops a tampered client.
//
// If `npm run build` has already put a `dist/` next to this project, it's served too — one
// process, one URL, one thing to deploy. Without a build present this still runs API/WS only,
// which is all the test suite needs.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameHost } from '../src/net/wsServer';
import { catalog } from '../src/games/catalog';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const staticDir = existsSync(distDir) ? distDir : undefined;

const port = parseInt(process.env.PORT ?? '8787', 10);
const host = new GameHost({ catalog, staticDir });

host.listen(port).then((actual) => {
  console.log(`Decky host listening on http://127.0.0.1:${actual}`);
  if (staticDir) console.log(`  site       GET  /  (serving ${distDir})`);
  else console.log(`  no dist/ found — run \`npm run build\` first to serve the site from here too.`);
  console.log(`  health     GET  /health`);
  console.log(`  games      GET  /games`);
  console.log(`  open table POST /open       { gameId, seats }`);
  console.log(`  join       POST /join       { code, name }`);
  console.log(`  quick play POST /quickplay  { gameId, name, seats }`);
  console.log(`  author     POST /api/author { system, user }`);
  console.log(`  live       ws://127.0.0.1:${actual}`);
  const writerKey = process.env.GEMINI_API_KEY ? 'Gemini' : process.env.ANTHROPIC_API_KEY ? 'Anthropic' : null;
  console.log(`\n${catalog.length} games available. AI writer: ${writerKey ? `configured (${writerKey})` : 'NOT configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY)'}.`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { host.stop().then(() => process.exit(0)); });
}
