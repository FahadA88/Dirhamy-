import { GameDefinition } from '../engine/types';
import { crazyEights } from './crazyEights';
import { switchGame } from './switch';
import { spadesLite } from './spades';
import { president } from './president';
import { goFish } from './goFish';
import { rummy } from './rummy';
import { war } from './war';

// The classics library. Each entry is a hand-authored game, expressed purely as data.
export const catalog: GameDefinition[] = [crazyEights, switchGame, spadesLite, president, goFish, rummy, war];

export function getGame(id: string): GameDefinition | undefined {
  return catalog.find((g) => g.meta.id === id);
}
