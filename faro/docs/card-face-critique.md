# Card faces: critique against reference decks

Written from rendered output (13x4 sheet plus jokers at 240px, 76px and 44px), not from
reading the source. References: Bicycle rider-back (US Playing Card, standard pip layout),
Piatnik's Wiener Muster courts, Waddingtons No.1 courts and index sizing.

## Corrections to the earlier audit

Three claims in the phase 0 audit were wrong, and are withdrawn:

- **"Lower pips are not rotated."** They are. `Card.tsx` rotates any pip below the halfway
  line by 180 degrees, which is what a printed deck does.
- **"The 4 has a faulty empty centre."** A real 4 has an empty centre. The whole `PIPS` table
  matches standard deck layouts for 2 through 10, including the 9 and 10 legitimately using a
  four-row side grid where 2 through 8 use three rows.
- **"The jack is a face over concentric circles."** It is a mirrored half-figure with a robe,
  a gold-trimmed lining, a chest suit, a head, an angled cap with a feather, and a halberd.

The faults below replace them.

## Courts (the serious ones)

1. **The two mirrored halves fuse into one mass.** Each half is drawn to y=70..75 and rotated
   about (50,75), so the robes meet edge to edge. The result is a single dark oval spanning
   the middle third of the card with no visible seam. The gold double rule that is supposed to
   be what makes it read as a court card is drawn *inside* that mass and disappears.
2. **The lining reads as a bow tie.** `M50 45l-13 7 13 23 13-23z` is a large stock-coloured
   kite on the chest. Mirrored, the two kites form an hourglass that is the single most
   prominent shape on the card - a costume detail out-competing the figure.
3. **The gold shoulder arcs close into a halo.** `M23 75c1-11 8-17 19-20` mirrored draws a
   complete gold ellipse around the blob. Reads as an unintentional ring.
4. **The head is a snowman.** A plain circle, two dots and a straight bar. No jaw, no neck, no
   hair line, no shoulders meeting it - and its stock fill against the dark robe makes it read
   as a ball on a stick.
5. **Props float.** The sceptre, flower and halberd sit beside the figure with no arm and no
   hand. A gold stick next to a robe reads as a rendering error.
6. **J, Q and K are the same card.** Identical robe, lining, head and chest pip; they differ
   only in headgear and prop, both of which are small and at the extremes of the panel. At
   76px they are indistinguishable; at 44px all three are a black smear.
7. **The chest suit is buried.** `scale(.14)` at (43,57) puts it partly behind the lining kite.
   It is the one mark that says which suit the card is, and it is the least visible thing on it.
8. **Seven stroke weights** (2.4, 1.8, 1.4, 1.3, 1.2, 1, 0.9, 0.8, 0.7) with no shared scale,
   so the drawing loses its parts in a ragged order as it scales down.
9. **The court panel border is invisible** - `currentColor 22%` under a figure that fills it.

## Numbers

10. **The pip columns sit too far inboard.** Field is `inset: 11% 9%` and the columns are at
    28/72 of the field, which lands them at 32% and 68% of the card. Reference decks put them
    near 25% and 75%. The result is a wide empty gutter down the middle of every even rank and
    a fat unused margin outside the columns.
11. **The bottom-right index crowds the bottom-right pip** on 4, 5, 6, 7, 8, 9 and 10 - they
    touch at 76px.
12. **Pips are undersized** for the field they sit in: `--ch * 0.12`, against a reference pip
    closer to a fifth of the card width.
13. **The `10` index is squeezed.** `letter-spacing: -0.045em` on two digits at
    `--ch * 0.108` collapses them into a single mark; the 10 is the one rank you cannot read
    at 44px.
14. **The index is small.** 10.8% of card height against ~14-16% on a reference deck, and the
    gap between rank and suit is loose enough that they do not read as one unit.

## Aces

15. **The ring is a UI button.** A single hairline circle plus a soft outer shadow, identical
    for all four suits, and its stock-relative contrast differs sharply between the red suits
    (near-invisible pink) and the black ones (grey with a visible shadow).

## Joker

16. Same fusion problem as the courts, worse - the two collars interpenetrate into a scribble.
17. The corner shows a star as the rank and the same star again as the suit beneath it.

## What changed

Measured with a throwaway Playwright probe that walks every rendered `<path>`, `<circle>` and
`<rect>` on all 53 cards and reports real ink overlap rather than layout boxes (an SVG suit
fills only the middle ~80% of its viewBox, so boxes touch long before the marks do).

| | before | after | reference |
|---|---|---|---|
| pip ink, horizontal | 25.4% – 74.5% | 21.3% – 78.7% | ~18% – 82% |
| pip ink, vertical | 17% – 83% | 15.1% – 84.8% | ~14% – 86% |
| corner index height | 18.5% of card | 20% of card | ~21% |
| index / outer-pip gutter | −0.9% (overlapping) | +1.7% | ~2.2% |
| ink collisions, 17 faces x 4 sizes | — | 0 | 0 |

Courts and the joker: halves stop at y=70 instead of y=75 so the gold double rule sits in clean
stock; the lining kite and the mirrored halo are gone; the head has a jaw, a neck and a mouth;
the props are held in a hand on an arm; the three ranks differ down the middle of the figure
rather than only at the extremes; nine stroke weights became three.

Numbers: the pip table keeps its layout (it was right) and moves out to the reference columns.
The ten's index is condensed rather than tracked into one mark. The joker's corner no longer
prints a star as the rank and the same star again as the suit.

Aces: a double rule at one strength for all four suits, in place of a single hairline under a
drop shadow that read as a UI button and came out grey on the blacks and near-invisible pink on
the reds.

## Faults found in the other sixteen faces while checking them

These were not in the original critique — they only showed up once every face was rendered and
measured. All are fixed.

- **Eight faces had stopped working.** They were written against the old markup, where the
  corner index was a bare rank with a `<span>` for the suit and the rank took its size by
  inheritance. The index is now a `<b class="ix-rank">` over an `<svg class="ix-suit">`, both
  carrying their own size, so every `.f-x .corner { font-size }` and every `.f-x .corner span`
  reached nothing. Big Index, Typographic, Chunky, High Contrast, Monospaced, Deco, Hand Drawn
  and Minimal Line were the classic face wearing a different background.
- **`display: none` losing on specificity.** `.card.face .pip` and `.card.face .court-art` set
  `display: grid` at higher specificity than `.f-typographic .pip { display: none }`, so the
  Typographic, Duplex and High Contrast faces kept drawing the ace ornament and the court
  figures underneath the design that was supposed to have cleared them.
- **The hand-drawn face printed the bottom half of every number card the right way up.** Its
  `transform: ... rotate(4deg) !important` replaced the whole transform, throwing away the
  half-turn each pip below the midline carries. The tilt adds to the flip now.
- **A four read as a one** on the Deco and Hand Drawn faces. Both set the rank in the Didone,
  whose four is a hairline diagonal and a hairline crossbar over one thick stem — at index size
  the hairlines vanish and only the stem survives. That is a wrong card, not an ugly one.
- **`--serif` was defined twice at `:root`**, the first with a comment saying the serif was
  gone. The second won, so the comment described the opposite of what shipped.
- **The suit letter did not scale.** `font-size: 0.62em` resolved against the page root, so the
  letter stayed about ten pixels whatever the card was — a third of the index height on a hand
  card, which pushed the Suit Letters corner into the pip field.
- **Thumbnails got table-sized indices.** The mini-card, the settings swatches and the live
  preview override `width`/`height` but left `--cw`/`--ch` at the table's values, and every part
  of the index derives from those. They set the variables now.
- **The seventeen face swatches in Settings were seventeen copies of the same card.** They were
  hand-written imitation markup — `<span class="corner tl">A<span>♥</span></span>` — frozen at
  the shape the index had years ago. They render a real `<CardFace>` now, through a new
  `faceOverride` prop, so a swatch cannot drift from the thing it is advertising. The card is
  the ace of diamonds rather than hearts, because on a heart the Classic and Four Colours
  swatches are identical.
