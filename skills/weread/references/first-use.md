# First Use And API Key Setup

Use this reference when `weread doctor` reports missing auth, when the `weread` command is not installed, when the user asks how to get an API Key, or when the user is setting up WeRead for the first time.

## Install The CLI

If the `weread` command is missing, install the published CLI package:

```bash
npm install -g weread-agent-cli
```

Then verify the command:

```bash
weread --version
weread doctor
```

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
   weread doctor
   ```

## Where The Key Is Stored

The CLI stores the key in:

```text
~/.weread-cli/config.json
```

The environment variable `WEREAD_API_KEY` takes priority over the config file. This is useful for temporary overrides or CI:

```bash
export WEREAD_API_KEY="wrk-..."
weread doctor
```

## Safety Notes

- Treat the API Key as a private credential.
- Do not commit the key to a repository.
- Do not paste the key into issue trackers, README examples, or shared logs.
- `weread config list` and `weread doctor` only show a masked preview.

## Common Setup Problems

- If `doctor` still says auth is missing, run `weread config path` and confirm the key was saved in that file.
- If an environment variable is set to the wrong key, it overrides the config file. Clear `WEREAD_API_KEY` and rerun `doctor`.
- If the key was copied with spaces or quotes, run `weread config set-key` again with the clean key.
