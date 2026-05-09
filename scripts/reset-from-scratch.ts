#!/usr/bin/env tsx
/**
 * Reset From Scratch — Complete development environment reset
 *
 * This script orchestrates a full reset of the development environment:
 *   0. Ensure Docker Desktop is running (auto-starts it on Windows if needed)
 *   1. Stop all running dev servers
 *   2. Clean old build artifacts (dist, build, nx cache)
 *   3. Tear down Docker containers and volumes
 *   4. Bring Docker back up
 *   5. Import Logto init database
 *   6. Seed Logto test users and organizations
 *   7. Sync M2M credentials
 *   8. Ensure RavenDB database exists
 *   9. Start APIs server
 *   10. Wait for APIs to be ready
 *   11. Run full database reset (clear + sync + seed)
 *   12. Start client-web dev server
 *
 * Usage:
 *   npm run dev:reset-from-scratch
 */

import {type ChildProcess, execSync, spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {BIN_BASH_PATH, BLUE, BOLD, GREEN, NC, RED, YELLOW} from './constants.js';

const API_ENDPOINT = 'http://localhost:3000';
const LOGTO_ENDPOINT = 'http://localhost:3001';

function exec(cmd: string): void {
  execSync(cmd, {stdio: 'inherit', shell: BIN_BASH_PATH});
}

function execSilent(cmd: string): void {
  execSync(cmd, {stdio: 'ignore', shell: BIN_BASH_PATH});
}

async function ensureDockerRunning(): Promise<void> {
  try {
    execSync('docker info', {stdio: 'ignore'});
    return;
  } catch {
    // Docker daemon not responding
  }

  if (process.platform !== 'win32') {
    console.error(
      `${RED}❌ Docker is not running. Please start Docker and re-run this script.${NC}`,
    );
    process.exit(1);
  }

  console.log(`${YELLOW}⊳ Docker Desktop is not running — attempting to start it...${NC}`);

  const dockerPaths = [
    'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Docker\\Docker Desktop.exe` : null,
  ].filter(Boolean) as string[];

  let launched = false;
  for (const dockerPath of dockerPaths) {
    if (fs.existsSync(dockerPath)) {
      spawn(dockerPath, [], {detached: true, stdio: 'ignore'}).unref();
      console.log(`${BLUE}  Starting: ${dockerPath}${NC}`);
      launched = true;
      break;
    }
  }

  if (!launched) {
    console.error(
      `${RED}❌ Could not find Docker Desktop. Please start it manually and re-run.${NC}`,
    );
    process.exit(1);
  }

  console.log(`${BLUE}Waiting for Docker Desktop to start (this may take up to 2 minutes)...${NC}`);
  for (let attempt = 1; attempt <= 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      execSync('docker info', {stdio: 'ignore'});
      console.log(`${GREEN}✓ Docker Desktop is running${NC}\n`);
      return;
    } catch {
      process.stdout.write(`  Waiting... ${attempt * 2}s\r`);
    }
  }

  console.error(`\n${RED}❌ Docker Desktop did not start within 2 minutes.${NC}`);
  console.error(`  Please start Docker Desktop manually and re-run this script.`);
  process.exit(1);
}

function releaseConflictingDockerPorts(): void {
  // Ports our docker-compose uses — stop any foreign containers holding them
  // before we try to bring our stack up.
  const ports = ['3333', '3001', '3002', '8025', '1025'];
  for (const port of ports) {
    try {
      const ids = execSync(`docker ps -q --filter "publish=${port}"`, {encoding: 'utf8'}).trim();
      if (ids) {
        console.log(`${YELLOW}⊳ Stopping container on port ${port} (${ids.slice(0, 12)})...${NC}`);
        execSync(`docker stop ${ids}`, {stdio: 'ignore'});
      }
    } catch {
      // ignore — port not in use or docker not available
    }
  }
}

async function waitForLogto(maxAttempts = 60, delayMs = 2000): Promise<boolean> {
  console.log(`${BLUE}Waiting for Logto to be ready...${NC}`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${LOGTO_ENDPOINT}/oidc/.well-known/openid-configuration`);
      if (response.ok) {
        console.log(`${GREEN}✓ Logto is ready${NC}`);
        return true;
      }
    } catch {
      // Logto not ready yet, continue waiting
    }
    process.stdout.write(`  Attempt ${attempt}/${maxAttempts}...\r`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function waitForApi(maxAttempts = 30, delayMs = 1000): Promise<boolean> {
  console.log(`${BLUE}Waiting for APIs to be ready...${NC}`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/SystemHealth/ping`);
      if (response.ok) {
        console.log(`${GREEN}✓ APIs are ready${NC}`);
        return true;
      }
    } catch {
      // API not ready yet, continue waiting
    }
    process.stdout.write(`  Attempt ${attempt}/${maxAttempts}...\r`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log(`\n${BOLD}${BLUE}═══════════════════════════════════════════════════════════${NC}`);
  console.log(`${BOLD}${BLUE}  Reset From Scratch — Complete Development Environment Reset${NC}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════${NC}\n`);

  let apisProcess: ChildProcess | null = null;
  let webProcess: ChildProcess | null = null;

  try {
    // Step 0: Create/refresh .env from .env.example (full reset always starts clean)
    const envPath = path.resolve(process.cwd(), '.env');
    const envExamplePath = path.resolve(process.cwd(), '.env.example');
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      console.log(`${GREEN}✓ Created .env from .env.example${NC}\n`);
    } else if (!fs.existsSync(envPath)) {
      console.error(`${RED}✗ No .env or .env.example found. Cannot proceed.${NC}`);
      process.exit(1);
    } else {
      console.log(`${YELLOW}⊳ No .env.example found — using existing .env${NC}\n`);
    }

    // Load .env variables into process.env so all child processes inherit them
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#')) {
        continue;
      }
      const match = line.match(/^(\w+)=(.*)$/);
      if (match) {
        let value = match[2];
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[match[1]] ??= value;
      }
    }

    // Step 1: Stop all dev servers
    console.log(`${BLUE}[1/12]${NC} Stopping all dev servers...`);
    try {
      execSilent('bash ./scripts/stop-dev-servers.sh');
      console.log(`${GREEN}✓ Dev servers stopped${NC}\n`);
    } catch {
      console.log(`${YELLOW}⊳ No running dev servers found${NC}\n`);
    }

    // Step 2: Clean old build artifacts and Nx cache
    console.log(`${BLUE}[2/12]${NC} Cleaning old build artifacts and Nx cache...`);
    try {
      execSilent('rm -rf apps/astra-apis/dist apps/client-web/build');
      execSilent('npx nx reset');
      console.log(`${GREEN}✓ Build artifacts and Nx cache cleaned${NC}\n`);
    } catch {
      console.log(`${YELLOW}⊳ No build artifacts to clean${NC}\n`);
    }

    // Pre-step: Ensure Docker Desktop is running before any Docker commands
    console.log(`${BLUE}Checking Docker Desktop...${NC}`);
    await ensureDockerRunning();

    // Step 3: Tear down Docker
    console.log(`${BLUE}[3/12]${NC} Tearing down Docker containers and volumes...`);
    exec('docker compose down -v');
    releaseConflictingDockerPorts();
    console.log(`${GREEN}✓ Docker containers removed${NC}\n`);

    // Step 4: Bring Docker back up
    console.log(`${BLUE}[4/12]${NC} Starting Docker containers...`);
    exec('tsx scripts/docker.ts up');
    console.log(`${GREEN}✓ Docker containers running${NC}\n`);

    // Step 5: Import Logto init database
    console.log(`${BLUE}[5/12]${NC} Importing Logto init database...`);
    exec('tsx scripts/logto.ts logto:db:import-init');
    console.log(`${GREEN}✓ Logto database initialized${NC}\n`);

    // Wait for Logto to be fully ready after DB import
    const isLogtoReady = await waitForLogto();
    if (!isLogtoReady) {
      console.error(`${RED}✗ Logto failed to become ready after DB import${NC}`);
      process.exit(1);
    }
    console.log();

    // Step 6: Seed Logto test users and organizations
    console.log(`${BLUE}[6/12]${NC} Seeding Logto test users and organizations...`);
    exec('tsx scripts/logto.ts logto:seed');
    console.log(`${GREEN}✓ Logto test data seeded${NC}\n`);

    // Wait for Logto to commit the changes
    console.log(`${BLUE}Waiting for Logto to commit organizations...${NC}`);
    await delay(3000); // 3 second delay to ensure Logto DB commits
    console.log(`${GREEN}✓ Ready to proceed${NC}\n`);

    // Step 7: Sync M2M credentials from freshly imported Logto DB into .env
    console.log(`${BLUE}[7/12]${NC} Updating Logto M2M credentials in .env...`);
    exec('tsx scripts/logto.ts logto:update-creds');
    console.log(`${GREEN}✓ M2M credentials updated${NC}\n`);

    // Step 8: Ensure RavenDB database exists
    console.log(`${BLUE}[8/12]${NC} Ensuring RavenDB database exists...`);
    exec('tsx scripts/ensure_ids_dms_db_exists.ts');
    console.log(`${GREEN}✓ RavenDB database ready${NC}\n`);

    // Step 9: Start APIs server in background
    console.log(`${BLUE}[9/12]${NC} Starting astra-apis server...`);

    // Re-read .env so the server gets fresh M2M credentials from step 7
    const envFileContent = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
    const freshEnv: Record<string, string> = {...process.env} as Record<string, string>;
    freshEnv.NODE_NO_WARNINGS = '1';
    for (const line of envFileContent.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) {
        continue;
      }
      const match = line.match(/^(\w+)=(.*)$/);
      if (match) {
        let value = match[2];
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        freshEnv[match[1]] = value;
      }
    }

    apisProcess = spawn('npx nx serve astra-apis', [], {
      stdio: 'pipe',
      shell: BIN_BASH_PATH,
      detached: false,
      env: freshEnv,
    });

    apisProcess.on('error', (err) => {
      console.error(`${RED}✗ Failed to start APIs: ${err.message}${NC}`);
    });

    // Step 10: Wait for APIs to be ready
    console.log(`${BLUE}[10/12]${NC} Waiting for APIs to be ready...`);
    const isReady = await waitForApi(120, 1000);
    if (!isReady) {
      console.error(`${RED}✗ APIs failed to become ready${NC}`);
      process.exit(1);
    }
    console.log(`${GREEN}✓ APIs server running${NC}\n`);

    // Step 11: Run full database reset (non-interactive — --yes skips confirm)
    console.log(`${BLUE}[11/12]${NC} Running full database reset (clear + sync + seed)...\n`);
    exec('tsx scripts/db.ts full-reset --yes');
    console.log(`\n${GREEN}✓ Database reset complete${NC}\n`);

    // Step 12: Start client-web dev server in background
    console.log(`${BLUE}[12/12]${NC} Starting client-web dev server...`);
    webProcess = spawn('npx nx dev client-web', [], {
      stdio: 'pipe',
      shell: BIN_BASH_PATH,
      detached: false,
      env: freshEnv,
    });

    webProcess.on('error', (err) => {
      console.error(`${RED}✗ Failed to start client-web: ${err.message}${NC}`);
    });

    console.log(`${GREEN}✓ client-web starting at http://localhost:3004${NC}\n`);

    // Success message
    console.log(`${BOLD}${GREEN}═══════════════════════════════════════════════════════════${NC}`);
    console.log(`${BOLD}${GREEN}  🎉 Reset from scratch completed successfully!${NC}`);
    console.log(
      `${BOLD}${GREEN}═══════════════════════════════════════════════════════════${NC}\n`,
    );

    console.log(`${BLUE}Services running:${NC}`);
    console.log(`  ✓ Docker containers (RavenDB, PostgreSQL/Logto)`);
    console.log(`  ✓ astra-apis    → http://localhost:3000`);
    console.log(`  ✓ client-web    → http://localhost:3004 (starting...)\n`);

    console.log(`${BLUE}Test users available:${NC}`);
    console.log(`  • mike@acme-rv.com / xyab12dE`);
    console.log(`  • alice@acme-rv.com / xyab12dE`);
    console.log(`  • sarah@acme-rv.com / xyab12dE`);
    console.log(`  • tim@acme-rv.com / xyab12dE`);
    console.log(`  • admin@acme-rv.com / Admin123!\n`);

    console.log(`${YELLOW}To stop all servers:${NC}`);
    console.log(`  npm run dev -- stop\n`);

    // Keep both servers running — user can stop them with dev:stop
  } catch (error) {
    console.error(`\n${RED}✗ Reset failed: ${error}${NC}`);
    if (apisProcess) {
      apisProcess.kill('SIGTERM');
    }
    if (webProcess) {
      webProcess.kill('SIGTERM');
    }
    process.exit(1);
  }
}

main();
