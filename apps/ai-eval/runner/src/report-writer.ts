import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ensureDir} from './fs-utils.js';
import type {EvalRunResult} from './types.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function percent(score: number, maxScore: number): string {
  if (maxScore === 0) {
    return '0%';
  }
  return `${Math.round((score / maxScore) * 100)}%`;
}

export function writeRunArtifacts(result: EvalRunResult): {jsonPath: string; htmlPath: string} {
  const runsDir = join(process.cwd(), '.ai-eval', 'runs');
  const reportsDir = join(process.cwd(), '.ai-eval', 'reports');
  ensureDir(runsDir);
  ensureDir(reportsDir);

  const jsonPath = join(runsDir, `${result.runId}.json`);
  const htmlPath = join(reportsDir, 'latest.html');
  writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8');
  writeFileSync(htmlPath, renderHtml(result), 'utf8');
  return {jsonPath, htmlPath};
}

function renderHtml(result: EvalRunResult): string {
  const rows = result.tasks
    .map(
      (task) => `
        <tr>
          <td>${escapeHtml(task.track)}</td>
          <td>${escapeHtml(task.title)}</td>
          <td>${task.score}/${task.maxScore}</td>
          <td>${percent(task.score, task.maxScore)}</td>
          <td>${task.checks
            .map(
              (check) =>
                `<span class="${check.passed ? 'pass' : 'fail'}">${check.passed ? 'PASS' : 'FAIL'} ${escapeHtml(check.name)}</span>`,
            )
            .join('<br>')}</td>
        </tr>`,
    )
    .join('\n');

  const details = result.tasks
    .map(
      (task) => `
        <section>
          <h2>${escapeHtml(task.title)}</h2>
          <p><strong>Track:</strong> ${escapeHtml(task.track)} · <strong>Score:</strong> ${task.score}/${task.maxScore}</p>
          ${task.checks
            .map(
              (check) => `
                <article class="check ${check.passed ? 'ok' : 'bad'}">
                  <h3>${check.passed ? 'PASS' : 'FAIL'} — ${escapeHtml(check.name)}</h3>
                  <p>${escapeHtml(check.summary)}</p>
                  ${
                    check.details && check.details.length > 0
                      ? `<ul>${check.details.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`
                      : ''
                  }
                </article>`,
            )
            .join('')}
        </section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IDS AI Eval Report</title>
  <style>
    body { margin: 0; font-family: Inter, Segoe UI, Arial, sans-serif; color: #172033; background: #f5f7fb; }
    header { background: #172033; color: white; padding: 28px 36px; }
    main { padding: 28px 36px 48px; max-width: 1200px; margin: 0 auto; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 24px; }
    .metric { background: white; border: 1px solid #dde3ee; border-radius: 8px; padding: 16px; }
    .metric strong { display: block; font-size: 28px; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #dde3ee; border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #edf0f5; vertical-align: top; }
    th { background: #eef3f9; color: #33415c; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; }
    section { background: white; border: 1px solid #dde3ee; border-radius: 8px; padding: 18px; margin-top: 18px; }
    .check { border-left: 4px solid #8fa1bd; padding: 10px 14px; margin: 12px 0; background: #fafbfd; }
    .check.ok { border-color: #1f8f5f; }
    .check.bad { border-color: #c43d4b; }
    .pass { color: #1f8f5f; font-weight: 700; }
    .fail { color: #c43d4b; font-weight: 700; }
    code { background: #eef3f9; padding: 2px 5px; border-radius: 4px; }
  </style>
</head>
<body>
  <header>
    <h1>IDS AI Eval Report</h1>
    <p>${escapeHtml(result.runId)} · ${escapeHtml(result.startedAt)} → ${escapeHtml(result.finishedAt)}</p>
  </header>
  <main>
    <div class="summary">
      <div class="metric">Overall<strong>${result.score}/${result.maxScore}</strong></div>
      <div class="metric">Percent<strong>${percent(result.score, result.maxScore)}</strong></div>
      <div class="metric">Profile<strong>${escapeHtml(result.profile)}</strong></div>
      <div class="metric">Tracks<strong>${escapeHtml(result.tracks.join(', '))}</strong></div>
    </div>
    <table>
      <thead><tr><th>Track</th><th>Task</th><th>Score</th><th>Percent</th><th>Checks</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${details}
  </main>
</body>
</html>`;
}
