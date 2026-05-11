export type EvalTrack = 'harness' | 'doctor' | 'plan-council';

export type EvalCheck = {
  name: string;
  passed: boolean;
  score: number;
  maxScore: number;
  summary: string;
  details?: string[];
};

export type EvalTaskResult = {
  taskId: string;
  track: EvalTrack;
  title: string;
  score: number;
  maxScore: number;
  checks: EvalCheck[];
};

export type EvalRunResult = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  profile: string;
  tracks: EvalTrack[];
  score: number;
  maxScore: number;
  tasks: EvalTaskResult[];
  summary: string[];
};

export type RunnerOptions = {
  track?: EvalTrack;
  profile: string;
  planPath?: string;
};
