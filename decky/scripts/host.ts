// Run a real table host: `npm run host` (add PORT=... to move it).
//
// This is the same MatchService the browser runs in-process, listening on a socket. Point a
// client at it and the rules are enforced on this side of the wire — which is the only version
// of "server-authoritative" that actually stops a tampered client.
import { GameHost } from '../src/net/wsServer';
import { catalog } from '../src/games/catalog';

const port = parseInt(process.env.PORT ?? '8787', 10);
const host = new GameHost({ catalog });

host.listen(port).then((actual) => {
  console.log(`Decky host listening on http://127.0.0.1:${actual}`);
  console.log(`  health     GET  /health`);
  console.log(`  games      GET  /games`);
  console.log(`  open table POST /open       { gameId, seats }`);
  console.log(`  join       POST /join       { code, name }`);
  console.log(`  quick play POST /quickplay  { gameId, name, seats }`);
  console.log(`  live       ws://127.0.0.1:${actual}`);
  console.log(`\n${catalog.length} games available.`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { host.stop().then(() => process.exit(0)); });
}
