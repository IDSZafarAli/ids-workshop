// Stop hook — runs lint, standards, typecheck, and tests after Claude completes a task.
// Only runs when Claude edited a code file during *this* session (detected via the
// transcript). Pre-existing modifications in the working tree do not trigger checks.
// Exits non-zero on failure so Claude sees the output and can fix violations.

import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const FILE_EDITING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

type StopHookInput = {
  transcript_path?: string;
  stop_hook_active?: boolean;
};

function readHookInput(): StopHookInput {
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw.trim()) {
      return {};
    }
    return JSON.parse(raw) as StopHookInput;
  } catch {
    return {};
  }
}

function isCodePath(filePath: unknown): boolean {
  if (typeof filePath !== 'string') {
    return false;
  }
  return CODE_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

function sessionEditedCode(transcriptPath: string | undefined): boolean {
  if (!transcriptPath) {
    return true; // no transcript info — fail safe and run checks
  }

  let raw: string;
  try {
    raw = readFileSync(transcriptPath, 'utf8');
  } catch {
    return true; // can't read transcript — fail safe
  }

  for (const line of raw.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    let entry: {message?: {role?: string; content?: unknown}};
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const message = entry.message;
    if (!message || message.role !== 'assistant' || !Array.isArray(message.content)) {
      continue;
    }

    for (const block of message.content as Array<{
      type?: string;
      name?: string;
      input?: {file_path?: unknown; notebook_path?: unknown};
    }>) {
      if (block?.type !== 'tool_use' || !block.name || !FILE_EDITING_TOOLS.has(block.name)) {
        continue;
      }
      const target = block.input?.file_path ?? block.input?.notebook_path;
      if (isCodePath(target)) {
        return true;
      }
    }
  }

  return false;
}

type CheckResult = {name: string; passed: boolean; output: string};

function runCheck(name: string, script: string): Promise<CheckResult> {
  return new Promise((resolve) => {
    const proc = spawn(`npm run ${script}`, {
      cwd: projectDir,
      shell: true,
      env: {...process.env},
    });

    const chunks: string[] = [];
    proc.stdout?.on('data', (d: Buffer) => chunks.push(d.toString()));
    proc.stderr?.on('data', (d: Buffer) => chunks.push(d.toString()));

    proc.on('close', (code) => {
      resolve({name, passed: code === 0, output: chunks.join('').trim()});
    });

    proc.on('error', (err) => {
      resolve({name, passed: false, output: String(err)});
    });
  });
}

async function main(): Promise<void> {
  const hookInput = readHookInput();
  if (!sessionEditedCode(hookInput.transcript_path)) {
    process.exit(0);
  }

  process.stderr.write('\n[Post-task checks — running in parallel...]\n');

  const results = await Promise.all([
    runCheck('lint:check', 'lint:check'),
    runCheck('check:standards:changed', 'check:standards:changed'),
    runCheck('typecheck:apis', 'typecheck:apis'),
    runCheck('typecheck:web', 'typecheck:web'),
    runCheck('test:apis', 'test:apis'),
    runCheck('test:web', 'test:web'),
  ]);

  const failed = results.filter((r) => !r.passed);

  process.stderr.write('\n[Post-task checks]\n');
  for (const result of results) {
    process.stderr.write(`  ${result.passed ? '✓' : '✗'} ${result.name}\n`);
  }

  if (failed.length > 0) {
    const lines: string[] = [
      `\n[Post-task checks] ${failed.length} check${failed.length > 1 ? 's' : ''} failed — fix these violations before stopping:\n`,
    ];
    for (const result of failed) {
      lines.push(`=== ${result.name} ===`);
      if (result.output) {
        lines.push(result.output.split('\n').slice(0, 40).join('\n'));
      }
      lines.push('');
    }
    const output = lines.join('\n');
    process.stdout.write(output);
    process.stderr.write(output);
    process.exit(2);
  }

  process.stderr.write('\n  All checks passed.\n');
  process.exit(0);
}

main().catch((err: unknown) => {
  process.stderr.write(`[post-task-check] Unexpected error: ${String(err)}\n`);
  process.exit(1);
});
