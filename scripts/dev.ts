#!/usr/bin/env tsx

/**
 * Dev Tools — interactive CLI for starting the development environment
 *
 * Usage:
 *   npm run dev                  → interactive menu
 *   npm run dev -- start         → docker up → apis → web (full dev environment)
 *   npm run dev -- apis          → start astra-apis dev server only
 *   npm run dev -- web           → start client-web dev server only
 *   npm run dev -- stop          → stop all dev servers
 *   npm run dev -- status        → show dev environment status
 *
 * Shortcuts in package.json:
 *   npm run dev:apis             → tsx scripts/dev.ts apis
 *   npm run dev:web              → tsx scripts/dev.ts web
 */

import type {ChildProcess} from 'node:child_process';
import {execSync, spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import readline from 'node:readline';
import {BIN_BASH_PATH, BLUE, BOLD, GREEN, NC, RED, YELLOW} from './constants.js';

function loadDotEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

loadDotEnv(path.resolve(process.cwd(), '.env'));

const COMMANDS = {
  start: 'Start full dev environment: docker → apis → web (+ Doctor if enabled)',
  apis: 'Start astra-apis dev server only',
  web: 'Start client-web dev server only',
  doctor: 'Start IDS Doctor sidecar only (requires VITE_ENABLE_IDS_DOCTOR=true)',
  stop: 'Stop all running dev servers',
  status: 'Show dev environment status',
} as const;

type Command = keyof typeof COMMANDS;

function exec(cmd: string): void {
  execSync(cmd, {stdio: 'inherit', shell: BIN_BASH_PATH});
}

function _execWithEnv(cmd: string, env: NodeJS.ProcessEnv): void {
  execSync(cmd, {stdio: 'inherit', shell: BIN_BASH_PATH, env: {...process.env, ...env}});
}

function getPidsOnPort(port: string): string[] {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr ":${port}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return output
        .split(/\r?\n/)
        .filter((line) => line.includes('LISTENING'))
        .map((line) => line.trim().split(/\s+/).at(-1))
        .filter((pid): pid is string => Boolean(pid));
    }

    const output = execSync(`lsof -ti:${port}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: BIN_BASH_PATH,
    });
    return output
      .split(/\r?\n/)
      .map((pid) => pid.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function spawnDoctor(): ChildProcess[] {
  const port = process.env['IDS_DOCTOR_PORT'] ?? '3999';
  const pids = getPidsOnPort(port);
  if (pids.length > 0) {
    console.log(
      `${YELLOW}[Doctor]${NC} IDS Doctor already appears to be running on port ${port} (pid ${pids.join(', ')})`,
    );
    return [];
  }

  console.log(`${BLUE}[Doctor]${NC} Starting IDS Doctor sidecar on port ${port}...`);
  const server = spawn('nx', ['serve', 'astra-dev-doctor'], {
    stdio: 'inherit',
    shell: true,
    env: {...process.env, NODE_NO_WARNINGS: '1', NX_TUI: 'false'},
  });
  server.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`\n${YELLOW}⚠ IDS Doctor exited with code ${code} — continuing without it${NC}`);
    }
  });

  console.log(`${BLUE}[Doctor]${NC} Starting widget watcher (hot reload)...`);
  const widget = spawn('nx', ['run', '@ids-ai-skeleton/astra-dev-doctor:watch-widget'], {
    stdio: 'inherit',
    shell: true,
    env: {...process.env, NX_TUI: 'false'},
  });
  widget.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`\n${YELLOW}⚠ Widget watcher exited with code ${code}${NC}`);
    }
  });

  return [server, widget];
}

function runWeb(): void {
  exec('nx dev client-web');
}

function runStart(): void {
  const doctorEnabled = process.env['VITE_ENABLE_IDS_DOCTOR'] === 'true';
  const totalSteps = doctorEnabled ? 4 : 3;

  // Step 1: Start Docker (blocking — must be up before apps start)
  console.log(`\n${BLUE}[1/${totalSteps}]${NC} Starting Docker containers...`);
  try {
    exec('docker-compose up -d');
    console.log(`${GREEN}✓ Docker containers running${NC}\n`);
  } catch {
    console.error(`${RED}✗ Docker failed to start — aborting${NC}`);
    process.exit(1);
  }

  // Step 2: Spawn astra-apis (background, non-blocking)
  console.log(`${BLUE}[2/${totalSteps}]${NC} Starting astra-apis...`);
  const apis = spawn('nx', ['serve', 'astra-apis'], {
    stdio: 'inherit',
    shell: true,
    env: {...process.env, NODE_NO_WARNINGS: '1'},
  });

  apis.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n${RED}✗ astra-apis exited unexpectedly with code ${code}${NC}`);
    }
  });

  // Step 3: Spawn client-web (background, non-blocking)
  console.log(`${BLUE}[3/${totalSteps}]${NC} Starting client-web...`);
  const web = spawn('nx', ['dev', 'client-web'], {
    stdio: 'inherit',
    shell: true,
  });

  web.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n${RED}✗ client-web exited unexpectedly with code ${code}${NC}`);
    }
  });

  // Step 4 (optional): Spawn IDS Doctor sidecar + widget watcher
  const children = [apis, web];
  if (doctorEnabled) {
    console.log(`${BLUE}[4/${totalSteps}]${NC} Starting IDS Doctor sidecar + widget watcher...`);
    children.push(...spawnDoctor());
  } else {
    console.log(`${YELLOW}  IDS Doctor disabled (set VITE_ENABLE_IDS_DOCTOR=true to enable)${NC}`);
  }

  console.log(`\n${GREEN}Dev environment starting — press Ctrl+C to stop all${NC}\n`);

  // Graceful shutdown on Ctrl+C
  process.on('SIGINT', () => {
    console.log(`\n${YELLOW}Stopping dev servers...${NC}`);
    for (const child of children) {
      child.kill('SIGTERM');
    }
    process.exit(0);
  });

  // Keep the process alive until all children exit
  Promise.all(
    children.map((c) => new Promise<void>((resolve) => c.on('exit', () => resolve()))),
  ).then(() => {
    console.log(`\n${YELLOW}All dev servers have exited${NC}`);
    process.exit(0);
  });
}

function run(command: Command): void {
  switch (command) {
    case 'start': {
      runStart();
      break;
    }
    case 'apis': {
      exec('nx serve astra-apis');
      break;
    }
    case 'web': {
      runWeb();
      break;
    }
    case 'doctor': {
      if (process.env['VITE_ENABLE_IDS_DOCTOR'] !== 'true') {
        console.warn(`${YELLOW}Set VITE_ENABLE_IDS_DOCTOR=true in your .env to enable Doctor${NC}`);
      }
      const doctorProcs = spawnDoctor();
      if (doctorProcs.length === 0) {
        break;
      }
      console.log(`\n${GREEN}IDS Doctor starting — press Ctrl+C to stop${NC}\n`);
      process.on('SIGINT', () => {
        for (const p of doctorProcs) {
          p.kill('SIGTERM');
        }
        process.exit(0);
      });
      Promise.all(
        doctorProcs.map((p) => new Promise<void>((resolve) => p.on('exit', () => resolve()))),
      ).then(() => {
        process.exit(0);
      });
      break;
    }
    case 'stop': {
      exec('bash ./scripts/stop-dev-servers.sh');
      break;
    }
    case 'status': {
      exec('bash ./scripts/dev-status.sh');
      break;
    }
  }
}

function showMenu(): void {
  if (!process.stdin.isTTY) {
    console.error(`${RED}Interactive menu requires a TTY.${NC}`);
    console.error(`Pass a command directly: npm run dev -- <command>`);
    console.error(`Available: ${Object.keys(COMMANDS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n${BOLD}${BLUE}Dev Tools${NC}`);
  console.log('═'.repeat(55));

  const keys = Object.keys(COMMANDS) as Command[];
  for (const [i, key] of keys.entries()) {
    console.log(`  ${BLUE}${i + 1}.${NC} ${key.padEnd(10)} ${COMMANDS[key]}`);
  }
  console.log('');

  const readLineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  readLineInterface.question(`Select option (1-${keys.length}) or Ctrl+C to exit: `, (answer) => {
    readLineInterface.close();
    const index: number = Number.parseInt(answer, 10) - 1;
    if (index >= 0 && index < keys.length) {
      run(keys[index]);
    } else {
      console.log(`${RED}Invalid option${NC}`);
    }
  });
}

const arg = process.argv[2] as Command | undefined;
if (arg) {
  if (!(arg in COMMANDS)) {
    console.error(`${RED}Unknown command: ${arg}${NC}`);
    console.error(`Available: ${Object.keys(COMMANDS).join(', ')}`);
    process.exit(1);
  }
  run(arg);
} else {
  showMenu();
}
