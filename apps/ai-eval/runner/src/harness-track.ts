import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {resetDir, writeTextFile} from './fs-utils.js';
import type {EvalCheck, EvalTaskResult} from './types.js';

const tmpRoot = join(process.cwd(), '.ai-eval', 'tmp', 'harness');

function runHook(script: string, payload: unknown): string {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
  const args = process.platform === 'win32' ? ['/c', 'npx', 'tsx', script] : ['tsx', script];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}`;
}

function scoreContains(output: string, expected: string, name: string): EvalCheck {
  const passed = output.includes(expected);
  return {
    name,
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    summary: passed ? `Detected expected signal: ${expected}` : `Missing signal: ${expected}`,
    details: output.trim() ? output.trim().split('\n').slice(0, 8) : ['No hook output'],
  };
}

function runPreToolReminderTrap(): EvalTaskResult {
  const target = join(tmpRoot, 'apps', 'client-web', 'app', 'pages', 'EvalTrap.tsx');
  writeTextFile(target, 'export function EvalTrap() { return null; }\n');
  const output = runHook('.claude/hooks/remind-standards.ts', {
    tool_input: {file_path: target},
  });

  const checks = [
    scoreContains(output, 'Frontend standards', 'frontend reminder emitted'),
    scoreContains(output, 'apiClient', 'apiClient rule included'),
    scoreContains(output, 'MUI imports use path imports', 'MUI path import rule included'),
  ];

  return buildTask(
    'harness-pretool-reminder',
    'PreTool reminder injects relevant frontend standards',
    checks,
  );
}

function runPostToolValidationTrap(): EvalTaskResult {
  const target = join(tmpRoot, 'apps', 'client-web', 'app', 'pages', 'EvalTrap.tsx');
  writeTextFile(
    target,
    [
      "import {Button} from '@mui/material';",
      '',
      'export const EvalTrap = () => {',
      "  fetch('/api/part');",
      '  return <Button>Save</Button>;',
      '};',
      '',
    ].join('\n'),
  );

  const output = runHook('.claude/hooks/validate-standards.ts', {
    tool_input: {file_path: target},
  });

  const checks = [
    scoreContains(output, 'Bare fetch()', 'bare fetch violation detected'),
    scoreContains(output, 'MUI barrel import', 'MUI barrel violation detected'),
    scoreContains(output, 'Arrow function component', 'arrow component violation detected'),
  ];

  return buildTask(
    'harness-posttool-validation',
    'PostTool validation catches seeded frontend violations',
    checks,
  );
}

function buildTask(taskId: string, title: string, checks: EvalCheck[]): EvalTaskResult {
  const score = checks.reduce((sum, check) => sum + check.score, 0);
  const maxScore = checks.reduce((sum, check) => sum + check.maxScore, 0);
  return {taskId, track: 'harness', title, score, maxScore, checks};
}

export function runHarnessTrack(): EvalTaskResult[] {
  resetDir(tmpRoot);
  return [runPreToolReminderTrap(), runPostToolValidationTrap()];
}
