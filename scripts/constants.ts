// Node's child_process spawns through CreateProcess on Windows and does not
// translate POSIX paths like /bin/bash. Override with env BASH_PATH if your
// Git Bash lives elsewhere than the default install location.
export const BIN_BASH_PATH =
  process.env.BASH_PATH ??
  (process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : '/bin/bash');

export const BOLD = '\u001b[1m';
export const RED = '\u001b[31m';
export const GREEN = '\u001b[32m';
export const YELLOW = '\u001b[33m';
export const BLUE = '\u001b[34m';
export const NC = '\u001b[0m';

export const APP_BASE_URL = 'http://localhost:3004';
export const API_BASE_URL = 'http://localhost:3000';
export const LOGTO_BASE_URL = 'http://localhost:3001';
export const RAVENDB_ALIVE_URL = 'http://localhost:3333';

export const TEST_USER_EMAIL = 'alice@acme-rv.com';
export const TEST_USER_PASSWORD = 'xyab12dE';
