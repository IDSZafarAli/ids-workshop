import {readFileSync} from 'node:fs';
import {basename, resolve} from 'node:path';
import type {EvalCheck, EvalTaskResult} from './types.js';

type PlanReview = {
  reviewer: string;
  score: number;
  maxScore: number;
  findings: string[];
};

const goodPlan = `
# Implementation Plan: Add Part Supplier Notes

## Overview
Add read-only supplier notes to the Part detail page by extending the backend response DTO and frontend display.

## Files Affected
1. apps/astra-apis/src/part/part.mapper.ts - include supplierNotes in response mapping
2. apps/astra-apis/src/part/dto/part-detail.dto.ts - add response field
3. apps/client-web/app/pages/parts/PartDetail.tsx - render localized field
4. apps/client-web/app/locales/en/parts.json - add label
5. apps/client-web/app/locales/fr/parts.json - add fallback label

## Impact Assessment
Breaking Changes: None.
Performance: No extra RavenDB query; field is already on the Part document.
Testing: Add mapper test and frontend render assertion.

## Step-by-Step Execution Plan
- [ ] Read backend and frontend standards
- [ ] Update DTO and mapper
- [ ] Update localized UI
- [ ] Run typecheck and targeted tests
`;

const riskyPlan = `
# Implementation Plan: Improve Parts

## Overview
Make parts better.

## Files Affected
TBD

## Step-by-Step Execution Plan
- [ ] Change backend
- [ ] Change frontend
`;

function reviewScope(plan: string): PlanReview {
  const findings: string[] = [];
  if (!/^# Implementation Plan:/m.test(plan)) {
    findings.push('Artifact is not titled as an Implementation Plan.');
  }
  if (!/## Files Affected[\s\S]*\d+\./.test(plan)) {
    findings.push('Files affected are not enumerated.');
  }
  if (!/Breaking Changes/i.test(plan)) {
    findings.push('Impact assessment does not mention breaking changes.');
  }
  if (!/Step-by-Step Execution Plan/i.test(plan)) {
    findings.push('Execution plan section is missing.');
  }
  return {reviewer: 'Scope Reviewer', score: 3 - findings.length, maxScore: 3, findings};
}

function reviewArchitecture(plan: string): PlanReview {
  const findings: string[] = [];
  if (/backend/i.test(plan) && !/DTO|mapper|service|controller/i.test(plan)) {
    findings.push('Backend plan mentions backend but no concrete layer responsibility.');
  }
  if (/frontend/i.test(plan) && !/locales|localized|i18n|component|page/i.test(plan)) {
    findings.push('Frontend plan does not mention UI/i18n/component impact.');
  }
  if (/RavenDB|query|database/i.test(plan) && !/locationId|index|Performance/i.test(plan)) {
    findings.push('Data access plan lacks tenant/performance considerations.');
  }
  return {reviewer: 'Architecture Reviewer', score: 3 - findings.length, maxScore: 3, findings};
}

function reviewTesting(plan: string): PlanReview {
  const findings: string[] = [];
  if (!/Testing/i.test(plan)) {
    findings.push('Testing strategy is missing.');
  }
  if (/mapper/i.test(plan) && !/mapper test/i.test(plan)) {
    findings.push('Mapper change lacks mapper-test mention.');
  }
  if (/frontend|component|page/i.test(plan) && !/render|Playwright|frontend|UI/i.test(plan)) {
    findings.push('Frontend behavior lacks verification detail.');
  }
  return {reviewer: 'Testing Reviewer', score: 3 - findings.length, maxScore: 3, findings};
}

function synthesizeCouncil(plan: string): PlanReview[] {
  return [reviewScope(plan), reviewArchitecture(plan), reviewTesting(plan)];
}

function evaluatePlan(taskId: string, title: string, plan: string, expectedPass: boolean) {
  const reviews = synthesizeCouncil(plan);
  const score = reviews.reduce((sum, review) => sum + Math.max(0, review.score), 0);
  const maxScore = reviews.reduce((sum, review) => sum + review.maxScore, 0);
  const passedCouncil = score / maxScore >= 0.75;
  const expectationMet = passedCouncil === expectedPass;
  const check: EvalCheck = {
    name: 'chairman synthesis matches expected plan quality',
    passed: expectationMet,
    score: expectationMet ? 1 : 0,
    maxScore: 1,
    summary: `Council scored ${score}/${maxScore}; expected ${expectedPass ? 'pass' : 'fail'}.`,
    details: [
      'Deterministic fallback mirrors the Claude council roles:',
      'scope-haiku, architecture-sonnet, testing-sonnet, chair-opus.',
      ...reviews.flatMap((review) =>
        review.findings.length > 0
          ? review.findings.map((finding) => `${review.reviewer}: ${finding}`)
          : [`${review.reviewer}: no findings`],
      ),
    ],
  };
  return buildTask(taskId, title, [check]);
}

function evaluateExternalPlan(planPath: string) {
  const absolutePath = resolve(process.cwd(), planPath);
  const plan = readFileSync(absolutePath, 'utf8');
  const reviews = synthesizeCouncil(plan);
  const score = reviews.reduce((sum, review) => sum + Math.max(0, review.score), 0);
  const maxScore = reviews.reduce((sum, review) => sum + review.maxScore, 0);
  const highRiskFinding = reviews.some((review) =>
    review.findings.some((finding) =>
      /not titled|not enumerated|testing strategy is missing|execution plan/i.test(finding),
    ),
  );
  const approved = score / maxScore >= 0.75 && !highRiskFinding;
  const check: EvalCheck = {
    name: 'deterministic chairman decision',
    passed: approved,
    score,
    maxScore,
    summary: approved
      ? `Council would approve ${planPath} before implementation.`
      : `Council requests revisions for ${planPath} before implementation.`,
    details: [
      `Decision: ${approved ? 'approve' : 'revise'}`,
      ...reviews.flatMap((review) =>
        review.findings.length > 0
          ? review.findings.map((finding) => `${review.reviewer}: ${finding}`)
          : [`${review.reviewer}: no findings`],
      ),
    ],
  };
  return {
    taskId: `plan-council-${basename(planPath)
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`,
    track: 'plan-council',
    title: `Council review: ${planPath}`,
    score,
    maxScore,
    checks: [check],
  } satisfies EvalTaskResult;
}

function buildTask(taskId: string, title: string, checks: EvalCheck[]): EvalTaskResult {
  const score = checks.reduce((sum, check) => sum + check.score, 0);
  const maxScore = checks.reduce((sum, check) => sum + check.maxScore, 0);
  return {taskId, track: 'plan-council', title, score, maxScore, checks};
}

export function runPlanCouncilTrack(planPath?: string): EvalTaskResult[] {
  if (planPath) {
    return [evaluateExternalPlan(planPath)];
  }

  return [
    evaluatePlan(
      'plan-council-good-plan',
      'Council approves a specific implementation plan',
      goodPlan,
      true,
    ),
    evaluatePlan(
      'plan-council-risky-plan',
      'Council rejects a vague implementation plan before coding',
      riskyPlan,
      false,
    ),
  ];
}
