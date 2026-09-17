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
