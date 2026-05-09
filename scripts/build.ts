#!/usr/bin/env tsx
/**
 * Build Tools — interactive CLI for building and cleaning
 *
 * Usage:
 *   npm run build                  → interactive menu
 *   npm run build -- all           → build client-web + astra-apis
 *   npm run build -- apis          → build astra-apis only
 *   npm run build -- web           → build client-web only
 *   npm run build -- data-models   → build shared @ids/data-models lib
 *   npm run build -- clean         → reset nx cache + remove dist folders
 */

import {execSync} from 'node:child_process';
import readline from 'node:readline';
import {BIN_BASH_PATH, BLUE, BOLD, GREEN, NC, RED} from './constants.js';

const COMMANDS = {
  all: 'Build client-web + astra-apis',
  apis: 'Build astra-apis only',
  web: 'Build client-web only',
  'data-models': 'Build shared @ids/data-models lib',
  clean: 'Reset nx cache + remove all dist folders',
} as const;

type Command = keyof typeof COMMANDS;

function exec(cmd: string): void {
  execSync(cmd, {stdio: 'inherit', shell: BIN_BASH_PATH});
}

function run(command: Command): void {
  switch (command) {
    case 'all': {
      console.log(`\n${BLUE}Building all apps...${NC}`);
      exec('nx build client-web && nx build astra-apis');
      console.log(`\n${GREEN}✓ All apps built${NC}`);
      break;
    }
    case 'apis': {
      console.log(`\n${BLUE}Building astra-apis...${NC}`);
      exec('nx build astra-apis');
      console.log(`\n${GREEN}✓ astra-apis built${NC}`);
      break;
    }
    case 'web': {
      console.log(`\n${BLUE}Building client-web...${NC}`);
      exec('nx build client-web');
      console.log(`\n${GREEN}✓ client-web built${NC}`);
      break;
    }
    case 'data-models': {
      console.log(`\n${BLUE}Building @ids/data-models...${NC}`);
      exec('nx build @ids/data-models');
      console.log(`\n${GREEN}✓ data-models built${NC}`);
      break;
    }
    case 'clean': {
      console.log(`\n${BLUE}Cleaning build artifacts...${NC}`);
      exec('nx reset && rm -rf apps/astra-apis/dist apps/client-web/dist apps/client-web/.vite');
      console.log(`\n${GREEN}✓ Clean complete${NC}`);
      break;
    }
  }
}

function showMenu(): void {
  if (!process.stdin.isTTY) {
    console.error(`${RED}Interactive menu requires a TTY.${NC}`);
    console.error(`Pass a command directly: npm run build -- <command>`);
    console.error(`Available: ${Object.keys(COMMANDS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n${BOLD}${BLUE}Build Tools${NC}`);
  console.log('═'.repeat(55));

  const keys = Object.keys(COMMANDS) as Command[];
  for (const [i, key] of keys.entries()) {
    console.log(`  ${BLUE}${i + 1}.${NC} ${key.padEnd(16)} ${COMMANDS[key]}`);
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

const main = async () => {
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
};

main().catch((err) => {
  console.error(`${RED}Error:${NC}`, err instanceof Error ? err.message : err);
  process.exit(1);
});
