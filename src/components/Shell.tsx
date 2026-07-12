import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Newspaper, TrendingUp, Target, ShoppingBag, Briefcase,
  GraduationCap, HeartHandshake, Users, Activity, Award, CalendarRange,
  Bell, Search, Menu, ChevronRight, Play,
} from "lucide-react";
import { useGame } from "../state/GameContext";
import { advanceWeek } from "../engine/engine";
import { fmtAED, monthOf, netWorth } from "../engine/types";

const NAV = [
  {
    header: "Quick Access",
    items: [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/app/daily", label: "The Daily", icon: Newspaper },
      { to: "/app/invest", label: "Investments", icon: TrendingUp },
      { to: "/app/goals", label: "Goals", icon: Target },
    ],
  },
  {
    header: "Life",
    items: [
      { to: "/app/shopping", label: "Shopping", icon: ShoppingBag },
      { to: "/app/work", label: "Work & Gigs", icon: Briefcase },
      { to: "/app/learn", label: "Learn", icon: GraduationCap },
      { to: "/app/give", label: "Give", icon: HeartHandshake },
      { to: "/app/friends", label: "Friends", icon: Users },
    ],
  },
  {
    header: "Progress",
    items: [
      { to: "/app/health", label: "Health Check", icon: Activity },
      { to: "/app/achievements", label: "Achievements", icon: Award },
      { to: "/app/year", label: "Year in Review", icon: CalendarRange },
    ],
  },
];

const CRUMB_NAMES: Record<string, string> = {
  app: "Dashboard", daily: "The Daily", invest: "Investments", goals: "Goals",
  shopping: "Shopping", work: "Work & Gigs", learn: "Learn", give: "Give",
  friends: "Friends", health: "Health Check", achievements: "Achievements",
  year: "Year in Review", settings: "Settings",
};

export function Shell({ children }: { children: React.ReactNode }) {
  const { game, account, apply, signOut, notices } = useGame();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const crumbs = useMemo(() => {
    const parts = loc.pathname.split("/").filter(Boolean);
    return parts.map((p) => CRUMB_NAMES[p] ?? p.charAt(0).toUpperCase() + p.slice(1));
  }, [loc.pathname]);

  if (!game || !account) return null;

  const unread =
    game.news.some((n) => !n.read && n.editionWeek === game.week) ||
    game.pendingEvents.some((e) => !e.resolved) ||
    game.invitations.some((i) => i.status === "pending");

  const contextual = contextualPrompt();
  function contextualPrompt(): { title: string; body: string; to: string } {
    if (!game) return { title: "", body: "", to: "/app" };
    if (game.pendingIncome > 0)
      return { title: "Money waiting", body: `${fmtAED(game.pendingIncome)} needs allocating across Spend, Save and Invest.`, to: "/app" };
    if (game.pendingEvents.some((e) => !e.resolved))
      return { title: "Decision waiting", body: "Something happened this month that needs your call.", to: "/app" };
    if (game.news.some((n) => !n.read && n.editionWeek === game.week))
      return { title: "Fresh edition of The Daily", body: "Readers catch discounts and forecasts before everyone else.", to: "/app/daily" };
    return { title: "Steady as she goes", body: `Sim-month ${monthOf(game.week)}, net worth ${fmtAED(netWorth(game))}.`, to: "/app/health" };
  }

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.toLowerCase();
    const all = NAV.flatMap((s) => s.items);
    const hit = all.find((i) => i.label.toLowerCase().includes(q));
    if (hit) nav(hit.to);
    setQuery("");
  };

  const nextWeek = () => apply((prev) => {
    const r = advanceWeek(prev);
    return { state: r.state, notice: `Week ${r.state.week} begins. ${r.notices[0] ?? ""}` };
  });

  return (
    <div className="shell">
      <aside className={`sidebar ${sideOpen ? "open" : ""}`}>
        <div className="logo">
          Dirhamy<span>.</span>
        </div>
        {NAV.map((sec) => (
          <div className="side-section" key={sec.header}>
            <div className="side-header">{sec.header}</div>
            {sec.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={"end" in it && (it as { end?: boolean }).end}
                className={({ isActive }) => `side-item ${isActive ? "active" : ""}`}
                onClick={() => setSideOpen(false)}
              >
                <it.icon size={20} strokeWidth={1.5} />
                {it.label}
                {it.label === "The Daily" && unread && <span className="dot" />}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="side-card">
          <b>{contextual.title}</b>
          {contextual.body}{" "}
          <a style={{ color: "#C9A961", fontWeight: 600 }} href={contextual.to} onClick={(e) => { e.preventDefault(); nav(contextual.to); setSideOpen(false); }}>
            Open →
          </a>
        </div>
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header className="topbar">
          <button className="iconbtn hamburger" onClick={() => setSideOpen(!sideOpen)}>
            <Menu size={20} strokeWidth={1.5} />
          </button>
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight size={16} strokeWidth={1.5} color="#6f6f68" />}
                <span className={i < crumbs.length - 1 ? "parent" : ""}>{c}</span>
              </React.Fragment>
            ))}
          </div>
          <form className="searchbar" onSubmit={onSearch}>
            <Search size={16} strokeWidth={1.5} />
            <input ref={searchRef} placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="kbd">⌘/</span>
          </form>
          {game.mode === "solo" && (
            <button className="btn primary" onClick={nextWeek} title="Advance one sim-week">
              <Play size={16} strokeWidth={1.5} /> Next Week
            </button>
          )}
          <button className="iconbtn" onClick={() => nav("/app/daily")} title="Notifications">
            <Bell size={20} strokeWidth={1.5} />
            {unread && <span className="dot" />}
          </button>
          <button className="avatar" style={{ background: game.avatarColor }} onClick={() => setMenuOpen(!menuOpen)}>
            {game.displayName.charAt(0).toUpperCase() || "?"}
          </button>
          {menuOpen && (
            <div className="menu" onMouseLeave={() => setMenuOpen(false)}>
              <div style={{ padding: 8, fontSize: 12, color: "#6f6f68" }}>{account.email}</div>
              <button onClick={() => { nav("/app/settings"); setMenuOpen(false); }}>Account & Settings</button>
              <button onClick={() => { signOut(); nav("/"); }}>Sign out</button>
            </div>
          )}
        </header>
        <main className="main">
          <div className="main-inner">{children}</div>
        </main>
      </div>

      {notices.length > 0 && (
        <div className="notice-stack">
          {notices.map((n, i) => (
            <div className="notice" key={i}>{n}</div>
          ))}
        </div>
      )}
    </div>
  );
}
