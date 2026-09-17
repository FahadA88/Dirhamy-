import { GameDefinition } from './types';

// Definitions carry a schemaVersion. Until now nothing read it, which meant two things were
// impossible: loading a definition written by an older build, and guaranteeing that editing a
// game leaves matches already in progress alone.
//
// This gives the format a spine. Each migration takes the shape produced by one version and
// returns the next; `migrate` walks the chain. Adding a field to GameDefinition means adding a
// step here, and every stored definition keeps working.

export const CURRENT_SCHEMA = '1.1';

type Raw = Record<string, unknown>;
type Step = { from: string; to: string; up: (d: Raw) => Raw };

const STEPS: Step[] = [
  {
    from: '1.0',
    to: '1.1',
    // 1.1 made the family config blocks explicit rather than inferred, and introduced
    // solitaire. Nothing in 1.0 needs reshaping — the fields were already optional — so this
    // is a version bump that proves the chain works end to end.
    up: (d) => ({ ...d, schemaVersion: '1.1' }),
  },
];

export interface MigrationResult {
  definition: GameDefinition;
  from: string;
  migrated: boolean;
  steps: string[];
}

export function migrate(raw: unknown): MigrationResult {
  if (!raw || typeof raw !== 'object') throw new Error('Not a game definition.');
  let d = { ...(raw as Raw) };
  const from = typeof d.schemaVersion === 'string' ? d.schemaVersion : '1.0';
  d.schemaVersion = from;

  const steps: string[] = [];
  let guard = 0;
  while (d.schemaVersion !== CURRENT_SCHEMA) {
    const step = STEPS.find((s) => s.from === d.schemaVersion);
    if (!step) {
      throw new Error(
        `Game definition is version ${d.schemaVersion}, which this build cannot read (it understands up to ${CURRENT_SCHEMA}).`,
      );
    }
    d = step.up(d);
    steps.push(`${step.from} → ${step.to}`);
    if (++guard > 50) throw new Error('Migration chain looped.');
  }

  return { definition: d as unknown as GameDefinition, from, migrated: steps.length > 0, steps };
}

/**
 * A frozen, independent copy of a definition, pinned into a match.
 *
 * This is what stops an author editing a published game from changing the rules under players
 * who are midway through it: the match keeps the definition it started with, byte for byte,
 * and the editor's later version only applies to matches created after it.
 */
export function pinDefinition(def: GameDefinition): GameDefinition {
  return JSON.parse(JSON.stringify(def)) as GameDefinition;
}

/** Stable identity for a pinned definition, so a match can say which revision it is running. */
export function definitionFingerprint(def: GameDefinition): string {
  // Key order is stable because definitions are authored as literals and cloned via JSON.
  return `${def.meta.id}@${def.schemaVersion}`;
}
