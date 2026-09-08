// One indexable page per built-in game.
//
// Before this the whole catalogue lived behind one URL — a search for "play hearts online" or
// "gin rummy free" had nothing of ours to land on, and every share was a bare "Decky" link with
// no idea which of 52 games it pointed at.
//
// The client already answers /?g=<id> and /g/<id>/ alike (see src/ui/route.ts) — this script is
// what makes /g/<id>/ a real file rather than a route that only resolves after a rewrite rule a
// static host may or may not have. It reads dist/index.html (already built, hashed asset paths
// and all) as a template and writes dist/g/<id>/index.html per game: its own title, description,
// OG/Twitter tags, VideoGame schema, and a block of real text inside #root so a crawler that
// never runs the JS still reads the game's name, rules and player count — not just an empty div.
// One that does run the JS (Google's does) replaces it with the live app, exactly as it would at
// the root.
//
// Only the 52 shipped classics get a page. A player's own published game is local to their
// device (see library.ts) — there is nothing on a build server to prerender it from, and that
// stays true regardless of how many of these ship.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog } from '../src/games/catalog';
import { kindLabel } from '../src/library/library';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

// Reads dist/index.html rather than building it — this runs as the last step of `npm run
// build`, right after vite already produced it with real, hashed asset paths. Run on its own
// (`npm run prerender`) after any build that left dist/ in place, for a quick iteration on the
// per-page markup without paying for a full rebuild each time.
const templatePath = join(DIST, 'index.html');
if (!existsSync(templatePath)) {
  throw new Error(`${templatePath} not found — run "npm run build" first`);
}
const template = readFileSync(templatePath, 'utf8');

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function playerLine(players: { min: number; max: number }): string {
  return players.min === players.max ? `${players.min} players` : `${players.min}–${players.max} players`;
}

// A search snippet truncates around 155-160 characters and shows the cut with an ellipsis
// wherever it lands — mid-word, mid-clause, wherever. Breaking on the last full sentence inside
// that budget reads as a deliberate summary instead of a clipped paragraph. The full rules text
// still goes in the page body and the JSON-LD, which have no such limit.
function summarize(description: string, max = 155): string {
  if (description.length <= max) return description;
  const cut = description.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '));
  if (lastStop > max * 0.4) return cut.slice(0, lastStop + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`;
}

let written = 0;
const urls: string[] = ['/'];

for (const def of catalog) {
  const { id, name, description, players } = def.meta;
  const title = `${name} — Decky`;
  const snippet = escapeHtml(summarize(description));
  const fullDesc = escapeHtml(description);
  const kind = kindLabel(def);
  const path = `/g/${id}/`;

  let page = template
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${snippet}" />`)
    .replace(/<meta property="og:type" content="[^"]*"\s*\/>/, '<meta property="og:type" content="article" />')
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(name)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${snippet}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${escapeHtml(name)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${snippet}" />`);

  // Root-relative rather than a guessed domain — nothing in this repo knows the production host
  // it will actually be served from, and a wrong absolute canonical is worse than a relative one.
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name,
    description,
    genre: kind,
    numberOfPlayers: { '@type': 'QuantitativeValue', minValue: players.min, maxValue: players.max },
    applicationCategory: 'Game',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  const extra = `    <link rel="canonical" href="${path}" />
    <script type="application/ld+json">${JSON.stringify(schema)}</script>
  </head>`;
  page = page.replace('</head>', extra);

  // Overwritten the instant React mounts — see the file header for why it is worth writing
  // anyway. Same content a visitor reaches by opening the game from the shelf, just already
  // painted rather than waiting on a click. Full rules here, not the truncated snippet — this
  // is the page body, not a search result.
  const staticBody = `<h1>${escapeHtml(name)}</h1>
      <p>${fullDesc}</p>
      <p>${escapeHtml(kind)} · ${escapeHtml(playerLine(players))}</p>
      <p><a href="/?g=${encodeURIComponent(id)}">Play ${escapeHtml(name)} on Decky</a></p>`;
  page = page.replace('<div id="root"></div>', `<div id="root">${staticBody}</div>`);

  const dir = join(DIST, 'g', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), page);
  urls.push(path);
  written++;
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
writeFileSync(join(DIST, 'sitemap.xml'), sitemap);

console.log(`prerendered ${written} game pages, sitemap.xml (${urls.length} urls)`);
