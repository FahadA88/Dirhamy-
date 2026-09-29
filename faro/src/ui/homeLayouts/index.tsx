import { ComponentType, FunctionComponent, lazy } from 'react';
import { HomeLayout } from '../../settings/settings';
import { HomeLayoutProps } from './types';

// Sixteen alternate home screens, all imported eagerly, shipped in the main bundle regardless
// of which (if any) a player ever picks. Settings now offers three of them by default (the rest
// are still real and still load, just behind ?lab=1 — see SettingsPanel.tsx) and almost nobody
// reaches the other thirteen, so almost everybody was downloading component code and CSS logic
// for screens they will never see. Same fix as CreateView: each layout is its own chunk, fetched
// only by the render that actually needs it.
//
// Every layout is a plain function component (never a class), so the loader is typed against
// FunctionComponent specifically rather than the broader ComponentType — lazy()'s own typing
// gets confused inferring through a class/function union it never needs to consider here.
function layout(
  loader: () => Promise<Record<string, FunctionComponent<HomeLayoutProps>>>,
  name: string,
): ComponentType<HomeLayoutProps> {
  return lazy(() => loader().then((m) => ({ default: m[name] })));
}

/** Every alternate home layout, keyed the same way `HOME_LAYOUTS` names them in Settings. The
 *  shipped grid isn't here — `BrowseView` renders that one itself, same as it always has. */
export const HOME_LAYOUTS_BY_ID: Record<Exclude<HomeLayout, 'grid'>, ComponentType<HomeLayoutProps>> = {
  kanban: layout(() => import('./Kanban'), 'KanbanLayout'),
  feed: layout(() => import('./Feed'), 'FeedLayout'),
  radial: layout(() => import('./Radial'), 'RadialLayout'),
  pager: layout(() => import('./Pager'), 'PagerLayout'),
  command: layout(() => import('./CommandPalette'), 'CommandPaletteLayout'),
  magazine: layout(() => import('./Magazine'), 'MagazineLayout'),
  bento: layout(() => import('./Bento'), 'BentoLayout'),
  dual: layout(() => import('./DualPane'), 'DualPaneLayout'),
  iconrail: layout(() => import('./IconRail'), 'IconRailLayout'),
  drawer: layout(() => import('./Drawer'), 'DrawerLayout'),
  megaheader: layout(() => import('./MegaHeader'), 'MegaHeaderLayout'),
  canvas: layout(() => import('./Canvas'), 'CanvasLayout'),
  terminal: layout(() => import('./Terminal'), 'TerminalLayout'),
  doctree: layout(() => import('./DocTree'), 'DocTreeLayout'),
  widgets: layout(() => import('./Widgets'), 'WidgetsLayout'),
  ledger: layout(() => import('./Ledger'), 'LedgerLayout'),
};
