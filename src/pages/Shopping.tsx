import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ShoppingCart, Cross, Coffee, Utensils, Shirt, Smartphone, BookOpen,
  Clapperboard, Dumbbell, Scissors, Gift, Plane, ArrowLeft, Lock,
  type LucideIcon,
} from "lucide-react";
import { useGame } from "../state/GameContext";
import { LOCATIONS, getLocation, type Item } from "../data/catalog";
import { fmtAED, monthOf } from "../engine/types";
import { buyCart, discountedPrice, reserveItem } from "../engine/engine";
import { Modal, MoneyInput, useImpulseCheck } from "../components/ui";

const ICONS: Record<string, LucideIcon> = {
  "shopping-cart": ShoppingCart, cross: Cross, coffee: Coffee, utensils: Utensils,
  shirt: Shirt, smartphone: Smartphone, "book-open": BookOpen, clapperboard: Clapperboard,
  dumbbell: Dumbbell, scissors: Scissors, gift: Gift, plane: Plane,
};

export default function GoOut() {
  const { game } = useGame();
  if (!game) return null;
  const m = monthOf(game.week);
  return (
    <div>
      <h2 style={{ fontSize: 28 }}>Go Out</h2>
      <p className="muted mt8 mb24">
        Every trip costs 1 action — you have {game.actionsLeft} left this week. Time is money's quieter sibling.
      </p>
      <div className="city-grid">
        {LOCATIONS.map((l) => {
          const Icon = ICONS[l.icon] ?? ShoppingCart;
          const locked = l.unlockMonth && m < l.unlockMonth;
          const discount = game.discounts.find((d) => d.locationId === l.id && d.expiresWeek >= game.week);
          return (
            <Link
              key={l.id}
              to={locked ? "#" : `/app/shopping/${l.id}`}
              className="card hoverable loc-card"
              style={locked ? { opacity: 0.5, pointerEvents: "none" } : undefined}
            >
              <div className="loc-icon" style={{ background: l.accent }}>
                <Icon size={24} strokeWidth={1.5} />
              </div>
              <div className="row between">
                <b>{l.name}</b>
                {l.necessary && <span className="chip pos">Essential</span>}
                {discount && <span className="chip gold">{discount.pct}% off</span>}
                {locked && <span className="chip neutral"><Lock size={12} strokeWidth={1.5} /> Month {l.unlockMonth}</span>}
              </div>
              <p className="muted small mt8">{l.tagline}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function LocationPage() {
  const { locationId } = useParams();
  const { game, apply } = useGame();
  const nav = useNavigate();
  const [cart, setCart] = useState<string[]>([]);
  const [reserving, setReserving] = useState<string | null>(null);
  const [weekly, setWeekly] = useState("");
  const { check, dialog } = useImpulseCheck();
  const loc = getLocation(locationId ?? "");

  const sections = useMemo(() => {
    if (!loc) return [];
    const out: { name: string; items: Item[] }[] = [];
    for (const it of loc.items) {
      let s = out.find((x) => x.name === it.section);
      if (!s) { s = { name: it.section, items: [] }; out.push(s); }
      s.items.push(it);
    }
    return out;
  }, [loc]);

  if (!game || !loc) return <p>Location not found.</p>;
  const discount = game.discounts.find((d) => d.locationId === loc.id && d.expiresWeek >= game.week);
  const cartTotal = cart.reduce((a, id) => {
    const it = loc.items.find((x) => x.id === id)!;
    return a + discountedPrice(game, loc.id, it.price);
  }, 0);

  const checkout = () => {
    check(`${cart.length} item cart at ${loc.name}`, cartTotal, game.buckets.spend, () => {
      const err = apply((p) => buyCart(p, loc.id, cart));
      if (!err) setCart([]);
    });
  };

  const buyOne = (itemId: string, bnpl = false) => {
    const it = loc.items.find((x) => x.id === itemId)!;
    const price = discountedPrice(game, loc.id, it.price);
    check(it.name, price, game.buckets.spend, () => {
      apply((p) => buyCart(p, loc.id, [itemId], { bnpl }));
    });
  };

  const supermarketStyle = loc.id === "supermarket" || loc.id === "pharmacy";

  return (
    <div>
      <button className="btn ghost" onClick={() => nav("/app/shopping")}>
        <ArrowLeft size={16} strokeWidth={1.5} /> Back to Go Out
      </button>
      <div className="loc-header mt16" style={{ background: loc.accent }}>
        <div>
          <h2 style={{ fontSize: 28 }}>{loc.name}</h2>
          <p className="muted mt8">{loc.tagline}</p>
          <div className="row mt8">
            <span className="chip neutral money">Spend balance: {fmtAED(game.buckets.spend)}</span>
            {discount && <span className="chip gold">{discount.pct}% off this week — you read The Daily</span>}
          </div>
        </div>
        {supermarketStyle && cart.length > 0 && (
          <button className="btn primary" onClick={checkout}>
            Checkout {cart.length} items · {fmtAED(cartTotal)}
          </button>
        )}
      </div>

      {sections.map((sec) => (
        <div key={sec.name}>
          <div className="section-head"><h2 style={{ fontSize: 18 }}>{sec.name}</h2></div>
          <div className="item-grid">
            {sec.items.map((it) => {
              const price = discountedPrice(game, loc.id, it.price);
              const inCart = cart.includes(it.id);
              return (
                <div className="card hoverable item-card" key={it.id}>
                  <span className="i-name">{it.name}</span>
                  <span className="price money">
                    {price !== it.price && <span className="was">{fmtAED(it.price)}</span>}
                    {fmtAED(price)}
                  </span>
                  {it.note && <span className="i-note">{it.note}</span>}
                  <div className="item-actions">
                    {supermarketStyle ? (
                      <button
                        className={`btn small ${inCart ? "" : "primary"}`}
                        onClick={() => setCart(inCart ? cart.filter((x) => x !== it.id) : [...cart, it.id])}
                      >
                        {inCart ? "Remove" : "Add to cart"}
                      </button>
                    ) : (
                      <button className="btn primary small" onClick={() => buyOne(it.id)}>Buy now</button>
                    )}
                    {it.price >= 300 && !supermarketStyle && (
                      <button className="btn small" onClick={() => { setWeekly(""); setReserving(it.id); }}>
                        Reserve & Save
                      </button>
                    )}
                    {loc.bnpl && it.price >= 300 && (
                      <button className="btn small" onClick={() => buyOne(it.id, true)} title="4 monthly payments, 8% fee">
                        BNPL
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {supermarketStyle && cart.length > 0 && (
        <div className="card mt24 row between">
          <b className="money">Cart: {cart.length} items · {fmtAED(cartTotal)}</b>
          <button className="btn primary" onClick={checkout}>Checkout (1 action)</button>
        </div>
      )}

      {reserving && (
        <Modal title="Reserve & Save" onClose={() => setReserving(null)}>
          {(() => {
            const it = loc.items.find((x) => x.id === reserving)!;
            return (
              <>
                <p>
                  <b>{it.name}</b> — {fmtAED(discountedPrice(game, loc.id, it.price))}. Pick any weekly
                  amount; it moves aside automatically each sim-week. Cancel anytime for a full refund.
                  Roughly 1 in 4 reserved items catches a sale — you'd pay the sale price and pocket the difference.
                </p>
                <label className="field mt16">Weekly amount (your choice)</label>
                <MoneyInput value={weekly} onChange={setWeekly} context="/week from Spend" />
                <div className="actions">
                  <button className="btn" onClick={() => setReserving(null)}>Cancel</button>
                  <button
                    className="btn primary"
                    onClick={() => {
                      const err = apply((p) => reserveItem(p, loc.id, reserving, parseInt(weekly || "0", 10)));
                      if (!err) setReserving(null);
                    }}
                  >
                    Start reserving
                  </button>
                </div>
              </>
            );
          })()}
        </Modal>
      )}
      {dialog}
    </div>
  );
}
