---
name: weread
description: "Use this skill whenever the user mentions 微信读书, WeRead, 书架, 读书时间, 读书笔记, 划线, or wants to do anything with their personal reading data. This includes: book search (搜书/找书), shelf inspection, reading progress and time, notes and highlights export, book reviews, reading statistics (weekly/monthly/annual/overall), personalized recommendations, and first-time API key setup. Always use this skill before running any WeRead-related commands — it provides the correct CLI abstractions, domain rules, and error handling patterns."
---

# WeRead

The local `weread` CLI is the only interface you need. It handles authentication, request shape, `skill_version`, JSON parsing, upgrade checks, and normalized errors — writing ad hoc `curl` requests would mean reimplementing all of that and losing the normalized error layer.

Use normal human-readable output for direct answers. Use `--json` only when a script or exact structured extraction needs stable machine-readable output, such as pagination or cross-command field joins.

## First Decision

Before any WeRead work, check auth and CLI health:

```bash
weread doctor
```

If the `weread` command is missing, or if `auth_configured` is false, read `references/first-use.md` and guide the user through setup.

## Command Map

```bash
weread search "三体" --scope book --count 10
weread book info <bookId>
weread book chapters <bookId>
weread book progress <bookId>
weread shelf list
weread readdata detail --mode monthly
weread notes notebooks --count 100
weread notes bookmarks <bookId>
weread notes mine <bookId> --count 20
weread notes underlines <bookId> <chapterUid>
weread notes best <bookId> --chapter-uid <chapterUid>
weread notes readreviews <bookId> <chapterUid> --reviews-json '[{"range":"900-2004","count":20}]'
weread reviews list <bookId> --type 1 --count 20
weread reviews single <reviewId>
weread discover recommend --count 12
weread discover similar <bookId> --count 12
weread api list
```

When a supported API isn't covered by a first-class command, use the raw escape hatch:

```bash
weread api call /store/search --param keyword=三体 --param scope=10
```

## When To Read References

References are loaded on demand to keep startup context lean. Load them only when the task requires it:

- **First-time setup, missing auth, or API Key questions**: read `references/first-use.md`
- **Shelf totals, public/private counts, audiobook or article-collection handling**: read `references/domain-rules.md`
- **Notes, highlights, bookmarks, personal ideas, public reviews, or exports**: read `references/domain-rules.md`
- **Reading statistics, historical periods, cross-year ranges, or time-unit interpretation**: read `references/domain-rules.md`
- **Deep links to books, chapters, highlights, or ideas**: read `references/domain-rules.md`

## Intent Routing

### Search

- Find a book, get a `bookId`, or user says `搜书`/`找书`: `weread search "<keyword>" --scope book`
- Generic `搜一下` or mixed intent: `--scope all`
- Web fiction or `网文`: `--scope fiction`
- Audiobooks, podcasts, `听书`, `有声书`, or `专辑`: `--scope audio`
- Authors: `--scope author`
- Full-text search or `书里提到`: `--scope fulltext`
- Book lists: `--scope list`
- Official accounts: `--scope mp`
- Articles: `--scope article`

### Book Details

If the user gives a title rather than an ID, search first and extract `bookInfo.bookId` from the result:

- Metadata: `book info`
- Chapter UIDs (needed for notes/highlights by chapter): `book chapters`
- Reading progress: `book progress` — `progress` is an integer percent; `1` means 1%, only `100` means finished

### Shelf

Use `weread shelf list`. For simple totals, compute the visible books, albums, and official-account collection from the output. For anything more nuanced (public/private split, audiobook handling), read `references/domain-rules.md` and use `--json` only if exact structured counting is needed.

### Reading Statistics

Use `weread readdata detail` with `--mode weekly`, `monthly`, `annually`, or `overall`. Time fields in structured output are seconds. For historical or cross-period calculations, read `references/domain-rules.md`.

### Notes and Highlights

- Overview across all books: `weread notes notebooks`
- Single-book exportable content usually needs both `bookmarks` and `mine`
- For counting rules, export limits, or popular highlight queries, read `references/domain-rules.md`

### Reviews

Public reviews: `weread reviews list <bookId>` with `--type 0` (all) through `--type 4`. Single review: `weread reviews single <reviewId>`.

### Recommendations

- Personalized: `weread discover recommend`
- Similar books: `weread discover similar <bookId>`

## Pagination

Stay shallow by default — only paginate further when the user explicitly asks for a complete export, a ranking, or a total that requires all pages. For pagination, use `--json` and pass the native cursor from the previous JSON result:

- Search: `hasMore == 1` → pass last item `searchIdx` as `--max-idx`
- Notebooks: `hasMore == 1` → pass last `books[].sort` as `--last-sort`
- Reviews: pass last review `idx` as `--max-idx` and returned `synckey` as `--synckey`
- Similar: pass last item `idx` as `--max-idx` and `booksimilar.sessionId` as `--session-id`

## Error Handling

The CLI normalizes errors to JSON:

```json
{
  "ok": false,
  "skill_version": "1.0.3",
  "error": {
    "type": "missing_auth",
    "message": "..."
  }
}
```

- `missing_auth`: read `references/first-use.md` and help configure the key
- `upgrade_required`: stop immediately and follow `upgrade_info.message`; don't continue the original task until upgraded
- `api_error`, `http_error`, `network_error`, `invalid_json`: report the failure; retry only when repeating is safe

## User-Facing Output

- Convert Unix timestamps to readable dates
- Convert seconds to hours and minutes
- Use numbered lists for search results, shelf entries, notes, reviews, and recommendations
- Include WeRead deep links when useful; format rules are in `references/domain-rules.md`
