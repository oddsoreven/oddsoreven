# Odds or Even - the record

Our EuroLeague lines, published before each game and never changed afterwards.

* `data/euroleague/<season>/R<round>/calls/<time>.json` - one file per publish, holding only the games it added.
  A file is never edited once it is here.
* `<file>.ots` - an OpenTimestamps proof that the file existed at that time (anchored in Bitcoin a few hours
  after publishing; check it at https://opentimestamps.org or with `ots verify`).
* `data/ledger.csv` - every published file with its SHA-256 fingerprint. The same fingerprint is posted on X
  (@OddsorEven) when the file goes out.
* `round.json` - all the round's published games together, for the site.

From round 6 each game goes out either as a PICK or as "We value this at ..." (our line, no pick).
A pick is the side our number favours by 2 points or more against Pinnacle's line, at Pinnacle's line,
with the close we expect (at least 1/2 point in our favour, 1 point when the gap is 6 or more).
Lines: handicap from the home side (home favourite minus), money line. Odds are fair (no margin);
on a whole-number line a push is void. Next to each game: Pinnacle's line when we priced it, the market when
we published (Pinnacle, or the consensus of the European books, from The Odds API), and the team news the
line was made with.

For information and entertainment, 18+.
