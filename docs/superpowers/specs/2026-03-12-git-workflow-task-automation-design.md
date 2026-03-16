# Git Workflow Task Status Automation

## Overview

Automate OpenProject task status transitions based on git workflow events:
- Branch creation → task status "In Process"
- Push (without WIP) → task status "Developed" + set due date

All transitions prompt for user confirmation before executing.

## Components

### 1. `create-branch` Enhancement

**File:** `src/commands/tasks.ts`

After successfully creating a git branch via `opcli tasks create-branch`, set env var `OPCLI_SKIP_HOOK=1` before the `git checkout -b` call to prevent double-prompting from the post-checkout hook. Then prompt:

```
Update task OP-{id} to "In Process"? [Y/n]
```

If confirmed, call `opcli tasks update <id> --status "In Process"`.

### 2. Post-Checkout Hook

**Installed to:** `.git/hooks/post-checkout`

Triggers on `git checkout -b [prefix]/op-[id]-*`. Must distinguish branch creation from branch switching.

- Skip if `OPCLI_SKIP_HOOK=1` (set by `create-branch` to avoid double-prompting)
- Extract task ID using existing `/\/op-(\d+)/` pattern (requires slash before `op-`)
- Redirect TTY for interactive input: `exec < /dev/tty`
- Prompt: `Update task OP-{id} to "In Process"? [Y/n]`
- If confirmed, run `opcli tasks update <id> --status "In Process"`

**Branch creation detection:** post-checkout hook receives 3 args: `$1` = previous HEAD, `$2` = new HEAD, `$3` = flag (1 = branch checkout, 0 = file checkout). Check if `$1 == $2` and `$3 == 1` to detect new branch creation.

### 3. `gpush` Shell Function

**Installed to:** `~/.bashrc` and `~/.zshrc` (created if they don't exist)

A shell function (not alias, to support arguments):

```bash
gpush() {
  git push "$@"
  if [ $? -eq 0 ]; then
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    TASK_ID=$(echo "$BRANCH" | sed -n 's/.*\/op-\([0-9]*\).*/\1/p')
    if [ -n "$TASK_ID" ]; then
      LAST_MSG=$(git log -1 --pretty=%s)
      if echo "$LAST_MSG" | grep -qi "WIP"; then
        echo "Skipping task update (WIP commit detected)"
      else
        read -p "Update task OP-$TASK_ID to \"Developed\" and set due date to today? [Y/n] " answer
        if [ "$answer" != "n" ] && [ "$answer" != "N" ]; then
          opcli tasks update "$TASK_ID" --status "Developed" --due "$(date +%Y-%m-%d)"
        fi
      fi
    fi
  fi
}
```

**Notes:**
- Uses `sed` instead of `grep -oP` for macOS compatibility
- Pattern requires `/op-` (with leading slash) to match existing codebase convention
- Only checks the latest commit for "WIP" (intentional — single-commit check per user decision)
- If task is already "Developed", the API may accept it as a no-op or return an error — the existing `update` command handles both cases with appropriate output

### 4. `opcli hook install/uninstall` Extension

**File:** `src/commands/hook.ts`

Extend the existing install/uninstall commands:

**Install:**
- Install post-commit hook (existing behavior)
- Install post-checkout hook with paired markers `# opcli-post-checkout-hook-start` / `# opcli-post-checkout-hook-end`
- Append `gpush` function to `~/.bashrc` and `~/.zshrc` with paired markers `# opcli-gpush-start` / `# opcli-gpush-end`
- Create `~/.bashrc` / `~/.zshrc` if they don't exist
- Idempotent: skip if start marker already present

**Uninstall:**
- Remove post-commit hook section (existing behavior)
- Remove post-checkout hook section between paired markers
- Remove `gpush` function from `~/.bashrc` and `~/.zshrc` between paired markers

## Task ID Extraction

Reuse existing pattern from `src/utils/git.ts`: `/\/op-(\d+)/` (requires slash before `op-`). This matches branches like `feature/op-123-slug` but not `op-123-slug` or `my-op-123`.

## Status Names

Hardcoded as "In Process" and "Developed". The existing `opcli tasks update --status` validates against the OpenProject API and shows available statuses if the name doesn't match.

## Error Handling

- If `opcli` is not installed or not in PATH, hooks/alias print a warning and exit gracefully
- If OpenProject API is unreachable, the update command already handles this with error messages
- If task ID cannot be extracted from branch name, silently skip (no prompt)
- If task is already in the target status, let the API response handle it (no pre-check)

## Files Changed

1. `src/commands/tasks.ts` — add `OPCLI_SKIP_HOOK=1` env + confirmation prompt after `create-branch`
2. `src/commands/hook.ts` — extend install/uninstall for post-checkout hook + gpush shell function
3. `~/.bashrc`, `~/.zshrc` — gpush function appended/removed by hook install/uninstall
4. `.git/hooks/post-checkout` — new hook file managed by install/uninstall
