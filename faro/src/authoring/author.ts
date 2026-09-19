// AI writes the whole game.
//
// Not a co-pilot suggesting knob patches — you describe a game in English and this returns a
// finished, playable GameDefinition. The difference that matters is what happens after the
// model answers: nothing is trusted. The output is parsed strictly, compiled through the same
// buildDefinition() the visual editor uses, checked by the validator, and then *played* a
// hundred times by the bot simulator. If any of that fails the errors go back to the model and
// it tries again.
//
// So the model is not the referee and never becomes one. It proposes; the engine decides. A
// game that reaches you has been played through to a finish before you ever see it.

import { GameDefinition } from '../engine/types';
import { validate } from '../engine/validator';
import { simulate, SimReport } from '../engine/simulator';
import { Knobs, defaultKnobs, buildDefinition } from './knobs';
import { RuleDraft, CONDITIONS, EFFECTS, HOOKS } from './ruleKit';
import { authorSpec } from './spec';

export interface AuthorProvider {
  /** A name for the log, e.g. "claude" or "none". */
  name: string;
  /** Returns the model's raw text. Throws if it cannot reach a model. */
  complete(req: { system: string; user: string }): Promise<string>;
}

export interface AuthorStep {
  attempt: number;
  stage: 'asking' | 'parsing' | 'checking' | 'playtesting' | 'repairing' | 'done' | 'failed';
  detail: string;
}

export interface AuthorResult {
  ok: boolean;
  definition?: GameDefinition;
  knobs?: Knobs;
  rules?: RuleDraft[];
  report?: SimReport;
  /** What the model said it could not express. Shown to the user verbatim. */
  notes: string[];
  /** Every stage of every attempt, for the progress display and for debugging. */
  steps: AuthorStep[];
  error?: string;
}

const MAX_ATTEMPTS = 3;
const CONDITION_IDS = new Set(CONDITIONS.map((c) => c.id));
const EFFECT_IDS = new Set(EFFECTS.map((e) => e.id));
const HOOK_IDS = new Set(HOOKS.map((h) => h.value as string));
const KNOB_KEYS = new Set(Object.keys(defaultKnobs));

interface Authored {
  name: string;
  description: string;
  knobs: Partial<Knobs>;
  rules: RuleDraft[];
  notes: string[];
}

/**
 * Pull the JSON out of whatever came back. Models fence code and add a sentence in front of it
 * however firmly you ask them not to, and failing the whole run over a stray "Here you go:" is
 * a bad trade for four lines of tolerance.
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in the reply');
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Strict shape check. Anything the model made up is dropped and reported rather than passed
 * along — an unknown effect id would compile to nothing and silently lose a rule.
 */
export function parseAuthored(raw: unknown): { authored: Authored; problems: string[] } {
  const problems: string[] = [];
  const o = (raw ?? {}) as Record<string, unknown>;

  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'Untitled game';
  const description = typeof o.description === 'string' ? o.description.trim() : '';
  const notes = Array.isArray(o.notes) ? o.notes.filter((n): n is string => typeof n === 'string') : [];

  const knobs: Partial<Knobs> = {};
  const rawKnobs = (o.knobs ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(rawKnobs)) {
    if (!KNOB_KEYS.has(k)) { problems.push(`"${k}" is not a knob. Remove it.`); continue; }
    (knobs as Record<string, unknown>)[k] = v;
  }
  if (typeof o.family === 'string') knobs.family = o.family as Knobs['family'];
  if (!knobs.family) problems.push('No family chosen. Set knobs.family to one of the seven.');

  const rules: RuleDraft[] = [];
  const rawRules = Array.isArray(o.rules) ? o.rules : [];
  rawRules.forEach((r, i) => {
    const d = (r ?? {}) as Record<string, unknown>;
    const label = typeof d.name === 'string' ? d.name : `rule ${i + 1}`;
    if (typeof d.condId !== 'string' || !CONDITION_IDS.has(d.condId)) {
      problems.push(`Rule "${label}": condId ${JSON.stringify(d.condId)} does not exist.`);
      return;
    }
    if (typeof d.when !== 'string' || !HOOK_IDS.has(d.when)) {
      problems.push(`Rule "${label}": when ${JSON.stringify(d.when)} is not a hook.`);
      return;
    }
    const effects = (Array.isArray(d.effects) ? d.effects : [])
      .map((e) => (e ?? {}) as Record<string, unknown>)
      .filter((e) => {
        if (typeof e.specId === 'string' && EFFECT_IDS.has(e.specId)) return true;
        problems.push(`Rule "${label}": effect ${JSON.stringify(e.specId)} does not exist.`);
        return false;
      })
      .map((e) => ({ specId: String(e.specId), params: (e.params ?? {}) as Record<string, string | number> }));
    if (effects.length === 0) {
      problems.push(`Rule "${label}": no usable effects, so it would do nothing.`);
      return;
    }
    rules.push({
      id: typeof d.id === 'string' && d.id ? d.id : `rule${i + 1}`,
      name: label,
      when: d.when as RuleDraft['when'],
      condId: d.condId,
      condParams: (d.condParams ?? {}) as Record<string, string | number>,
      effects,
      enabled: true,
      note: typeof d.note === 'string' ? d.note : undefined,
    });
  });

  return { authored: { name, description, knobs, rules, notes }, problems };
}

/** Knobs + rules → the thing the engine actually runs. */
export function compose(a: Authored): { knobs: Knobs; def: GameDefinition } {
  const knobs: Knobs = {
    ...defaultKnobs,
    ...a.knobs,
    name: a.name,
    description: a.description || a.name,
    customRules: a.rules,
  };
  return { knobs, def: buildDefinition(knobs, `ai-${Date.now().toString(36)}`) };
}

/** Everything wrong with a candidate, in the words the model needs to hear to fix it. */
function faults(def: GameDefinition, players: number): { list: string[]; report: SimReport } {
  const list: string[] = [];
  const v = validate(def);
  for (const issue of v.issues) {
    if (issue.level === 'error') list.push(`Validator: ${issue.message}`);
  }
  // A definition that does not validate will not survive a simulation either, and simulating a
  // broken game just produces noise on top of the real error.
  const report = list.length > 0
    ? { games: 0, terminated: 0, winnable: false, avgMoves: 0, winRateBySeat: [], maxMovesHit: 0 }
    : simulate(def, players, 120);
  if (list.length === 0) {
    if (report.terminated < report.games) {
      list.push(`Playtest: ${report.games - report.terminated} of ${report.games} games never ended. `
        + 'Something lets play continue forever — make sure hands shrink, or add a rule that forces an end.');
    }
    if (!report.winnable) {
      list.push('Playtest: nobody ever won. Check the win condition is reachable.');
    }
  }
  return { list, report };
}

/** How many seats to try it at. */
function seatsFor(k: Knobs): number {
  if (k.family === 'solitaire') return 1;
  return Math.min(Math.max(k.minPlayers ?? 2, 2), Math.max(k.maxPlayers ?? 4, 2), 4);
}

export async function authorGame(
  description: string,
  provider: AuthorProvider,
  onStep?: (s: AuthorStep) => void,
): Promise<AuthorResult> {
  const steps: AuthorStep[] = [];
  const step = (s: AuthorStep) => { steps.push(s); onStep?.(s); };

  const system = authorSpec();
  let user = `Write this game.\n\n${description.trim()}`;
  let lastNotes: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    step({ attempt, stage: 'asking', detail: attempt === 1 ? 'Reading your description' : 'Trying again with the errors' });

    let text: string;
    try {
      text = await provider.complete({ system, user });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      step({ attempt, stage: 'failed', detail: msg });
      return { ok: false, notes: lastNotes, steps, error: msg };
    }

    step({ attempt, stage: 'parsing', detail: 'Reading what it wrote' });
    let authored: Authored;
    let problems: string[];
    try {
      const parsed = parseAuthored(extractJson(text));
      authored = parsed.authored;
      problems = parsed.problems;
    } catch (e) {
      problems = [`Your reply was not valid JSON: ${e instanceof Error ? e.message : String(e)}`];
      user = `${user}\n\n${problems[0]}\nReturn only the JSON object.`;
      step({ attempt, stage: 'repairing', detail: 'That was not valid JSON' });
      continue;
    }
    lastNotes = authored.notes;

    if (problems.length === 0) {
      step({ attempt, stage: 'checking', detail: 'Checking it against the rules of the engine' });
      const { knobs, def } = compose(authored);
      step({ attempt, stage: 'playtesting', detail: 'Playing 120 games to see if it works' });
      const { list, report } = faults(def, seatsFor(knobs));
      if (list.length === 0) {
        step({ attempt, stage: 'done', detail: `Playable. ${report.terminated}/${report.games} games finished.` });
        return { ok: true, definition: def, knobs, rules: authored.rules, report, notes: authored.notes, steps };
      }
      problems = list;
    }

    if (attempt === MAX_ATTEMPTS) {
      step({ attempt, stage: 'failed', detail: problems[0] ?? 'Could not make it playable' });
      return { ok: false, notes: lastNotes, steps, error: problems.join('\n') };
    }

    step({ attempt, stage: 'repairing', detail: problems[0] ?? 'Fixing problems' });
    user = `Write this game.\n\n${description.trim()}\n\n`
      + `Your last attempt was rejected:\n${problems.map((p) => `- ${p}`).join('\n')}\n\n`
      + 'Fix those and return the whole JSON object again.';
  }

  return { ok: false, notes: lastNotes, steps, error: 'Could not make it playable' };
}
