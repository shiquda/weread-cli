# WeRead Domain Rules

Use this reference for field meanings and user-facing interpretation. It intentionally avoids low-level request mechanics because the `weread` CLI handles those.

## Shelf Rules

Use `weread --json shelf list`.

Visible shelf total:

```text
books.length + albums.length + (mp ? 1 : 0)
```

Important distinctions:

- `books[]` contains electronic/imported/book-like entries.
- `albums[]` contains audiobooks or audio albums. They count as shelf items.
- `mp` is the article-collection entry. If present, it counts as one visible shelf item.
- Do not use `bookCount` as the total shelf count unless the user specifically asks for electronic books only.

Public/private counts:

- Private = `books[].secret == 1` + `albums[].albumInfoExtra.secret == 1` + `(mp ? 1 : 0)`
- Public = `books[].secret == 0` + `albums[].albumInfoExtra.secret == 0`
- Count only returned visible entries.

## Reading Progress

Use `weread --json book progress <bookId>`.

- `progress` is an integer percentage from `0` to `100`.
- `1` means `1%`, not complete.
- Only `100` means finished.
- Reading time fields are seconds.

## Reading Statistics

Use `weread --json readdata detail`.

Modes:

- `weekly`: natural week
- `monthly`: natural month
- `annually`: natural year
- `overall`: all history

Time fields are seconds, including:

- `totalReadTime`
- `dayAverageReadTime`
- `readLongest[].readTime`
- `dailyReadTimes` values

Interpretation:

- Prefer `totalReadTime` for totals.
- `readTimes` is for bucketed detail, not the primary total.
- `dayAverageReadTime` is averaged over natural days, not only reading days.
- For "reading-day average", calculate `totalReadTime / readDays` and say that this is derived.

Historical and cross-period ranges:

- The API is based on fixed periods, not arbitrary start/end dates.
- For a whole year, use `--mode annually` with a timestamp inside that year.
- For cross-year requests, query each natural year and sum `totalReadTime`.
- For partial boundary periods, use `dailyReadTimes` when available. If it is not available, use month/year approximation and state the approximation.

## Notes, Highlights, And Bookmarks

Notebook overview:

```bash
weread --json notes notebooks --count 100
```

Single-book exportable content usually needs:

```bash
weread --json notes bookmarks <bookId>
weread --json notes mine <bookId>
```

Counting rules:

- Notebook total notes = `reviewCount + noteCount + bookmarkCount`.
- `noteCount` means highlight count, not total notes.
- `reviewCount` includes personal ideas/reviews and should not be added again under another label.

Export rules:

- Exportable content = highlight text + personal ideas/reviews.
- Bookmark positions are counted by `bookmarkCount`, but bookmark content is not exportable through the current CLI commands.
- If the user explicitly asks for bookmark content, explain that only the count is available.

Popular highlights:

- `weread --json notes underlines <bookId> <chapterUid>` returns heat/statistics and ranges, not highlight text.
- `weread --json notes best <bookId>` returns popular highlight text and counts.
- `weread --json notes readreviews <bookId> <chapterUid> --reviews-json '[...]'` returns ideas/comments under specific highlight ranges.

## Reviews

Personal notes and public reviews are different:

- Personal content: `weread --json notes mine <bookId>`
- Public book reviews: `weread --json reviews list <bookId>`

Public review filter values:

- `--type 0`: all
- `--type 1`: recommended
- `--type 2`: negative
- `--type 3`: recent
- `--type 4`: normal

For user-facing display, convert review star values when present:

- `100`: five stars
- `80`: four stars
- `60`: three stars
- `40`: two stars
- `20`: one star

## Search Scope Rules

Use these scopes:

- `book`: electronic books
- `all`: mixed search when the user only says "搜一下"
- `fiction`: web fiction
- `audio`: audiobooks, podcasts, albums
- `author`: authors
- `fulltext`: full-text search inside books
- `list`: book lists
- `mp`: official accounts
- `article`: articles

When resolving a title to a `bookId`, use `--scope book` unless the user clearly asks for a different type.

## Deep Links

Add deep links when useful and when the required fields are available.

Book:

```text
weread://reading?bId={bookId}
```

Chapter:

```text
weread://reading?bId={bookId}&chapterUid={chapterUid}
```

Highlight or idea position:

```text
weread://bestbookmark?bookId={bookId}&chapterUid={chapterUid}&rangeStart={rangeStart}&rangeEnd={rangeEnd}&userVid={userVid}
```

Range parsing:

- `range` is usually shaped like `900-2004`.
- `rangeStart` is the number before `-`.
- `rangeEnd` is the number after `-`.
- `userVid` may be omitted if unavailable.

Only generate a highlight-position link when `bookId`, `chapterUid`, and `range` are available.
