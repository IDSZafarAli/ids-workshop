# Pull Request Review and Validation Guide

Follow below steps to perform PR review and validations.

## 1. Requirements Implementation
Find Jira number from Branch Name (Branch name: IDSMOD-22_UpdateDocumentations) and verify all requirements are implemented in PR from Jira story/task.

## 2. Coding Standards
Verify coding **standards** are implemented properly for all APIs, Web, Unit Tests and E2E Tests.

## 3. Add/Update Documentation
Feature documentation should be added or updated in docs folder.

## 4. No Merge Conflicts and CI/CD Pipelines
Ensure there are no merge conflicts, all test (unit and E2E) and CI/CD pipelines should pass.

---
## 5. Code Review AI Agent Verification
- Select **ids-code-review** agent in agents list.
- Prompt **Please Review** in Query and Enter. It will ask to select code review scope -> **Enter your scope** in Query and Enter.
- It will ask branch comparision -> **give your branch name** in Query and Enter.
- It will generate report for review. You can go through it and add your review and highlighted points accordingly.

## 6. Running Review Branch Locally
Assuming Project setup is already completed, perform below steps on VS Code Terminal to run Branch locally for verification.
- `git checkout [Branch Name]`
- `git pull`
- `npm run docker:down`
- `docker compose down --volumes`
- `npm run docker:up`
- `npm run logto:db:import-init-config` *(This is a one-time setup step. Skip this command if you have already executed it once in this project.)
- `npm run dev:apis`
- `npm run demo:full-reset`
- `npm run dev:web`
- Open Browser and login with credentials identified in .env file (`/root/work/ids-cloud-dms/.env`)

**Note:** For Project Setup follow document **[training/02-getting-started.md](../training/02-getting-started.md)**.

---
## 7. Review Comments Resolution
For the final PR review, ensure all comments are resolved or answered appropriately. Please reference any tasks/stories in comments that are planned to be addressed in the future.