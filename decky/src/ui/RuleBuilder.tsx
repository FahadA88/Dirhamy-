import { useMemo, useState } from 'react';
import {
  CONDITIONS, CondNode, EFFECTS, HOOKS, ParamSpec, ParamValue, RestrictionDraft, RuleDraft,
  compileRestriction, compileRule, condNodesOf, defaultsFor, findCondition, findEffect,
  newRestrictionDraft, newRuleDraft, PATTERNS,
} from '../authoring/ruleKit';
import { explainPredicate, explainRule } from '../authoring/explain';
import { Confirm } from './Confirm';
import { GameDefinition } from '../engine/types';
import { previewRule } from '../engine/engine';

// The near-programmable layer, as a screen.
//
// Every rule reads back as a sentence the moment it changes, because the thing that convinces
// someone their logic is right is not a JSON tree — it is seeing "When a card is played, and the
// card is a Queen: swap hands with the next player." written under the controls they just moved.
//
// Progressive disclosure is literal here: ingredients marked `advanced` are hidden behind a
// toggle, so the first list an author sees is eight plain choices rather than twenty.

export function RuleBuilder({ def, rules, onChange }: {
  def: GameDefinition;
  rules: RuleDraft[];
  onChange: (next: RuleDraft[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Item 43 of the audit pass: deleting a whole rule — every clause, every effect, all of it —
  // fired instantly on one click, with nothing else in the builder that destructive.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

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
  function setEffect(rule: RuleDraft, ei: number, patch: Partial<RuleDraft['effects'][number]>) {
    const effects = rule.effects.slice();
    effects[ei] = { ...effects[ei], ...patch };
    update(rule.id, { effects });
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

      {/* Rules that reference each other are the hard part to discover: a counter one rule
          writes and another reads is invisible until you have seen it done once. */}
      <details className="rb-patterns">
        <summary>Start from a pattern</summary>
        <div className="rb-pattern-list">
          {PATTERNS.map((pat) => (
            <button key={pat.id} className="rb-pattern" onClick={() => {
              const made = pat.build(rules.length + 1);
              onChange([...rules, ...made]);
              setOpenId(made[0].id);
            }}>
              <b>{pat.name}</b>
              <em>{pat.blurb}</em>
            </button>
          ))}
        </div>
      </details>

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
                  <button className="icon-btn danger" title="Delete" onClick={() => setConfirmingDeleteId(rule.id)}>✕</button>
                </div>
              </div>
              {confirmingDeleteId === rule.id && (
                <Confirm title="Delete this rule?" body={`"${rule.name}" and everything in it will be gone for good.`}
                  confirmLabel="Delete" onCancel={() => setConfirmingDeleteId(null)}
                  onConfirm={() => { remove(rule.id); setConfirmingDeleteId(null); }} />
              )}

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

                  {/* A rule used to hold exactly one condition, so "a queen AND a spade" —
                      which the engine's `all` predicate has always understood — could not be
                      said here at all. Clauses are a list now, joined by all/any, each one
                      invertible on its own. */}
                  {(() => {
                    const nodes = condNodesOf(rule);
                    const setNodes = (next: CondNode[]) => update(rule.id, {
                      conds: next,
                      condId: next[0]?.condId ?? rule.condId,
                      condParams: next[0]?.params ?? rule.condParams,
                    });
                    return (
                      <>
                        <div className="rb-clause">
                          <span className="rb-kw">If</span>
                          {nodes.length > 1 && (
                            <div className="rb-join">
                              <button className={rule.condJoin !== 'any' ? 'on' : ''}
                                onClick={() => update(rule.id, { condJoin: 'all' })}>all of these</button>
                              <button className={rule.condJoin === 'any' ? 'on' : ''}
                                onClick={() => update(rule.id, { condJoin: 'any' })}>any of these</button>
                            </div>
                          )}
                        </div>
                        {nodes.map((node, ci) => {
                          const spec = findCondition(node.condId);
                          return (
                            <div key={ci} className="rb-cond">
                              <div className="rb-cond-head">
                                <button className={`chip neg ${node.negate ? 'on' : ''}`}
                                  aria-pressed={!!node.negate}
                                  title={node.negate ? 'Inverted — click to un-invert' : 'Invert this clause'}
                                  onClick={() => setNodes(nodes.map((x, k) => (k === ci ? { ...x, negate: !x.negate } : x)))}>
                                  not
                                </button>
                                <select value={node.condId} onChange={(e) => {
                                  const next = findCondition(e.target.value);
                                  setNodes(nodes.map((x, k) => (k === ci ? { ...x, condId: next.id, params: defaultsFor(next.params) } : x)));
                                }}>
                                  {CONDITIONS.filter((c) => showAdvanced || !c.advanced || c.id === node.condId).map((c) => (
                                    <option key={c.id} value={c.id}>{c.label}</option>
                                  ))}
                                </select>
                                {nodes.length > 1 && (
                                  <button className="icon-btn danger" title="Remove this clause"
                                    onClick={() => setNodes(nodes.filter((_, k) => k !== ci))}>✕</button>
                                )}
                              </div>
                              <Params specs={spec.params} values={node.params}
                                onChange={(k, v) => setNodes(nodes.map((x, j) => (j === ci ? { ...x, params: { ...x.params, [k]: v } } : x)))} />
                              {spec.hint && <p className="rb-hint">{spec.hint}</p>}
                            </div>
                          );
                        })}
                        <button className="chip" onClick={() => {
                          const first = CONDITIONS[1];
                          setNodes([...nodes, { condId: first.id, params: defaultsFor(first.params) }]);
                        }}>+ And only if…</button>
                      </>
                    );
                  })()}

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
                        {/* One action, its own condition. A rule used to be all-or-nothing —
                            every action fired or none did — so "score five, and if they are
                            also out of hearts, skip them" needed two rules with duplicated
                            conditions. This compiles to the engine's `if` op. */}
                        {eff.onlyIf ? (
                          <div className="rb-onlyif">
                            <div className="rb-cond-head">
                              <span className="rb-kw sm">but only if</span>
                              <button className={`chip neg ${eff.onlyIf.negate ? 'on' : ''}`}
                                aria-pressed={!!eff.onlyIf.negate}
                                title={eff.onlyIf.negate ? 'Inverted — click to un-invert' : 'Invert this clause'}
                                onClick={() => setEffect(rule, ei, { onlyIf: { ...eff.onlyIf!, negate: !eff.onlyIf!.negate } })}>
                                not
                              </button>
                              <select value={eff.onlyIf.condId} onChange={(e) => {
                                const next = findCondition(e.target.value);
                                setEffect(rule, ei, { onlyIf: { condId: next.id, params: defaultsFor(next.params), negate: eff.onlyIf?.negate } });
                              }}>
                                {CONDITIONS.filter((c) => showAdvanced || !c.advanced || c.id === eff.onlyIf!.condId).map((c) => (
                                  <option key={c.id} value={c.id}>{c.label}</option>
                                ))}
                              </select>
                              <button className="icon-btn danger" title="Always do this"
                                onClick={() => setEffect(rule, ei, { onlyIf: undefined })}>✕</button>
                            </div>
                            <Params specs={findCondition(eff.onlyIf.condId).params} values={eff.onlyIf.params}
                              onChange={(k, v) => setEffect(rule, ei, { onlyIf: { ...eff.onlyIf!, params: { ...eff.onlyIf!.params, [k]: v } } })} />
                          </div>
                        ) : (
                          <button className="chip subtle" onClick={() => {
                            const first = CONDITIONS[1];
                            setEffect(rule, ei, { onlyIf: { condId: first.id, params: defaultsFor(first.params) } });
                          }}>+ but only if…</button>
                        )}
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

                  <RulePreviewPanel def={def} rule={compileRule(rule)} />
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

/**
 * Watch a rule fire before you save it (item 43). Not a simulation of the rule's own hook
 * actually occurring — that would mean a bespoke search per hook, thirteen of them — but a real
 * dealt position, the rule's condition actually checked against it, and its effects actually run
 * on a throwaway copy of that state if the condition holds. "Deal another hand" tries a
 * different position rather than pretending the same one is the only one that matters.
 */
function RulePreviewPanel({ def, rule }: { def: GameDefinition; rule: ReturnType<typeof compileRule> }) {
  const [seed, setSeed] = useState(20250817);
  const preview = useMemo(() => previewRule(def, rule, seed), [def, rule, seed]);

  return (
    <div className="rb-preview">
      <div className="rb-preview-head">
        <span className="rb-readback-label">Watch it fire</span>
        <button className="chip subtle sm" onClick={() => setSeed((s) => s + 1)}>🎲 Deal another hand</button>
      </div>
      {!preview.ok ? (
        <p className="rb-preview-note">Can't preview this yet — {preview.error ?? 'the game has something to fix first.'}</p>
      ) : (
        <div className="rb-preview-body">
          <p className="rb-preview-note">
            {preview.playerId ?? 'Someone'}{preview.targetCard ? `, looking at ${preview.targetCard}` : ''} —{' '}
            {preview.conditionHolds ? 'the condition holds here.' : 'the condition does NOT hold here — nothing would happen.'}
          </p>
          {preview.conditionHolds && (
            <>
              {(preview.changes?.length ?? 0) > 0 ? (
                <ul className="rb-preview-changes">
                  {preview.changes!.map((c, i) => (
                    <li key={i}><b>{c.label}</b>: {c.before} → {c.after}</li>
                  ))}
                </ul>
              ) : (
                <p className="rb-preview-note">The effects ran, but nothing about the score or the game's own counters changed.</p>
              )}
              {(preview.logLines?.length ?? 0) > 0 && (
                <ul className="rb-preview-log">
                  {preview.logLines!.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Plays the game forbids.
 *
 * A twist reacts to a move; a restriction stops one. They are separated because they are
 * different questions — "what happens when you play a heart" and "may you play a heart at all"
 * — and because a rule that could do both would be a rule nobody could read back in a sentence.
 */
export function RestrictionBuilder({ restrictions, onChange }: {
  restrictions: RestrictionDraft[];
  onChange: (next: RestrictionDraft[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Item 43 of the audit pass — same fix as RuleBuilder's own delete above.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<RestrictionDraft>) =>
    onChange(restrictions.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="rulebuilder">
      <div className="rb-head">
        <div>
          <h3>Forbidden plays</h3>
          <p className="rb-sub">
            Cards that may not be played, and when. If a rule here would leave someone with no
            legal move at all, it steps aside for that turn — a stuck game is worse than a rule
            that occasionally does not apply.
          </p>
        </div>
        <label className="rb-adv">
          <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} />
          <span>Show advanced</span>
        </label>
      </div>

      {restrictions.length === 0 && (
        <div className="rb-empty">
          <div className="rb-empty-mark">⃠</div>
          <p>Nothing is forbidden beyond what the family already forbids.</p>
          <button className="primary sm" onClick={() => {
            const d = newRestrictionDraft(1);
            onChange([d]); setOpenId(d.id);
          }}>Forbid a play</button>
        </div>
      )}

      <ol className="rb-list">
        {restrictions.map((r) => {
          const open = openId === r.id;
          return (
            <li key={r.id} className={`rb-item ${open ? 'open' : ''} ${r.enabled ? '' : 'off'}`}>
              <div className="rb-row">
                <span className="rb-index">⃠</span>
                <button className="rb-title" onClick={() => setOpenId(open ? null : r.id)}>
                  <b>{r.name}</b>
                  <span className="rb-sentence">You may not play a card when {explainPredicate(compileRestriction(r).if)}.</span>
                </button>
                <div className="rb-tools">
                  <button className={`icon-btn ${r.enabled ? 'on' : ''}`} title={r.enabled ? 'Turn this off' : 'Turn this on'}
                    onClick={() => update(r.id, { enabled: !r.enabled })}>{r.enabled ? '●' : '○'}</button>
                  <button className="icon-btn danger" title="Delete"
                    onClick={() => setConfirmingDeleteId(r.id)}>✕</button>
                </div>
              </div>
              {confirmingDeleteId === r.id && (
                <Confirm title="Delete this restriction?" body={`"${r.name}" will be gone for good.`}
                  confirmLabel="Delete" onCancel={() => setConfirmingDeleteId(null)}
                  onConfirm={() => {
                    onChange(restrictions.filter((x) => x.id !== r.id));
                    if (open) setOpenId(null);
                    setConfirmingDeleteId(null);
                  }} />
              )}
              {open && (
                <div className="rb-body">
                  <label className="field"><span>Name it</span>
                    <input value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} /></label>
                  <div className="rb-clause">
                    <span className="rb-kw">Not if</span>
                    {r.conds.length > 1 && (
                      <div className="rb-join">
                        <button className={r.condJoin !== 'any' ? 'on' : ''} onClick={() => update(r.id, { condJoin: 'all' })}>all of these</button>
                        <button className={r.condJoin === 'any' ? 'on' : ''} onClick={() => update(r.id, { condJoin: 'any' })}>any of these</button>
                      </div>
                    )}
                  </div>
                  {r.conds.map((node, ci) => {
                    const spec = findCondition(node.condId);
                    const setConds = (next: CondNode[]) => update(r.id, { conds: next });
                    return (
                      <div key={ci} className="rb-cond">
                        <div className="rb-cond-head">
                          <button className={`chip neg ${node.negate ? 'on' : ''}`} aria-pressed={!!node.negate}
                            title={node.negate ? 'Inverted — click to un-invert' : 'Invert this clause'}
                            onClick={() => setConds(r.conds.map((x, k) => (k === ci ? { ...x, negate: !x.negate } : x)))}>not</button>
                          <select value={node.condId} onChange={(e) => {
                            const next = findCondition(e.target.value);
                            setConds(r.conds.map((x, k) => (k === ci ? { ...x, condId: next.id, params: defaultsFor(next.params) } : x)));
                          }}>
                            {CONDITIONS.filter((c) => showAdvanced || !c.advanced || c.id === node.condId).map((c) => (
                              <option key={c.id} value={c.id}>{c.label}</option>
                            ))}
                          </select>
                          {r.conds.length > 1 && (
                            <button className="icon-btn danger" title="Remove this clause"
                              onClick={() => setConds(r.conds.filter((_, k) => k !== ci))}>✕</button>
                          )}
                        </div>
                        <Params specs={spec.params} values={node.params}
                          onChange={(k, v) => setConds(r.conds.map((x, j) => (j === ci ? { ...x, params: { ...x.params, [k]: v } } : x)))} />
                        {spec.hint && <p className="rb-hint">{spec.hint}</p>}
                      </div>
                    );
                  })}
                  <button className="chip" onClick={() => {
                    const first = CONDITIONS[1];
                    update(r.id, { conds: [...r.conds, { condId: first.id, params: defaultsFor(first.params) }] });
                  }}>+ And only if…</button>
                  <label className="field"><span>Note for players (optional)</span>
                    <input value={r.note ?? ''} placeholder="Why this is forbidden"
                      onChange={(e) => update(r.id, { note: e.target.value })} /></label>
                  <div className="rb-readback">
                    <span className="rb-readback-label">In plain English</span>
                    <p>You may not play a card when {explainPredicate(compileRestriction(r).if)}.</p>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {restrictions.length > 0 && (
        <button className="ghost sm" onClick={() => {
          const d = newRestrictionDraft(restrictions.length + 1);
          onChange([...restrictions, d]); setOpenId(d.id);
        }}>+ Forbid another play</button>
      )}
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
        if (p.kind === 'card') {
          // Two dropdowns rather than 52 buttons: the parameter is one card, and a rule reads
          // as a sentence, so "Q" then "♠" sits in the line rather than opening a grid over it.
          const key = String(v);
          const suit = key.slice(0, 1);
          const rank = key.slice(1) || 'Q';
          return (
            <div key={p.key} className="field cardparam"><span>{p.label}</span>
              <div className="cardparam-row">
                <select value={rank} onChange={(e) => onChange(p.key, `${suit}${e.target.value}`)}>
                  {['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <select value={suit} onChange={(e) => onChange(p.key, `${e.target.value}${rank}`)}>
                  <option value="S">♠ spades</option>
                  <option value="H">♥ hearts</option>
                  <option value="D">♦ diamonds</option>
                  <option value="C">♣ clubs</option>
                </select>
              </div>
            </div>
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
