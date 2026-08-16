import { GameDefinition } from '../engine/types';
import { crazyEights } from './crazyEights';
import { switchGame } from './switch';
import { spadesLite } from './spades';
import { president } from './president';
import { goFish } from './goFish';
import { rummy } from './rummy';
import { war } from './war';
import { tradeWinds } from './tradeWinds';
import { undertow } from './undertow';
import { hearts } from './hearts';
import { euchre } from './euchre';
import { ginRummy } from './ginRummy';
import { klondike } from './klondike';
import { freecell } from './freecell';
import { spider } from './spider';

// The classics library. Each entry is a hand-authored game, expressed purely as data.
export const catalog: GameDefinition[] = [crazyEights, switchGame, spadesLite, hearts, euchre, president, goFish, rummy, ginRummy, war, tradeWinds, undertow, klondike, freecell, spider];

export function getGame(id: string): GameDefinition | undefined {
  return catalog.find((g) => g.meta.id === id);
}
