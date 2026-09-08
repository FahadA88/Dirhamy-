import { ShelfCard } from '../browseCommon';
import { PullToRefresh } from '../PullToRefresh';
import { HomeLayoutProps } from './types';
import { useKindGroups } from './shared';

/** One column per kind of game, each game a card in its column — the shelf, turned on its side
 *  and sorted the way `KindTabs` already sorts it, rather than by curated collection. */
export function KanbanLayout({ games, onOpen, onPlay, onChanged }: HomeLayoutProps) {
  const columns = useKindGroups(games);
  return (
    <PullToRefresh onRefresh={onChanged}>
    <div className="hl-kanban">
      {columns.map((col) => (
        <section className="hl-kanban-col" key={col.id} aria-label={col.label}>
          <header className="hl-kanban-head">
            <span aria-hidden="true">{col.mark}</span>
            <h3>{col.label}</h3>
            <span className="hl-kanban-count">{col.games.length}</span>
          </header>
          <div className="hl-kanban-cards">
            {col.games.map((g) => (
              <ShelfCard key={g.id} game={g} onOpen={() => onOpen(g.id)} onPlay={() => onPlay(g)} onChanged={onChanged} />
            ))}
          </div>
        </section>
      ))}
    </div>
    </PullToRefresh>
  );
}
