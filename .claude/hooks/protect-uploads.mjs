#!/usr/bin/env node
/**
 * PreToolUse hook — protect data/uploads/
 *
 * Uploaded source PDFs are the one thing in this project that cannot be
 * regenerated. Extraction reads them; nothing writes them. This hook makes
 * that a property of the workspace rather than a rule someone has to
 * remember.
 *
 * Blocking contract for a PreToolUse *command* hook: exit 2 blocks the tool
 * call and the message on stderr is what the session is told. Exit 0 is "no
 * opinion" and the normal permission flow continues. Any other exit code is
 * a non-blocking error, so this script must never crash its way to a pass —
 * every failure path below exits 0 deliberately.
 *
 * Written in Node rather than shell because it has to parse the event JSON,
 * and jq is not guaranteed to exist on a Windows machine.
 */

import path from "node:path";

const PROTECTED_SEGMENT = path.join("data", "uploads");

/** Commands that write. Reading from data/uploads/ stays allowed. */
const SHELL_WRITE_PATTERNS = [
  />>?\s*\S*data[\\/]+uploads/i, // redirection into the directory
  /\b(rm|mv|cp|tee|truncate|touch|mkdir|chmod|chown|dd)\b[^|;&]*data[\\/]+uploads/i,
  /\bsed\b[^|;&]*-i[^|;&]*data[\\/]+uploads/i,
];

function readStdin() {
  return new Promise((resolve) => {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (buffer += chunk));
    process.stdin.on("end", () => resolve(buffer));
    process.stdin.on("error", () => resolve(""));
  });
}

/** True when `resolved` is at or beneath `guarded`. */
function isInside(guarded, resolved) {
  const relative = path.relative(guarded, resolved);
  // Inside iff the relative path neither escapes upward nor becomes
  // absolute. An empty relative path means the directory itself.
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * True when `filePath` lands inside data/uploads/.
 *
 * The guarded directory is resolved against every base we might plausibly be
 * rooted at, and a match under any of them blocks. Checking only one base
 * fails open whenever the bases disagree — and they do disagree on Windows,
 * where CLAUDE_PROJECT_DIR may arrive as "D:/project" while a shell reports
 * cwd as "/d/project". Those resolve to different absolute roots, the
 * comparison silently misses, and the guard waves the write through. Failing
 * closed across all candidate bases costs nothing and removes that class of
 * bug entirely.
 */
function targetsUploads(filePath, cwd) {
  const bases = [...new Set([cwd, process.env.CLAUDE_PROJECT_DIR, process.cwd()].filter(Boolean))];
  const resolved = path.resolve(cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), filePath);

  return bases.some((base) => isInside(path.resolve(base, PROTECTED_SEGMENT), resolved));
}

function deny(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const raw = await readStdin();

let event;
try {
  event = JSON.parse(raw);
} catch {
  // Nothing parseable to judge; do not block on our own confusion.
  process.exit(0);
}

const toolName = event.tool_name ?? "";
const toolInput = event.tool_input ?? {};
const cwd = event.cwd;

if (["Write", "Edit", "NotebookEdit", "MultiEdit"].includes(toolName)) {
  const filePath = toolInput.file_path ?? toolInput.notebook_path;
  if (typeof filePath === "string" && targetsUploads(filePath, cwd)) {
    deny(
      `Blocked: ${toolName} targets ${filePath}, which is inside data/uploads/. ` +
        `Uploaded source documents are read-only — extraction reads them and ` +
        `nothing writes them. Write derived output to data/drafts/ or data/profiles/ instead.`,
    );
  }
}

if (toolName === "Bash") {
  const command = typeof toolInput.command === "string" ? toolInput.command : "";
  if (SHELL_WRITE_PATTERNS.some((pattern) => pattern.test(command))) {
    deny(
      `Blocked: this command appears to write to or delete from data/uploads/, ` +
        `which holds read-only uploaded source documents. Reading from that ` +
        `directory is allowed; modifying it is not.`,
    );
  }
}

process.exit(0);
