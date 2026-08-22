import { explainGame } from '../authoring/explain';
import { GameDefinition } from '../engine/types';
import { useDismissable } from './useEscape';
import { GameDiagram } from './GameDiagram';

const FAMILY_HOW: Record<string, string[]> = {
  'shedding-matching': [
    'Play a card that matches the top of the discard pile.',
    'If you can’t play, draw.',
    'First to empty their hand wins.',
  ],
  'trick-taking': [
    'Everyone plays one card; that’s a trick.',
    'Follow the suit that was led if you hold it.',
    'Highest card of the led suit takes the trick — unless someone plays trump.',
    'The winner of a trick leads the next one.',
  ],
  climbing: [
    'Beat the group on the pile, or pass.',
    'Once everyone passes, the pile clears and the last player to play leads.',
    'First to empty their hand wins.',
  ],
  fishing: [
    'Ask an opponent for a rank you already hold.',
    'If they have it you take all of it and ask again; if not, draw.',
    'Collect a full book of a rank to score it.',
  ],
  rummy: [
    'Draw from the stock or take the discard.',
    'Sets are three or more of a rank; runs are three or more in sequence in one suit.',
    'Discard to end your turn.',
  ],
  comparison: [
    'Both players flip their top card.',
    'The higher card takes both.',
    'A tie means war — cards face down, then flip again.',
  ],
  bluff: [
    'Play cards face down and say what rank they are.',
    'You do not have to be telling the truth.',
    'Anyone may call it — whoever is wrong takes the whole pile.',
    'First to get rid of every card wins.',
  ],
  reflex: [
    'Cards turn over one at a time onto a shared pile.',
    'When the trigger card appears, slap the pile.',
    'The first hand down takes every card on it.',
    'Run out of cards and you are out — unless you win a slap.',
  ],
  poker: [
    'Blinds are posted, then everyone is dealt a hand.',
    'Check, bet, call, raise or fold.',
    'Everyone still in shows their hand; the best one takes the pot.',
  ],
  pit: [
    'There are no turns — everybody trades at once.',
    'Offer a number of cards of one suit for another suit.',
    'Anyone holding what you asked for can accept.',
    'Corner a whole suit to win.',
  ],
  solitaire: [
    'Build the columns downward and the foundations upward.',
    'Tap a card to pick it up, then tap where it should go.',
    'Double-tap sends a card straight to the foundations.',
    'Undo is unlimited — a blocked deal is not a lost one.',
  ],
};

// The rules used to live only on the library card, which you can't see once you're playing.
export function GameHelp({ def, onClose }: { def: GameDefinition; onClose: () => void }) {
  const ref = useDismissable(true, onClose);
  const steps = FAMILY_HOW[def.meta.family] ?? [];
  // A game built in the builder has no family blurb, and any game may carry author-written
  // rules. explainGame() covers both, so the rules panel is never wrong about a custom game.
  const summary = explainGame(def);
  const cfg = def.solitaire;

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box help-box" ref={ref} role="dialog" aria-modal="true"
        aria-label={`How to play ${def.meta.name}`} onClick={(e) => e.stopPropagation()}>
        <h3>{def.meta.name}</h3>
        <p className="help-desc">{def.meta.description}</p>

        {/* Shown before the prose, because a worked example is the part people actually read. */}
        <GameDiagram def={def} />

        <div className="help-head">In short</div>
        <ul className="help-list">
          {summary.map((line, i) => <li key={i}>{line}</li>)}
        </ul>

        {steps.length > 0 && (
          <>
            <div className="help-head">The shape of a turn</div>
            <ol className="help-steps">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </>
        )}

        <div className="help-head">At a glance</div>
        <dl className="help-facts">
          <div><dt>Family</dt><dd>{def.meta.family}</dd></div>
          <div><dt>Players</dt><dd>{def.meta.players.min === def.meta.players.max
            ? def.meta.players.min : `${def.meta.players.min}–${def.meta.players.max}`}</dd></div>
          {def.trick && <div><dt>Trump</dt><dd>{def.trick.auction ? 'named each hand' : def.trick.trump === 'none' ? 'none' : def.trick.trump}</dd></div>}
          {def.scoring.target != null && <div><dt>Match</dt><dd>race to {def.scoring.target}</dd></div>}
          {cfg && <div><dt>Board</dt><dd>{cfg.columns} columns · {cfg.foundations} foundations{cfg.freeCells ? ` · ${cfg.freeCells} free cells` : ''}</dd></div>}
        </dl>

        <button className="primary" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
