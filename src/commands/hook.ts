import { Command } from "commander";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getRepoRoot } from "../utils/git.js";

const HOOK_MARKER = "# opcli-post-commit-hook";

const HOOK_SCRIPT = `#!/bin/sh
${HOOK_MARKER}
BRANCH=$(git rev-parse --abbrev-ref HEAD)
TASK_ID=$(echo "$BRANCH" | grep -oP '(?<=/op-)\\d+' 2>/dev/null || echo "$BRANCH" | sed -n 's/.*\\/op-\\([0-9]*\\).*/\\1/p')
if [ -n "$TASK_ID" ]; then
  LAST_MSG=$(git log -1 --pretty=%s)
  if echo "$LAST_MSG" | grep -qiE "(^|[[:space:]])done:"; then
    opcli tasks update "$TASK_ID" --status "Developed"
    echo "\\033[32m[opcli] Task OP-$TASK_ID updated to Developed\\033[0m"
  fi
  exec < /dev/tty
  echo ""
  echo "\\033[1m[opcli] Log time for task #$TASK_ID\\033[0m"
  read -p "Hours (enter to skip): " HOURS
  if [ -n "$HOURS" ]; then
    SPENT_ON=$(date +%Y-%m-%d)
    COMMIT_MSG=$(git log -1 --format="%h %s")
    opcli tasks update "$TASK_ID" --log-time "$HOURS" --log-date "$SPENT_ON" --log-comment "$COMMIT_MSG"
  fi
fi
`;

const POST_CHECKOUT_MARKER_START = "# opcli-post-checkout-hook-start";
const POST_CHECKOUT_MARKER_END = "# opcli-post-checkout-hook-end";

const POST_CHECKOUT_SCRIPT = `${POST_CHECKOUT_MARKER_START}
# Skip if called from opcli create-branch (prevents double-prompt)
if [ "$OPCLI_SKIP_HOOK" = "1" ]; then
  exit 0
fi
# Only trigger on new branch creation: $3=1 (branch checkout) and $1=$2 (same HEAD = new branch)
if [ "$3" = "1" ] && [ "$1" = "$2" ]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  TASK_ID=$(echo "$BRANCH" | sed -n 's/.*\\/op-\\([0-9]*\\).*/\\1/p')
  if [ -n "$TASK_ID" ]; then
    exec < /dev/tty
    echo ""
    echo "\\033[1m[opcli] New branch detected for task #$TASK_ID\\033[0m"
    read -p "Update task OP-$TASK_ID to \\"In Process\\"? [Y/n] " answer
    if [ "$answer" != "n" ] && [ "$answer" != "N" ]; then
      opcli tasks update "$TASK_ID" --status "In Process"
    fi
  fi
fi
${POST_CHECKOUT_MARKER_END}
`;

const GPUSH_MARKER_START = "# opcli-gpush-start";
const GPUSH_MARKER_END = "# opcli-gpush-end";

const GPUSH_FUNCTION = `
${GPUSH_MARKER_START}
gpush() {
  git push "$@"
  if [ $? -eq 0 ]; then
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    TASK_ID=$(echo "$BRANCH" | sed -n 's/.*\\/op-\\([0-9]*\\).*/\\1/p')
    if [ -n "$TASK_ID" ]; then
      LAST_MSG=$(git log -1 --pretty=%s)
      if echo "$LAST_MSG" | grep -qi "WIP"; then
        echo "Skipping task update (WIP commit detected)"
      else
        read -p "Update task OP-$TASK_ID to \\"Developed\\" and set due date to today? [Y/n] " answer
        if [ "$answer" != "n" ] && [ "$answer" != "N" ]; then
          opcli tasks update "$TASK_ID" --status "Developed" --due "$(date +%Y-%m-%d)"
        fi
      fi
    fi
  fi
}
${GPUSH_MARKER_END}
`;

function installWithMarkers(filePath: string, content: string, markerStart: string, shebang: boolean): void {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    if (existing.includes(markerStart)) {
      return;
    }
    fs.appendFileSync(filePath, "\n" + content);
  } else {
    const prefix = shebang ? "#!/bin/sh\n" : "";
    fs.writeFileSync(filePath, prefix + content);
    if (shebang) fs.chmodSync(filePath, 0o755);
  }
}

function uninstallWithMarkers(filePath: string, markerStart: string, markerEnd: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.includes(markerStart)) return false;

  const lines = content.split("\n");
  const filtered: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (line.trim() === markerStart) { skipping = true; continue; }
    if (line.trim() === markerEnd) { skipping = false; continue; }
    if (!skipping) filtered.push(line);
  }

  const remaining = filtered.join("\n").trim();
  if (!remaining || remaining === "#!/bin/sh") {
    fs.unlinkSync(filePath);
  } else {
    fs.writeFileSync(filePath, remaining + "\n");
  }
  return true;
}

export const hookCommand = new Command("hook");

hookCommand
  .command("install")
  .description("Install git hooks and shell functions for task automation")
  .action(() => {
    const root = getRepoRoot();
    const hookDir = path.join(root, ".git", "hooks");
    const hookPath = path.join(hookDir, "post-commit");

    if (fs.existsSync(hookPath)) {
      const existing = fs.readFileSync(hookPath, "utf-8");
      if (existing.includes(HOOK_MARKER)) {
        console.log(chalk.yellow("Hook already installed."));
        return;
      }
      // Append to existing hook
      fs.appendFileSync(hookPath, "\n" + HOOK_SCRIPT);
      console.log(chalk.green("Hook appended to existing post-commit."));
    } else {
      if (!fs.existsSync(hookDir)) fs.mkdirSync(hookDir, { recursive: true });
      fs.writeFileSync(hookPath, HOOK_SCRIPT);
      fs.chmodSync(hookPath, 0o755);
      console.log(chalk.green("Post-commit hook installed."));
    }
    console.log(`Location: ${chalk.gray(hookPath)}`);

    const postCheckoutPath = path.join(hookDir, "post-checkout");
    installWithMarkers(postCheckoutPath, POST_CHECKOUT_SCRIPT, POST_CHECKOUT_MARKER_START, true);
    console.log(chalk.green("Post-checkout hook installed."));
    console.log(`Location: ${chalk.gray(postCheckoutPath)}`);

    const homeDir = os.homedir();
    const shellFiles = [
      path.join(homeDir, ".bashrc"),
      path.join(homeDir, ".zshrc"),
    ];
    for (const shellFile of shellFiles) {
      installWithMarkers(shellFile, GPUSH_FUNCTION, GPUSH_MARKER_START, false);
    }
    console.log(chalk.green("gpush shell function installed in ~/.bashrc and ~/.zshrc."));
    console.log(chalk.gray("Run 'source ~/.bashrc' or 'source ~/.zshrc' to activate, or open a new terminal."));
  });

hookCommand
  .command("uninstall")
  .description("Remove opcli git hooks and shell functions")
  .action(() => {
    const root = getRepoRoot();
    const hookPath = path.join(root, ".git", "hooks", "post-commit");

    if (!fs.existsSync(hookPath)) {
      console.log(chalk.gray("No post-commit hook found."));
      return;
    }

    const content = fs.readFileSync(hookPath, "utf-8");
    if (!content.includes(HOOK_MARKER)) {
      console.log(chalk.gray("No opcli hook found in post-commit."));
      return;
    }

    // Remove opcli section
    const lines = content.split("\n");
    const filtered: string[] = [];
    let skipping = false;
    for (const line of lines) {
      if (line.includes(HOOK_MARKER)) {
        skipping = true;
        continue;
      }
      if (skipping && line.startsWith("fi")) {
        skipping = false;
        continue;
      }
      if (!skipping) filtered.push(line);
    }

    const remaining = filtered.join("\n").trim();
    if (!remaining || remaining === "#!/bin/sh") {
      fs.unlinkSync(hookPath);
      console.log(chalk.green("Post-commit hook removed."));
    } else {
      fs.writeFileSync(hookPath, remaining + "\n");
      fs.chmodSync(hookPath, 0o755);
      console.log(chalk.green("opcli hook removed. Other hooks preserved."));
    }

    const postCheckoutPath = path.join(root, ".git", "hooks", "post-checkout");
    if (uninstallWithMarkers(postCheckoutPath, POST_CHECKOUT_MARKER_START, POST_CHECKOUT_MARKER_END)) {
      console.log(chalk.green("Post-checkout hook removed."));
    }

    const homeDir = os.homedir();
    const shellFiles = [
      path.join(homeDir, ".bashrc"),
      path.join(homeDir, ".zshrc"),
    ];
    for (const shellFile of shellFiles) {
      if (uninstallWithMarkers(shellFile, GPUSH_MARKER_START, GPUSH_MARKER_END)) {
        console.log(chalk.green(`gpush removed from ${shellFile}.`));
      }
    }
  });
