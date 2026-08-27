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
import { whist } from './whist';
import { briscola } from './briscola';
import { napoleon } from './napoleon';
import { sixtySix } from './sixtySix';
import { snap } from './snap';
import { palace } from './palace';
import { scorpion } from './scorpion';
import { fortyThieves } from './fortyThieves';
import { triPeaks } from './triPeaks';
import { threeThirteen } from './threeThirteen';
import { handAndFoot } from './handAndFoot';
import { dutch } from './dutch';
import { oldMaid } from './oldMaid';
import { kingsCorner } from './kingsCorner';
import { spiderOneSuit } from './spiderOneSuit';
import { spiderTwoSuits } from './spiderTwoSuits';
import { bluff } from './bluff';
import { slapjack } from './slapjack';
import { showdownPoker } from './showdownPoker';
import { pit } from './pit';
import { contractWhist } from './contract';
import { trio } from './trio';
import { kent } from './kent';
import { fiveHundred } from './fiveHundred';
import { ohHell } from './ohHell';
import { blackMaria } from './blackMaria';
import { bigTwo } from './bigTwo';
import { ratscrew } from './ratscrew';
import { canasta } from './canasta';
import { yukon } from './yukon';
import { golf } from './golf';
import { bridge } from './bridge';
import { continental } from './continental';
import { canfield } from './canfield';
import { pinochle } from './pinochle';
import { skat } from './skat';

// The classics library. Each entry is a hand-authored game, expressed purely as data.
export const catalog: GameDefinition[] = [
  crazyEights, switchGame, spadesLite, hearts, euchre, president, goFish, rummy, ginRummy, war,
  tradeWinds, undertow, klondike, freecell, spider, spiderOneSuit, spiderTwoSuits,
  scorpion, fortyThieves, triPeaks,
  whist, briscola, napoleon, sixtySix, snap, palace, threeThirteen, handAndFoot,
  kingsCorner, dutch, oldMaid, bluff, slapjack, showdownPoker, pit,
  contractWhist, trio, kent,
  // Added once the engine could express them: a joker that wins tricks (Five Hundred), a deal
  // that changes with the table (Oh Hell), individually priced cards (Black Maria), wild melds
  // (Canasta), and three more boards from the same patience config.
  fiveHundred, ohHell, blackMaria, bigTwo, ratscrew, canasta, yukon, golf,
  // Bridge and Continental Rummy the engine could already express; Canfield needed two new
  // patience rules — foundations that build from a dealt rank, and a reserve.
  bridge, continental, canfield,
  // Pinochle needed melds inside a trick game — two families' worth of scoring on one hand,
  // which nothing here could express before.
  pinochle,
  // Skat needed all four jacks promoted out of their suits into trump, a declarer playing alone
  // against the rest, and a contract settled on card points rather than tricks.
  skat,
];

export function getGame(id: string): GameDefinition | undefined {
  return catalog.find((g) => g.meta.id === id);
}
