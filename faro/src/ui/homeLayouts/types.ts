import { Collection, PublishedGame } from '../../library/library';

/**
 * What every alternate home layout gets to work with: the whole shelf (already stripped of
 * blocked authors), the same derived collections and featured set the shipped grid uses, and
 * the same two actions every card on that grid already calls — nothing a layout invents its
 * own copy of.
 */
export interface HomeLayoutProps {
  games: PublishedGame[];
  shelves: Collection[];
  spotlight: PublishedGame[];
  onOpen: (id: string) => void;
  onPlay: (g: PublishedGame) => void;
  onChanged: () => void;
}
