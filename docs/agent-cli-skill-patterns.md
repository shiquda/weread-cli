# Agent CLI + Skill Pattern Notes

Research performed with `smart-search` on 2026-05-16. Evidence files are under `C:\tmp\smart-search-evidence\`.

## Sources

- Anthropic Agent Skills overview: `smart-search fetch https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview`
- OpenAI CLI creator pattern reference: `smart-search fetch https://github.com/openai/skills/blob/main/skills/.curated/cli-creator/references/agent-cli-patterns.md`
- MCP-to-Skills trend example: `smart-search fetch https://github.com/dhanababum/mcpskills-cli`

## Conclusions Applied Here

- Use Skills for progressive disclosure: metadata triggers the Skill, `SKILL.md` teaches workflow, and detailed implementation stays in files or scripts loaded only as needed.
- Make the CLI the deterministic command layer. The Agent should not hand-build curl payloads for routine work.
- Expose composable product nouns and verbs, not one giant "do everything" command.
- Support `--json` everywhere Agents parse output. JSON stdout must be clean; diagnostics should not pollute it.
- Keep a raw escape hatch (`api call`) that still applies configured auth, flattened params, skill version, JSON parsing, and error handling.
- Make `doctor` useful without network calls and without crashing when auth is absent.
- Treat pagination cursors as first-class flags using native API names where possible.
- Surface upgrade requirements as hard stops; Agents should not ignore `upgrade_info`.

## WeRead CLI Shape

Implemented command groups:

- `config`: local credentials under `~/.weread-cli`
- `doctor`: local config inspection
- `api`: `list` and raw `call`
- `search`: `/store/search`
- `book`: `/book/info`, `/book/chapterinfo`, `/book/getprogress`
- `shelf`: `/shelf/sync`
- `readdata`: `/readdata/detail`
- `notes`: `/user/notebooks`, `/book/bookmarklist`, `/review/list/mine`, `/book/underlines`, `/book/bestbookmarks`, `/book/readreviews`
- `reviews`: `/review/list`, `/review/single`
- `discover`: `/book/recommend`, `/book/similar`
- `profile`: convenience entry point built from supported APIs
