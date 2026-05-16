---
name: weread
description: "Use this skill for 微信读书 and WeRead tasks, including book search, shelf inspection, reading progress, notes, highlights, reviews, reading statistics, recommendations, or first-time API key setup. It instructs agents to use the local weread CLI."
---

# WeRead

Use the local `weread` command as the execution layer for WeRead tasks. The CLI is based on WeRead officially supported APIs and handles authentication, request shape, `skill_version`, JSON parsing, upgrade checks, and normalized errors.

Do not write ad hoc `curl` requests for normal work. The agent-facing abstraction is the CLI.

## First Decision

Run this before any WeRead API work:

```bash
weread --json doctor
```

If `auth_configured` is false, read `references/first-use.md` and guide the user through getting an API Key from:

```text
https://weread.qq.com/r/weread-skills
```

Then configure it with:

```bash
weread config set-key "wrk-..."
```

Use `--json` whenever you need to parse, combine, paginate, or cite exact fields. Human-readable output is acceptable only for short direct answers.

## Command Map

Prefer first-class commands:

```bash
weread --json search "三体" --scope book --count 10
weread --json book info <bookId>
weread --json book chapters <bookId>
weread --json book progress <bookId>
weread --json shelf list
weread --json readdata detail --mode monthly
weread --json notes notebooks --count 100
weread --json notes bookmarks <bookId>
weread --json notes mine <bookId> --count 20
weread --json notes underlines <bookId> <chapterUid>
weread --json notes best <bookId> --chapter-uid <chapterUid>
weread --json notes readreviews <bookId> <chapterUid> --reviews-json '[{"range":"900-2004","count":20}]'
weread --json reviews list <bookId> --type 1 --count 20
weread --json reviews single <reviewId>
weread --json discover recommend --count 12
weread --json discover similar <bookId> --count 12
weread --json api list
```

Use the raw escape hatch only when a supported API is not covered by a first-class command:

```bash
weread --json api call /store/search --param keyword=三体 --param scope=10
```

## When To Read References

- First-time setup, missing auth, or API Key questions: read `references/first-use.md`.
- Shelf totals, public/private shelf counts, audiobook handling, or article-collection handling: read `references/domain-rules.md`.
- Notes, highlights, bookmarks, personal ideas, public reviews, or exports: read `references/domain-rules.md`.
- Reading statistics, historical periods, cross-year ranges, or time-unit interpretation: read `references/domain-rules.md`.
- Deep links to books, chapters, highlights, or ideas: read `references/domain-rules.md`.

The references intentionally omit low-level request mechanics already handled by the CLI.

## Intent Routing

Search:

- User asks to find a book, search books, get a `bookId`, or says `搜书` or `找书`: `weread --json search "<keyword>" --scope book`
- User says generic `搜一下`: use `--scope all`
- User asks for web fiction or `网文`: use `--scope fiction`
- User asks for audiobooks, podcasts, `听书`, `有声书`, or `专辑`: use `--scope audio`
- User asks for authors: use `--scope author`
- User asks for full-text search or `书里提到`: use `--scope fulltext`
- User asks for book lists: use `--scope list`
- User asks for official accounts: use `--scope mp`
- User asks for articles: use `--scope article`

Book details:

- If the user gives a title, search first and use `bookInfo.bookId`.
- Use `book info` for metadata, `book chapters` for chapter UIDs, and `book progress` for reading progress.
- Reading progress is an integer percent from `0` to `100`; `1` means `1%`, not complete.

Shelf:

- Use `weread --json shelf list`.
- For simple shelf totals, compute `books.length + albums.length + (mp ? 1 : 0)`.
- For anything more nuanced, read `references/domain-rules.md`.

Reading statistics:

- Use `weread --json readdata detail`.
- Modes are `weekly`, `monthly`, `annually`, and `overall`.
- Time fields are seconds.
- Read `references/domain-rules.md` for historical or cross-period calculations.

Notes and highlights:

- Notebook overview: `weread --json notes notebooks`.
- Single-book exportable content usually needs both:
  ```bash
  weread --json notes bookmarks <bookId>
  weread --json notes mine <bookId>
  ```
- Read `references/domain-rules.md` before answering totals, exports, bookmark questions, or popular-highlight questions.

Reviews:

- Public reviews: `weread --json reviews list <bookId>`.
- `--type 0` all, `--type 1` recommended, `--type 2` negative, `--type 3` recent, `--type 4` normal.
- Single review details: `weread --json reviews single <reviewId>`.

Recommendations:

- Personalized recommendations: `weread --json discover recommend`.
- Similar books: `weread --json discover similar <bookId>`.

## Pagination

Keep calls shallow unless the user asks for a complete export, a ranking, or a total that requires all pages.

Use the native cursor from the previous JSON result:

- Search: if `hasMore` is `1`, pass the last item `searchIdx` as `--max-idx`.
- Notebooks: if `hasMore` is `1`, pass the last `books[].sort` as `--last-sort`.
- Reviews: pass the last review `idx` as `--max-idx` and returned `synckey` as `--synckey`.
- Similar recommendations: pass the last item `idx` as `--max-idx` and returned `booksimilar.sessionId` as `--session-id`.

## Error Handling

The CLI returns normalized JSON errors:

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

Handle important error types this way:

- `missing_auth`: read `references/first-use.md` and help configure the key.
- `upgrade_required`: stop immediately and follow `upgrade_info.message`; do not continue the original workflow until upgraded.
- `api_error`, `http_error`, `network_error`, `invalid_json`: report the failure and retry only when repeating the request is safe.

## User-Facing Output

When summarizing results for the user:

- Convert Unix timestamps to dates.
- Convert seconds to hours and minutes.
- Use numbered lists for search results, shelf entries, notes, reviews, and recommendations.
- Include WeRead deep links when useful; read `references/domain-rules.md` for link formats and edge cases.
