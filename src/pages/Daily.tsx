import React, { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useGame } from "../state/GameContext";
import { readNews } from "../engine/engine";
import type { NewsItem } from "../engine/types";

const CATS = ["All", "Markets", "Retail", "Real Estate", "Jobs & Economy", "Consumer Alerts"];

function RelTag({ r }: { r: NewsItem["reliability"] }) {
  return <span className={`rel-tag rel-${r}`}>{r}</span>;
}

export default function Daily() {
  const { game, apply } = useGame();
  const [cat, setCat] = useState("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const edition = useMemo(
    () => (game ? game.news.filter((n) => n.editionWeek === game.week) : []),
    [game]
  );
  const archive = useMemo(
    () => (game ? game.news.filter((n) => n.editionWeek < game.week) : []),
    [game]
  );
  if (!game) return null;

  const open = game.news.find((n) => n.id === openId);
  if (open) {
    return (
      <div className="article">
        <button className="btn ghost" onClick={() => setOpenId(null)}>
          <ArrowLeft size={16} strokeWidth={1.5} /> Back to the newsstand
        </button>
        <div className="row mt16">
          <span className="chip neutral">{open.category}</span>
          <RelTag r={open.reliability} />
          <span className="muted small">Sim-week {open.editionWeek}</span>
        </div>
        <h1>{open.headline}</h1>
        {open.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <div className="affects">This affects: {open.affects}</div>
        {open.outcomeShown && (
          <p className="disclaimer">
            You read this {open.reliability} story. Outcome matched: {open.outcomeMatched ? "Yes" : "No"}.
          </p>
        )}
        <p className="muted small mt24">
          The Daily never places trades or buys things for you. If a story changes your mind, head to
          Investments or the shops yourself and decide the amount independently.
        </p>
      </div>
    );
  }

  const visible = (showArchive ? archive : edition).filter((n) => cat === "All" || n.category === cat);
  const [lead, ...rest] = visible;

  return (
    <div className="paper">
      <div className="paper-masthead">
        <h1>The Daily</h1>
        <div className="sub">
          Sim-week {game.week} edition · {edition.filter((n) => !n.read).length} unread ·
          Confirmed is always right — Forecast ~70% — Speculation ~50%
        </div>
      </div>
      <div className="cat-tabs">
        {CATS.map((c) => (
          <button key={c} className={`cat-tab ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
        <button className={`cat-tab ${showArchive ? "active" : ""}`} onClick={() => setShowArchive(!showArchive)}>
          Past editions
        </button>
      </div>

      {visible.length === 0 && <p className="muted">Nothing here. A new edition prints every sim-week.</p>}

      {lead && (
        <div
          className="news-lead"
          onClick={() => {
            apply((p) => readNews(p, lead.id));
            setOpenId(lead.id);
          }}
        >
          <div className="row">
            <span className="chip neutral">{lead.category}</span>
            <RelTag r={lead.reliability} />
            {!lead.read && <span className="chip gold">Unread</span>}
          </div>
          <h2>{lead.headline}</h2>
          <p className="muted">{lead.body[0]}</p>
        </div>
      )}
      <div className="news-grid">
        {rest.map((n) => (
          <div
            key={n.id}
            className="news-cell"
            onClick={() => {
              apply((p) => readNews(p, n.id));
              setOpenId(n.id);
            }}
          >
            <div className="row">
              <span className="chip neutral">{n.category}</span>
              <RelTag r={n.reliability} />
              {!n.read && <span className="chip gold">Unread</span>}
            </div>
            <h3>{n.headline}</h3>
            <p className="muted small">{n.body[0].slice(0, 110)}…</p>
          </div>
        ))}
      </div>

      {game.lastDigest && game.lastDigest.missedNews.length > 0 && !showArchive && (
        <div className="card mt40">
          <b>Missed last week</b>
          {game.lastDigest.missedNews.map((m, i) => (
            <p key={i} className="muted small mt8">{m}</p>
          ))}
          <p className="muted small mt8">Not a punishment — just what reading would have caught.</p>
        </div>
      )}
    </div>
  );
}
