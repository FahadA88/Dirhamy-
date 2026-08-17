import { useState } from 'react';
import {
  CONDITIONS, EFFECTS, HOOKS, ParamSpec, ParamValue, RuleDraft,
  compileRule, defaultsFor, findCondition, findEffect, newRuleDraft,
} from '../authoring/ruleKit';
import { explainRule } from '../authoring/explain';

// The near-programmable layer, as a screen.
//
// Every rule reads back as a sentence the moment it changes, because the thing that convinces
// someone their logic is right is not a JSON tree — it is seeing "When a card is played, and the
// card is a Queen: swap hands with the next player." written under the controls they just moved.
//
// Progressive disclosure is literal here: ingredients marked `advanced` are hidden behind a
// toggle, so the first list an author sees is eight plain choices rather than twenty.

export function RuleBuilder({ rules, onChange }: {
  rules: RuleDraft[];
  onChange: (next: RuleDraft[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function add() {
    const draft = newRuleDraft(rules.length + 1);
    onChange([...rules, draft]);
    setOpenId(draft.id);
  }
  function update(id: string, patch: Partial<RuleDraft>) {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    onChange(rules.filter((r) => r.id !== id));
    if (openId === id) setOpenId(null);
  }
  function move(id: string, dir: -1 | 1) {
    // Order matters: rules fire top to bottom, and one that ends the hand stops the rest.
    const i = rules.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rules.length) return;
    const next = rules.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="rulebuilder">
      <div className="rb-head">
        <div>
          <h3>Twists</h3>
          <p className="rb-sub">
            Rules of your own: when something happens, if a condition holds, this is what the game does.
            They run in order, top to bottom.
          </p>
        </div>
        <label className="rb-adv">
          <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} />
          <span>Show advanced</span>
        </label>
      </div>

      {rules.length === 0 && (
        <div className="rb-empty">
          <div className="rb-empty-mark">✳</div>
          <p>No twists yet. The game plays by its family's rules alone.</p>
          <button className="primary sm" onClick={add}>Write your first rule</button>
        </div>
      )}

      <ol className="rb-list">
        {rules.map((rule, i) => {
          const open = openId === rule.id;
          return (
            <li key={rule.id} className={`rb-item ${open ? 'open' : ''} ${rule.enabled ? '' : 'off'}`}>
              <div className="rb-row">
                <span className="rb-index">{i + 1}</span>
                <button className="rb-title" onClick={() => setOpenId(open ? null : rule.id)}>
                  <b>{rule.name}</b>
                  <span className="rb-sentence">{explainRule(compileRule(rule))}</span>
                </button>
                <div className="rb-tools">
                  <button className="icon-btn" title="Move up" onClick={() => move(rule.id, -1)} disabled={i === 0}>↑</button>
                  <button className="icon-btn" title="Move down" onClick={() => move(rule.id, 1)} disabled={i === rules.length - 1}>↓</button>
                  <button className={`icon-btn ${rule.enabled ? 'on' : ''}`} title={rule.enabled ? 'Turn this rule off' : 'Turn this rule on'}
                    onClick={() => update(rule.id, { enabled: !rule.enabled })}>{rule.enabled ? '●' : '○'}</button>
                  <button className="icon-btn danger" title="Delete" onClick={() => remove(rule.id)}>✕</button>
                </div>
              </div>

              {open && (
                <div className="rb-body">
                  <label className="field"><span>Name it</span>
                    <input value={rule.name} onChange={(e) => update(rule.id, { name: e.target.value })} />
                  </label>

                  <div className="rb-clause">
                    <span className="rb-kw">When</span>
                    <select value={rule.when} onChange={(e) => update(rule.id, { when: e.target.value as RuleDraft['when'] })}>
                      {HOOKS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                    </select>
                  </div>
                  <p className="rb-hint">{HOOKS.find((h) => h.value === rule.when)?.hint}</p>

                  <div className="rb-clause">
                    <span className="rb-kw">If</span>
                    <select value={rule.condId} onChange={(e) => {
                      const spec = findCondition(e.target.value);
                      update(rule.id, { condId: spec.id, condParams: defaultsFor(spec.params) });
                    }}>
                      {CONDITIONS.filter((c) => showAdvanced || !c.advanced).map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <Params
                    specs={findCondition(rule.condId).params}
                    values={rule.condParams}
                    onChange={(k, v) => update(rule.id, { condParams: { ...rule.condParams, [k]: v } })}
                  />
                  {findCondition(rule.condId).hint && <p className="rb-hint">{findCondition(rule.condId).hint}</p>}

                  <div className="rb-clause"><span className="rb-kw">Then</span></div>
                  {rule.effects.map((eff, ei) => {
                    const spec = findEffect(eff.specId);
                    return (
                      <div key={ei} className="rb-effect">
                        <div className="rb-effect-head">
                          <select value={eff.specId} onChange={(e) => {
                            const next = findEffect(e.target.value)!;
                            const effects = rule.effects.slice();
                            effects[ei] = { specId: next.id, params: defaultsFor(next.params) };
                            update(rule.id, { effects });
                          }}>
                            {EFFECTS.filter((x) => showAdvanced || !x.advanced || x.id === eff.specId).map((x) => (
                              <option key={x.id} value={x.id}>{x.label}</option>
                            ))}
                          </select>
                          <button className="icon-btn danger" title="Remove this action"
                            onClick={() => update(rule.id, { effects: rule.effects.filter((_, k) => k !== ei) })}>✕</button>
                        </div>
                        <Params
                          specs={spec?.params ?? []}
                          values={eff.params}
                          onChange={(k, v) => {
                            const effects = rule.effects.slice();
                            effects[ei] = { ...eff, params: { ...eff.params, [k]: v } };
                            update(rule.id, { effects });
                          }}
                        />
                        {spec?.hint && <p className="rb-hint">{spec.hint}</p>}
                      </div>
                    );
                  })}
                  <button className="chip" onClick={() => {
                    const first = EFFECTS[0];
                    update(rule.id, { effects: [...rule.effects, { specId: first.id, params: defaultsFor(first.params) }] });
                  }}>+ And also…</button>

                  <label className="field"><span>Note for players (optional)</span>
                    <input value={rule.note ?? ''} placeholder="Why this rule exists"
                      onChange={(e) => update(rule.id, { note: e.target.value })} />
                  </label>

                  <div className="rb-readback">
                    <span className="rb-readback-label">In plain English</span>
                    <p>{explainRule(compileRule(rule))}</p>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {rules.length > 0 && <button className="ghost sm" onClick={add}>+ Add another rule</button>}
    </div>
  );
}

/** One renderer for every parameter any ingredient declares — that's what keeps the palette open. */
function Params({ specs, values, onChange }: {
  specs: ParamSpec[];
  values: Record<string, ParamValue>;
  onChange: (key: string, value: ParamValue) => void;
}) {
  if (specs.length === 0) return null;
  return (
    <div className="rb-params">
      {specs.map((p) => {
        const v = values[p.key] ?? p.def;
        if (p.kind === 'select') {
          return (
            <label key={p.key} className="field"><span>{p.label}</span>
              <select value={String(v)} onChange={(e) => onChange(p.key, e.target.value)}>
                {p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          );
        }
        if (p.kind === 'number') {
          return (
            <label key={p.key} className="field"><span>{p.label}</span>
              <input type="number" value={Number(v)} min={p.min} max={p.max} step={p.step ?? 1}
                onChange={(e) => onChange(p.key, parseInt(e.target.value || '0', 10))} />
            </label>
          );
        }
        return (
          <label key={p.key} className="field"><span>{p.label}</span>
            <input value={String(v)} placeholder={p.placeholder}
              onChange={(e) => onChange(p.key, e.target.value)} />
          </label>
        );
      })}
    </div>
  );
}
