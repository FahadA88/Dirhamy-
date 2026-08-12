// Bot-simulator: plays many bot-vs-bot games to confirm a definition terminates,
// is winnable, and isn't wildly unbalanced. Also the pre-publish playtest gate.

import { GameDefinition } from './types';
import { createMatch, applyMove, isTerminal, legalMoves } from './engine';
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
  moveCap = 2000,
  baseSeed = 1,
): SimReport {
  const seats = Array.from({ length: players }, (_, i) => `P${i + 1}`);
  const winsBySeat = new Array(players).fill(0);
  let terminated = 0;
  let totalMoves = 0;
  let maxMovesHit = 0;
  let anyWin = false;

  for (let g = 0; g < games; g++) {
    let state = createMatch(def, seats, baseSeed + g * 7919);
    let botSeed = (baseSeed + g * 104729) >>> 0;
    let moves = 0;

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

    totalMoves += moves;
    if (isTerminal(state)) {
      terminated++;
      if (state.winner) {
        anyWin = true;
        const seat = seats.indexOf(state.winner);
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
