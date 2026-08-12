import { GameDefinition } from '../engine/types';
import { crazyEights } from './crazyEights';
import { switchGame } from './switch';

// The classics library. Each entry is a hand-authored game, expressed purely as data.
export const catalog: GameDefinition[] = [crazyEights, switchGame];

export function getGame(id: string): GameDefinition | undefined {
  return catalog.find((g) => g.meta.id === id);
}
