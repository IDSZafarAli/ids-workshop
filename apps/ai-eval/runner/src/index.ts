#!/usr/bin/env tsx

import {runDoctorTrack} from './doctor-track.js';
import {runHarnessTrack} from './harness-track.js';
import {runPlanCouncilTrack} from './plan-council-track.js';
import {writeRunArtifacts} from './report-writer.js';
import type {EvalRunResult, EvalTaskResult, EvalTrack, RunnerOptions} from './types.js';

const allTracks: EvalTrack[] = ['harness', 'doctor', 'plan-council'];

function parseArgs(): RunnerOptions {
  const args = process.argv.slice(2);
  const trackIndex = args.indexOf('--track');
  const profileIndex = args.indexOf('--profile');
  const planIndex = args.indexOf('--plan');
  const track = trackIndex >= 0 ? (args[trackIndex + 1] as EvalTrack | undefined) : undefined;
  const profile = profileIndex >= 0 ? (args[profileIndex + 1] ?? 'local') : 'local';
  const planPath = planIndex >= 0 ? args[planIndex + 1] : undefined;
  if (track && !allTracks.includes(track)) {
    throw new Error(`Unknown track "${track}". Valid tracks: ${allTracks.join(', ')}`);
  }
  if (planPath && track && track !== 'plan-council') {
    throw new Error('--plan can only be used with --track plan-council');
  }
  return {track, profile, planPath};
}

async function runTrack(track: EvalTrack, options: RunnerOptions): Promise<EvalTaskResult[]> {
  switch (track) {
    case 'harness':
      return runHarnessTrack();
    case 'doctor':
      return await runDoctorTrack();
    case 'plan-council':
      return runPlanCouncilTrack(options.planPath);
  }
}

function buildRunResult(options: RunnerOptions, tasks: EvalTaskResult[], startedAt: string) {
  const finishedAt = new Date().toISOString();
  const score = tasks.reduce((sum, task) => sum + task.score, 0);
  const maxScore = tasks.reduce((sum, task) => sum + task.maxScore, 0);
  const tracks = options.track ? [options.track] : allTracks;
  const runId = `${finishedAt.replace(/[:.]/g, '-')}-${options.profile}-${tracks.join('-')}`;
  const failed = tasks.filter((task) => task.score < task.maxScore);
  const summary =
    failed.length === 0
      ? ['All AI eval tasks passed.']
      : failed.map((task) => `${task.track}/${task.taskId} scored ${task.score}/${task.maxScore}`);

  return {
    runId,
    startedAt,
    finishedAt,
    profile: options.profile,
    tracks,
    score,
    maxScore,
    tasks,
    summary,
  } satisfies EvalRunResult;
}

function printSummary(result: EvalRunResult, paths: {jsonPath: string; htmlPath: string}): void {
  console.log('\nIDS AI Eval');
  console.log('===========');
  console.log(`Score:   ${result.score}/${result.maxScore}`);
  console.log(`Profile: ${result.profile}`);
  console.log(`Tracks:  ${result.tracks.join(', ')}`);
  console.log(`JSON:    ${paths.jsonPath}`);
  console.log(`Report:  ${paths.htmlPath}`);
  for (const line of result.summary) {
    console.log(`- ${line}`);
  }
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const options = parseArgs();
  const tracks = options.track ? [options.track] : allTracks;
  const nestedTasks = await Promise.all(tracks.map((track) => runTrack(track, options)));
  const tasks = nestedTasks.flat();
  const result = buildRunResult(options, tasks, startedAt);
  const paths = writeRunArtifacts(result);
  printSummary(result, paths);
  if (result.score < result.maxScore) {
    process.exit(1);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
