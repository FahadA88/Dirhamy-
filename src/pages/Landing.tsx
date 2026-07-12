import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, Wallet, TrendingUp, Users } from "lucide-react";

const FAQS = [
  ["Is this real money?", "No. Dirhamy is a simulation — virtual dirhams, simulated markets, zero real-world risk. The habits you build are the only thing you take with you."],
  ["Who is it for?", "UAE teens aged 16–18 who want to practise money decisions before the stakes are real: budgeting a salary, resisting a sneaker drop, riding out a market dip."],
  ["Is the investing content Sharia-aware?", "Yes. Sharia-compliant options — a halal equity fund and sukuk — sit alongside conventional ones, clearly labelled, and the Give section includes a simplified zakat calculator."],
  ["What's the difference between Solo and Live mode?", "Solo is turn-based: you click Next Week when you're ready. Live maps one real day to one sim-week and moves whether you log in or not — like life."],
  ["Is it financial advice?", "No. Everything in Dirhamy is educational simulation, not investment advice. Numbers are simplified on purpose."],
];

const LEARN_ITEMS = ["Budgeting", "Investing", "Sharia-Compliant Finance", "Glossary"];

export default function Landing() {
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [learnOpen, setLearnOpen] = useState(false);

  return (
    <div className="landing">
      <div className="land-nav">
        <span className="brand">Dirhamy.</span>
        <nav>
          <a href="#top">Home</a>
          <a href="#how">How It Works</a>
          <span className="nav-item" onMouseLeave={() => setLearnOpen(false)}>
            <button onClick={() => setLearnOpen(!learnOpen)}>
              Learn <ChevronDown size={16} strokeWidth={1.5} style={{ verticalAlign: "-3px" }} />
            </button>
            {learnOpen && (
              <div className="submenu">
                {LEARN_ITEMS.map((l) => (
                  <a key={l} href="#practice" onClick={() => setLearnOpen(false)}>{l}</a>
                ))}
              </div>
            )}
          </span>
          <a href="#faq">Pricing</a>
          <a href="#faq">Blog</a>
        </nav>
        <Link to="/login" className="btn">Log in</Link>
        <Link to="/signup" className="btn primary">Get started</Link>
      </div>

      <section className="hero" id="top">
        <div>
          <h1>
            Learn to build wealth. <em>Before it costs you.</em>
          </h1>
          <p className="sub">
            A full life simulator for UAE teens: a salary, a city, friends with expensive taste, markets
            with moods — and every mistake is free.
          </p>
          <Link to="/signup" className="btn primary" style={{ padding: "12px 32px", fontSize: 16 }}>
            Start your simulation
          </Link>
        </div>
        <div className="mockup">
          <div className="hero-label">Your net worth</div>
          <div className="hero-number money" style={{ fontSize: 40 }}>AED 12,480</div>
          <div className="row mt8">
            <span className="chip pos">↑ 1,120 vs last month</span>
            <span className="chip gold">Streak: 4 months</span>
          </div>
          <div className="mt24" style={{ display: "grid", gap: 8 }}>
            {[
              ["Savings rate", "31%", "pos"],
              ["Sharia-compliant fund", "+2.1%", "pos"],
              ["Spending pace", "AED 1,540", "neutral"],
            ].map(([l, v, k]) => (
              <div key={l as string} className="row between" style={{ border: "1px solid #EAEAE5", borderRadius: 8, padding: "8px 16px" }}>
                <span className="small muted">{l}</span>
                <span className={`chip ${k}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="land-section" id="how">
        <h2>How it works</h2>
        <div className="cols-3">
          <div className="num-col">
            <div className="num">01</div>
            <h3>Live a simulated life</h3>
            <p>You're 16, in the UAE, with a part-time salary of AED 2,000. Rent and food are covered — everything else is on you. Five actions a week; choose them well.</p>
          </div>
          <div className="num-col">
            <div className="num">02</div>
            <h3>Make real decisions</h3>
            <p>Friends invite you out. Markets dip. Phones crack. News hints at what's coming — some of it reliable, some of it noise. You type your own answers; no multiple-choice life.</p>
          </div>
          <div className="num-col">
            <div className="num">03</div>
            <h3>See the consequences</h3>
            <p>Every choice compounds into a net worth chart, a report card, and habits you'll keep. Survive a market dip once here and you'll recognise the feeling forever.</p>
          </div>
        </div>
      </section>

      <section className="land-section" id="practice" style={{ background: "#fff", maxWidth: "none" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <h2>What you'll practise</h2>
          <div className="cols-3">
            <div className="card hoverable">
              <Wallet size={24} strokeWidth={1.5} color="#0F4C3A" />
              <h3 style={{ fontSize: 18, margin: "16px 0 8px" }}>Budgeting</h3>
              <p className="muted">Split every dirham of income across Spend, Save and Invest. Fixed bills arrive whether you're ready or not.</p>
            </div>
            <div className="card hoverable">
              <TrendingUp size={24} strokeWidth={1.5} color="#0F4C3A" />
              <h3 style={{ fontSize: 18, margin: "16px 0 8px" }}>Investing</h3>
              <p className="muted">Eleven assets across four unlocking tiers — savings accounts to crypto — with honest volatility and honest lessons.</p>
            </div>
            <div className="card hoverable">
              <Users size={24} strokeWidth={1.5} color="#0F4C3A" />
              <h3 style={{ fontSize: 18, margin: "16px 0 8px" }}>Real-world decisions</h3>
              <p className="muted">Peer pressure, BNPL temptation, family obligations, news you can't fully trust. The syllabus nobody teaches.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="land-section">
        <h2>Made for the UAE</h2>
        <div className="grid2">
          <div className="card lg">
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>Sharia-compliant, side by side</h3>
            <p className="muted">Halal equity funds, sukuk, and a zakat calculator built in — labelled clearly, never an afterthought.</p>
          </div>
          <div className="card lg">
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>AED-native</h3>
            <p className="muted">Dirhams everywhere. DFM and ADX in the headlines, karak in the café, Eidiya in the events deck.</p>
          </div>
        </div>
      </section>

      <section className="land-section" style={{ textAlign: "center" }}>
        <blockquote style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 300, maxWidth: 640, margin: "0 auto", lineHeight: 1.4 }}>
          "The first time I lost virtual money in a market dip, I finally understood what my father meant
          about patience."
        </blockquote>
        <p className="muted small mt16">— Beta tester, 17, Sharjah (placeholder)</p>
      </section>

      <section className="land-section" id="faq" style={{ maxWidth: 720 }}>
        <h2>Questions, answered</h2>
        {FAQS.map(([q, a], i) => (
          <div className="faq-item" key={i}>
            <button onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
              {q}
              {faqOpen === i ? <ChevronUp size={16} strokeWidth={1.5} /> : <ChevronDown size={16} strokeWidth={1.5} />}
            </button>
            {faqOpen === i && <div className="a">{a}</div>}
          </div>
        ))}
      </section>

      <footer className="footer">
        <div>
          <span className="brand" style={{ fontFamily: "Fraunces, serif", fontWeight: 700, color: "#0F4C3A", fontSize: 20 }}>Dirhamy.</span>
          <p className="muted small mt8">Learn to build wealth. Before it costs you.</p>
        </div>
        <div>
          <h4>Product</h4>
          <a href="#how">How it works</a>
          <a href="#faq">Pricing</a>
        </div>
        <div>
          <h4>Learn</h4>
          {LEARN_ITEMS.map((l) => <a key={l} href="#practice">{l}</a>)}
        </div>
        <div>
          <h4>Company</h4>
          <a href="#top">About</a>
          <a href="#faq">Blog</a>
        </div>
        <div>
          <h4>Legal</h4>
          <a href="#faq">Terms</a>
          <a href="#faq">Privacy</a>
        </div>
      </footer>
    </div>
  );
}
