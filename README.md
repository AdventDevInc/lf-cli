## lf-cli

CLI helper for LoadForge: sync tests, trigger runs, and wait for results from CI.

### Features
- Pull tests from LoadForge into local `tests/` as folders per slug
- Push tests to LoadForge by unique name (folder slug)
- Start a run by slug and print the run/result ID
- Wait for a run to complete with a spinner, human status, and summary JSON output
- Create new test folders interactively or via flags

### Install
Local (dev):
```bash
npm install
```

Use without publishing (optional):
```bash
npm link
lf-cli --help
```

### Auth setup
Create a `.env` in your repo root:
```bash
API_KEY=your_loadforge_api_key
```
All requests use `Authorization: Bearer <token>` against `https://app.loadforge.com/api/v2`.
References: [Introduction](https://docs.loadforge.com/api-reference/introduction)

### Commands

#### Pull
Fetch all LoadForge tests of type "load" and write to `tests/<slug>/`:
```bash
lf-cli pull
# or
node index.js pull
```
Options:
- `-o, --out <dir>`: defaults to `tests`

Output structure (per test):
```
tests/<slug>/
  locustfile.py
  config.json
```
`config.json` contains editable config (no name field). `host` is stored as `protocol://url:port`:
```json
{
  "users": 200,
  "rate": 1,
  "servers": 2,
  "host": "https://loadforge.com:443",
  "apdex_target": 300,
  "p95_target": 600,
  "error_perc_target": 0,
  "region_servers": {"nyc3": 1, "sfo3": 1}
}
```

Notes:
- Only `test_type = "load"` is pulled (current limitation).
- Folder name (slug) is the canonical unique name; there is no `id` or `name` in `config.json`.
 - The `host` string is derived from your account Hosts list. If not resolvable it may be omitted.

#### Push
Name-based sync using folder slug as the unique identifier. Compares local folders to remote load tests:
```bash
lf-cli push
# or
node index.js push
```
Defaults:
- `--dir`: `tests`
- `--dry-run`: false

Behavior:
- Intersection (same slug on both sides) → PATCH update
- Local-only → create (requires `--allow-create`)
- Remote-only → delete (requires `--allow-delete`)

Flags:
- `--allow-create`: enable creating missing remote tests
- `--allow-delete`: enable deleting remote tests not present locally
- `--try-extended`: send extended fields (fallback to base on 400)
- `--verbose`: debug logs

Fields pushed on update/create:
- Always: `users`, `rate`, `servers`, `host` (resolved to `host_id`), `region`, `locustfile`
- Extended (attempted by default with fallback): `apdex_target`, `p95_target`, `error_perc_target`, `region_servers`

Region handling:
- Update: if local `region` missing, defaults to remote `region`
- Create: local `region` is required

Hosts handling:
- Local `config.json.host` must be a string like `https://example.com:443`.
- On push, the CLI resolves the host to an existing Host or creates a new Host if missing, and sends `host_id` in the API payload.

Examples:
```bash
# Update only
lf-cli push --dry-run=false

# Update + create
lf-cli push --dry-run=false --allow-create

# Update + create + delete (prune)
lf-cli push --dry-run=false --allow-create --allow-delete
```

References: [List Tests](https://docs.loadforge.com/api-reference/endpoint/tests-list), [Update Test](https://docs.loadforge.com/api-reference/endpoint/tests-update)

#### Start a run
Start a run by slug (unique name) and print the numeric ID (handles run_id or result_id):
```bash
RUN_ID=$(lf-cli start lf-website -d 2)
# or
RUN_ID=$(node index.js start lf-website -d 2)
echo "$RUN_ID"
```
Options:
- `-d, --duration <mins>`: default 5 (min 2)

Reference: [Start Run](https://docs.loadforge.com/api-reference/endpoint/run-start)

#### Wait for a run
Poll the result status every 5 seconds until completion, with a spinner and live stats:
```bash
lf-cli wait "$RUN_ID"
# or
node index.js wait "$RUN_ID"
```
Options:
- `-i, --interval <seconds>`: default 5
- `--verbose`: debug logs

Exit codes and output:
- On completion, prints a summary JSON with fields:
  `id, created_at, updated_at, run_status, cancelled, duration, test_id, requests, failures, response_median, response_avg, response_min, response_max, reqs_per_second, fails_per_second`
- If `run_status == 3` and `run_passed == true`: exits 0
- If `run_status == 3` and `run_passed == false`: prints "Run passed was false" and an explanation, then exits 2
- If `run_status >= 4`: prints a failure reason and exits 1

Failure reasons for `run_status`:
- 4: The Run failed to launch
- 5: The Run was cancelled
- 6: The Run was limited by your cloud provider
- 7: The Run failed to launch it's cloud workers

Reference: [Get Result](https://docs.loadforge.com/api-reference/endpoint/result-get)

#### Create a new test folder
Create a new test under `tests/` with an initial `config.json` and a default `locustfile.py`. Interactive by default; can be fully specified via flags.
```bash
# Interactive prompts for name, users, and host (or create a new Host)
lf-cli create

# Non-interactive
lf-cli create --name my-test --users 50 --host https://example.com:443
```
This only scaffolds files locally. Use `lf-cli push --allow-create` to create the test remotely.

### CI example
```yaml
- name: Sync LoadForge tests
  run: |
    npx lf-cli push --dry-run=false --allow-create --dir tests

- name: Start LoadForge run
  run: |
    RUN_ID=$(npx lf-cli start lf-website -d 3)
    echo "RUN_ID=$RUN_ID" >> $GITHUB_ENV

- name: Wait for run completion
  run: |
    npx lf-cli wait "$RUN_ID"
```

### Notes
- Unique slugs (folder names) are required for push and start.
- Only load tests are supported currently for pull/push.
 - The CLI targets `https://app.loadforge.com/api/v2` and uses `Authorization: Bearer <token>`.

### References
- Introduction: https://docs.loadforge.com/api-reference/introduction
- List Tests: https://docs.loadforge.com/api-reference/endpoint/tests-list
- Update Test: https://docs.loadforge.com/api-reference/endpoint/tests-update
- Start Run: https://docs.loadforge.com/api-reference/endpoint/run-start
- Get Result: https://docs.loadforge.com/api-reference/endpoint/result-get
- List Hosts: https://docs.loadforge.com/api-reference/endpoint/hosts-list

