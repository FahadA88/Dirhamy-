// Punch-list item 73: "a shareable picture" — the other half. The link (handShare.ts) lets
// someone replay the exact deal; this lets someone just look at it, the "check out this hand"
// screenshot a link can't be. Drawn from data already on screen at the final-match modal (the
// ranked standings) rather than re-deriving anything, and painted with the theme's own live
// custom-property values so the image matches whatever felt/accent the player has set — a
// canvas has no cascade of its own to inherit them through.

export interface HandImageRow {
  name: string;
  score: string;
  mine: boolean;
  lead: boolean;
}

export interface HandImageSpec {
  gameName: string;
  resultLine: string;
  rows: HandImageRow[];
}

function themeColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function renderHandImage(spec: HandImageSpec): HTMLCanvasElement {
  const W = 1000;
  const H = 300 + spec.rows.length * 84 + 100;
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const ground = themeColor('--bg0', '#0a0807');
  const ink = themeColor('--ink', '#f4ede1');
  const muted = themeColor('--muted', '#a89b87');
  const accent = themeColor('--gold', '#c9a24a');

  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  ctx.fillStyle = accent;
  ctx.font = '700 30px Outfit, system-ui, sans-serif';
  ctx.fillText('DECKY', 60, 92);

  ctx.fillStyle = ink;
  ctx.font = '700 54px Outfit, system-ui, sans-serif';
  ctx.fillText(spec.gameName, 60, 172);

  ctx.fillStyle = muted;
  ctx.font = '500 26px Outfit, system-ui, sans-serif';
  ctx.fillText(spec.resultLine, 60, 216);

  let y = 300;
  for (const row of spec.rows) {
    const size = row.lead ? 36 : 28;
    ctx.fillStyle = row.lead ? accent : ink;
    ctx.font = `${row.lead ? 700 : 500} ${size}px Outfit, system-ui, sans-serif`;
    const label = row.name + (row.mine ? '  (you)' : '');
    ctx.fillText(label, 60, y);
    ctx.textAlign = 'right';
    ctx.fillText(row.score, W - 60, y);
    ctx.textAlign = 'left';
    y += 84;
  }

  ctx.fillStyle = muted;
  ctx.font = '400 18px Outfit, system-ui, sans-serif';
  ctx.fillText('decky — a card room for the web', 60, H - 44);

  return canvas;
}

export function handImageToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
