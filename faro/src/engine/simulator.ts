// Bot-simulator: plays many bot-vs-bot games to confirm a definition terminates,
// is winnable, and isn't wildly unbalanced. Also the pre-publish playtest gate.

import { GameDefinition, MatchState } from './types';
import { createMatch, applyMove, isTerminal, isMatchOver, nextHand, legalMoves, actingPlayers } from './engine';
import { chooseMove } from '../bots/randomBot';

export interface SimReport {
  games: number;
  terminated: number;      // games that ended within the move cap
  winnable: boolean;       // at least one clean win occurred
  avgMoves: number;
  winRateBySeat: number[]; // fraction of wins per seat index
  maxMovesHit: number;     // games that hit the safety cap (a red flag)
}

/**
 * Plays one whole match — every hand of it, points target and all — with every seat driven by
 * the bot, start to finish. What simulate() below runs many of to measure a definition; also
 * what a tournament table (item 38) runs to resolve any bracket match the human isn't sitting
 * at, since there is no reason to make a person wait through a game they aren't playing.
 */
export function playOneMatch(
  def: GameDefinition,
  seats: string[],
  handSeed: number,
  botSeed: number,
  moveCap = 4000,
): { winner: string | null; state: MatchState; moves: number; over: boolean } {
  let state = createMatch(def, seats, handSeed);
  let moves = 0;

  while (moves < moveCap) {
    while (!isTerminal(state) && moves < moveCap) {
      // Usually one actor (whoever's turn it is); a simultaneous pass can have several —
      // drive every one of them before checking again.
      const actors = actingPlayers(state);
      if (actors.length === 0) break;
      let progressed = false;
      for (const actor of actors) {
        if (isTerminal(state) || moves >= moveCap) break;
        if (!actingPlayers(state).includes(actor)) continue; // already resolved this pass
        const lm = legalMoves(state, actor);
        if (lm.length === 0) continue;
        const r = chooseMove(state, actor, botSeed);
        botSeed = r.botSeed;
        state = applyMove(state, actor, r.move);
        moves++;
        progressed = true;
      }
      if (!progressed) break;
    }
    if (!isTerminal(state) || isMatchOver(state)) break;
    handSeed = (Math.imul(handSeed, 48271) + 12345) >>> 0;
    state = nextHand(state, handSeed);
  }

  return { winner: isMatchOver(state) ? (state.matchWinner ?? state.winner) : null, state, moves, over: isMatchOver(state) };
}

export function simulate(
  def: GameDefinition,
  players = 4,
  games = 500,
  moveCap = 4000, // match play can span many hands, so this needs headroom beyond a single hand
  baseSeed = 1,
): SimReport {
  const seats = Array.from({ length: players }, (_, i) => `P${i + 1}`);
  const winsBySeat = new Array(players).fill(0);
  let terminated = 0;
  let totalMoves = 0;
  let maxMovesHit = 0;
  let anyWin = false;

  for (let g = 0; g < games; g++) {
    const handSeed = (baseSeed + g * 7919) >>> 0;
    const botSeed = (baseSeed + g * 104729) >>> 0;
    const { winner, moves, over } = playOneMatch(def, seats, handSeed, botSeed, moveCap);

    totalMoves += moves;
    if (over) {
      terminated++;
      if (winner) {
        anyWin = true;
        const seat = seats.indexOf(winner);
        if (seat >= 0) winsBySeat[seat]++;
      }
    }
    if (moves >= moveCap) maxMovesHit++;
  }

  return {
    games,
    terminated,
    winnable: anyWin,
    avgMoves: totalMoves / games,
    winRateBySeat: winsBySeat.map((w) => +(w / games).toFixed(3)),
    maxMovesHit,
  };
}
