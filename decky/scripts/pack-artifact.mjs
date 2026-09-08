/*
  Fold the artifact build into one HTML fragment.

  Vite inlines assets it can see through the import graph, but the three webfonts live in
  public/ and are referenced by absolute URL from the stylesheet — Vite copies those verbatim
  and leaves the URL alone, which is right for a server and useless for a single file. So the
  fonts are converted to data: URIs here, and the script and stylesheet are folded in after.

  The output is a fragment, not a document: the Artifact host supplies the doctype, html, head
  and body around it.
*/
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'dist-artifact';
const assets = join(OUT, 'assets');
const names = readdirSync(assets);
const cssName = names.find((n) => n.endsWith('.css'));
const jsName = names.find((n) => n.endsWith('.js'));
if (!cssName || !jsName) throw new Error(`expected one css and one js in ${assets}, saw ${names}`);

let css = readFileSync(join(assets, cssName), 'utf8');
const js = readFileSync(join(assets, jsName), 'utf8');

// url("/fonts/x.woff2") -> url("data:font/woff2;base64,...")
let fonts = 0;
css = css.replace(/url\((["']?)\/fonts\/([^"')]+)\1\)/g, (_m, _q, file) => {
  const b64 = readFileSync(join('public', 'fonts', file)).toString('base64');
  fonts++;
  return `url("data:font/woff2;base64,${b64}")`;
});
if (fonts === 0) throw new Error('no font URLs were rewritten — the stylesheet changed shape');

const icon = readFileSync(join('public', 'icon.svg')).toString('base64');

const html = `<title>Decky</title>
<link rel="icon" href="data:image/svg+xml;base64,${icon}">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;

writeFileSync(join(OUT, 'decky.html'), html);
console.log(`packed: ${fonts} fonts inlined, ${(html.length / 1024 / 1024).toFixed(2)} MB total`);
