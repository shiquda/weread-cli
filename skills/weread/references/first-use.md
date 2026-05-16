# First Use And API Key Setup

Use this reference when `weread --json doctor` reports `auth_configured: false`, when the user asks how to get an API Key, or when the user is setting up WeRead for the first time.

## Get An API Key

1. Open the official WeRead Skills page:
   ```text
   https://weread.qq.com/r/weread-skills
   ```
2. Sign in with the WeRead account whose reading data the user wants to access.
3. Find the API Key section on that page and copy the key. It should look like:
   ```text
   wrk-...
   ```
4. Configure the local CLI:
   ```bash
   weread config set-key "wrk-..."
   ```
5. Verify:
   ```bash
   weread --json doctor
   ```

## Where The Key Is Stored

The CLI stores the key in:

```text
~/.weread-cli/config.json
```

The environment variable `WEREAD_API_KEY` takes priority over the config file. This is useful for temporary overrides or CI:

```bash
WEREAD_API_KEY="wrk-..." weread --json doctor
```

## Safety Notes

- Treat the API Key as a private credential.
- Do not commit the key to a repository.
- Do not paste the key into issue trackers, README examples, or shared logs.
- `weread config list` and `weread --json doctor` only show a masked preview.

## Common Setup Problems

- If `doctor` still says auth is missing, run `weread config path` and confirm the key was saved in that file.
- If an environment variable is set to the wrong key, it overrides the config file. Clear `WEREAD_API_KEY` and rerun `doctor`.
- If the key was copied with spaces or quotes, run `weread config set-key` again with the clean key.
