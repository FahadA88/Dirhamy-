import { ComponentType } from 'react';
import { HomeLayout } from '../../settings/settings';
import { HomeLayoutProps } from './types';
import { KanbanLayout } from './Kanban';
import { FeedLayout } from './Feed';
import { RadialLayout } from './Radial';
import { PagerLayout } from './Pager';
import { CommandPaletteLayout } from './CommandPalette';
import { MagazineLayout } from './Magazine';
import { BentoLayout } from './Bento';
import { DualPaneLayout } from './DualPane';
import { IconRailLayout } from './IconRail';
import { DrawerLayout } from './Drawer';
import { MegaHeaderLayout } from './MegaHeader';
import { CanvasLayout } from './Canvas';
import { TerminalLayout } from './Terminal';
import { DocTreeLayout } from './DocTree';
import { WidgetsLayout } from './Widgets';
import { LedgerLayout } from './Ledger';

/** Every alternate home layout, keyed the same way `HOME_LAYOUTS` names them in Settings. The
 *  shipped grid isn't here — `BrowseView` renders that one itself, same as it always has. */
export const HOME_LAYOUTS_BY_ID: Record<Exclude<HomeLayout, 'grid'>, ComponentType<HomeLayoutProps>> = {
  kanban: KanbanLayout,
  feed: FeedLayout,
  radial: RadialLayout,
  pager: PagerLayout,
  command: CommandPaletteLayout,
  magazine: MagazineLayout,
  bento: BentoLayout,
  dual: DualPaneLayout,
  iconrail: IconRailLayout,
  drawer: DrawerLayout,
  megaheader: MegaHeaderLayout,
  canvas: CanvasLayout,
  terminal: TerminalLayout,
  doctree: DocTreeLayout,
  widgets: WidgetsLayout,
  ledger: LedgerLayout,
};
