// Bot-simulator: plays many bot-vs-bot games to confirm a definition terminates,
// is winnable, and isn't wildly unbalanced. Also the pre-publish playtest gate.

import { GameDefinition } from './types';
import { createMatch, applyMove, isTerminal, isMatchOver, nextHand, legalMoves } from './engine';
import { chooseMove } from '../bots/randomBot';

export interface SimReport {
  games: number;
  terminated: number;      // games that ended within the move cap
  winnable: boolean;       // at least one clean win occurred
  avgMoves: number;
  winRateBySeat: number[]; // fraction of wins per seat index
  maxMovesHit: number;     // games that hit the safety cap (a red flag)
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
    let handSeed = (baseSeed + g * 7919) >>> 0;
    let state = createMatch(def, seats, handSeed);
    let botSeed = (baseSeed + g * 104729) >>> 0;
    let moves = 0;

    // Plays every hand of a match (a match is one hand unless the definition sets a points
    // target, in which case hands repeat — with a running score — until someone crosses it).
    while (moves < moveCap) {
      while (!isTerminal(state) && moves < moveCap) {
        const current = state.pendingChoice
          ? state.pendingChoice.player
          : state.players[state.turnIndex];
        if (legalMoves(state, current).length === 0) break;
        const r = chooseMove(state, current, botSeed);
        botSeed = r.botSeed;
        state = applyMove(state, current, r.move);
        moves++;
      }
      if (!isTerminal(state) || isMatchOver(state)) break;
      handSeed = (Math.imul(handSeed, 48271) + 12345) >>> 0;
      state = nextHand(state, handSeed);
    }

    totalMoves += moves;
    if (isMatchOver(state)) {
      terminated++;
      const winner = state.matchWinner ?? state.winner;
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
