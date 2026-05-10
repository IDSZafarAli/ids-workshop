/**
 * Check Standards
 *
 * Comprehensive grep-based standards checker for mechanically verifiable rules.
 *
 * Covers rules derived from:
 * - coding-standards-core.md
 * - coding-standards-backend.md
 * - coding-standards-frontend.md
 * - file-upload-standards.md
 * - ravendb-document-design.md
 *
 * Expected params:
 * - --changed-only                  Optional. Restrict checks to git-changed files
 *
 * Usage:
 * - npm run check:standards
 * - npm run check:standards:changed
 *
 * Notes:
 * - Exit code 0 means pass; exit code 1 means violations were found.
 * - Deeper semantic rules still rely on code review and agent/human judgment.
 */

import {execSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {extname, join, relative, sep} from 'node:path';

// ─── Changed-only mode ────────────────────────────────────────────────────────

const CHANGED_ONLY = process.argv.includes('--changed-only');

function getChangedFilePaths(): Set<string> | null {
  if (!CHANGED_ONLY) {
    return null;
  }
  try {
    const run = (cmd: string): string =>
      execSync(cmd, {cwd: ROOT_EARLY, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']}).trim();
    const lines = [
      ...run('git diff --cached --name-only').split('\n'),
      ...run('git diff --name-only').split('\n'),
      ...run('git ls-files --others --exclude-standard').split('\n'),
    ];
    const result = new Set<string>();
    for (const line of lines) {
      if (line.trim()) {
        result.add(join(ROOT_EARLY, line.trim()));
      }
    }
    return result;
  } catch {
    return null;
  }
}

const ROOT_EARLY = process.cwd();
const changedPaths = getChangedFilePaths();

function scopeToChanged(files: string[]): string[] {
  return changedPaths ? files.filter((f) => changedPaths.has(f)) : files;
}

// ─── Output ───────────────────────────────────────────────────────────────────

const c = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  header: (s: string) => `\n\x1b[1;34m── ${s} ──\x1b[0m`,
};

let failed = false;

// ─── File Discovery ───────────────────────────────────────────────────────────

const SKIP_DIR = /node_modules|[/\\]dist[/\\]|[/\\]build[/\\]|[/\\]out-tsc[/\\]/;

function findFiles(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const results: string[] = [];
  function walk(current: string): void {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (SKIP_DIR.test(full)) {
        continue;
      }
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (exts.includes(extname(full))) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

// ─── File Sets ────────────────────────────────────────────────────────────────

const ROOT = ROOT_EARLY;
const IS_TEST = /\.(test|spec)\.(tsx?|ts)$|[/\\]__tests?__[/\\]|[/\\]__test__[/\\]/;

const allAppFiles = scopeToChanged(
  findFiles(join(ROOT, 'apps'), ['.ts', '.tsx']).filter(
    (f) => !IS_TEST.test(f) && !f.includes('out-tsc'),
  ),
);

// Backend
const backendSrc = allAppFiles.filter((f) => f.includes(join('astra-apis', 'src') + sep));
const backendServiceFiles = backendSrc.filter((f) => f.endsWith('.service.ts'));
const _backendControllerFiles = backendSrc.filter((f) => f.endsWith('.controller.ts'));
const _backendRepositoryFiles = backendSrc.filter((f) => f.endsWith('.repository.ts'));
const backendMapperFiles = backendSrc.filter((f) => f.endsWith('.mapper.ts'));
const backendEntityDtoFiles = backendSrc.filter((f) => /\.(entity|dto)\.ts$/.test(f));
const backendClassFiles = backendSrc.filter((f) =>
  /\.(service|controller|repository|guard|interceptor)\.ts$/.test(f),
);

// Frontend
const IS_FE_EXCEPTION =
  /core[/\\]formatters|core[/\\]hooks[/\\]useFormat|(MoneyField|DecimalField|DateDisplay)\.tsx|core[/\\]services[/\\](networkMonitor|apiClient)\.ts/;
const frontendFeature = allAppFiles.filter(
  (f) => f.includes(join('client-web', 'app') + sep) && !IS_FE_EXCEPTION.test(f),
);
const frontendTsx = frontendFeature.filter((f) => f.endsWith('.tsx'));

// E2E
const e2eFiles = scopeToChanged(findFiles(join(ROOT, 'apps', 'client-web-e2e'), ['.ts', '.tsx']));

// ─── Check Helpers ────────────────────────────────────────────────────────────

type LineViolation = {rel: string; line: number; text: string};
type FileViolation = {rel: string};

function grepLines(files: string[], pattern: RegExp, excludeLine?: RegExp): LineViolation[] {
  const out: LineViolation[] = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (excludeLine?.test(line)) {
        continue;
      }
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) {
        continue;
      }
      // Strip trailing line comments before testing — keeps URL strings ('://') intact
      // by only matching '//' that is NOT preceded by ':'.
      const codeOnly = line.replace(/(^|[^:])\/\/.*$/, '$1');
      if (pattern.test(codeOnly)) {
        out.push({rel: relative(ROOT, file), line: i + 1, text: line.trim()});
      }
    }
  }
  return out;
}

// Detects in-memory chain calls (filter/sort) on RavenDB .all() results.
// Only flags if the chain method appears within 6 lines after .all(), and
// excludes DTO-level calls like dto.vendors.filter(...) which are legitimate.
function checkChainAfterAll(files: string[], chainPattern: RegExp): FileViolation[] {
  const results: FileViolation[] = [];
  const dtoArrayExclude = /\bdto\.\w+\.\w+\(|\bDto\.\w+\.\w+\(/;
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!/\.all\(\)/.test(lines[i])) {
        continue;
      }
      for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
        if (chainPattern.test(lines[j]) && !dtoArrayExclude.test(lines[j])) {
          results.push({rel: relative(ROOT, f)});
          break;
        }
      }
    }
  }
  return results;
}

function countPerFile(files: string[], pattern: RegExp): Array<{rel: string; count: number}> {
  return files
    .map((f) => ({
      rel: relative(ROOT, f),
      count: (readFileSync(f, 'utf8').match(pattern) ?? []).length,
    }))
    .filter((r) => r.count > 1);
}

function report(
  title: string,
  rule: string,
  violations: Array<{rel: string; line?: number; text?: string}>,
): void {
  process.stdout.write(c.bold(`→ ${title}\n`));
  if (violations.length === 0) {
    process.stdout.write(c.green('   ok\n'));
    return;
  }
  failed = true;
  process.stdout.write(c.red(`   VIOLATION — ${rule}\n`));
  for (const v of violations) {
    const loc = v.line != null ? `${v.rel}:${v.line}` : v.rel;
    const excerpt = v.text ? `  →  ${v.text}` : '';
    process.stdout.write(`     ${loc}${excerpt}\n`);
  }
  process.stdout.write('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE — TypeScript (both layers)
// coding-standards-core.md
// ─────────────────────────────────────────────────────────────────────────────
process.stdout.write(`${c.header('Core TypeScript')}\n`);

report(
  "Explicit 'any' type",
  "Never use 'any' — use 'unknown' when the type is genuinely unknown (coding-standards-core.md).",
  grepLines(allAppFiles, /(: any[^a-zA-Z0-9_]|: any$|<any>| as any[^a-zA-Z0-9_])/),
);

report(
  'Project-internal barrel imports (from index files)',
  'Import directly from the source file. Only @ids/data-models barrel is allowed (coding-standards-core.md).',
  grepLines(allAppFiles, /from ['"](\.\.?)[/\\]index['"]/),
);

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND — NestJS & RavenDB
// coding-standards-backend.md
// ─────────────────────────────────────────────────────────────────────────────
process.stdout.write(`${c.header('Backend — NestJS & RavenDB')}\n`);

report(
  'Private methods with _ prefix (backend)',
  "Private methods use plain camelCase — 'private validateCustomer()' not 'private _validateCustomer()'. Only variables/deps get _ (coding-standards-backend.md §5).",
  grepLines(
    backendSrc,
    /private\s+(async\s+|static\s+)*(override\s+)?_[a-zA-Z][a-zA-Z0-9]*\s*(<[^>]*>)?\s*\(/,
  ),
);

report(
  'Private variables missing _ prefix (backend)',
  "Private variables use _ prefix — 'private readonly _service: Service' not 'private readonly service: Service' (coding-standards-backend.md §5).",
  grepLines(backendSrc, /private\s+readonly\s+(?!_)[a-zA-Z]/),
);

report(
  'Private static variables missing _ prefix (backend)',
  "Private static variables also require _ prefix — 'private static readonly _MAX_SIZE = 10' not 'private static readonly MAX_SIZE = 10'. Rule 5 applies to both instance and static private variables (coding-standards-backend.md §5).",
  grepLines(backendSrc, /private\s+static\s+readonly\s+(?!_)[a-zA-Z]/),
);

report(
  'Backend interfaces missing I prefix',
  "All backend interfaces must start with I — 'ICustomerRepository' not 'CustomerRepository' (coding-standards-backend.md §6).",
  grepLines(backendSrc, /export interface (?!I[A-Z])[A-Z]/),
);

report(
  'Missing explicit access modifier on class methods (backend)',
  "Always declare public, private, or protected on all class methods — 'public async findAll()' not 'async findAll()' (coding-standards-backend.md).",
  grepLines(
    backendClassFiles,
    /^ {2}(?!public\s|private\s|protected\s|constructor\s*[(<@]|@|\/\/|\/\*|\*)(?:(?:async|static|override|abstract)\s+)?[a-z][a-zA-Z0-9]*\s*(?:<[^>]*>)?\s*\(/,
  ),
);

report(
  'Arrow function properties in service/controller classes',
  "Use traditional method syntax in NestJS classes — 'public async create()' not 'create = async () =>' (coding-standards-backend.md).",
  grepLines(backendClassFiles, /^\s+[a-z][a-zA-Z0-9]+ = (async )?\(.*\) =>/),
);

report(
  "Wrong partial update guard 'if (!dto.field)'",
  "Use 'if (dto.field !== undefined)' — '!dto.field' treats 0, false, and '' as not provided, breaking three-way update semantics (coding-standards-backend.md §8).",
  grepLines(backendSrc, /if \(!dto\./),
);

report(
  "'?? undefined' in mapper files",
  "Mappers return null for absent optional fields — use '?? null', not '?? undefined'. RavenDB absent fields must stay present as null in JSON (coding-standards-backend.md DTO §).",
  grepLines(backendMapperFiles, /\?\? undefined/),
);

report(
  'Mapper functions inside service files',
  'Mapper functions (toXxxDto) must live in a dedicated *.mapper.ts file, not inside the service (coding-standards-backend.md).',
  grepLines(backendServiceFiles, /(^export )?(async )?function to[A-Z][a-zA-Z]*Dto[^(]*\(/),
);

report(
  '.take(1) instead of .firstOrNull() (backend)',
  'Use .firstOrNull() instead of .take(1).all() when fetching a single document by query (coding-standards-backend.md RavenDB §).',
  grepLines(backendSrc, /\.take\(1\)/),
);

report(
  'In-memory .filter() after RavenDB .all() (service files)',
  'Push filtering into the RavenDB query with .whereEquals() / .search(). Loading all documents then filtering in JS is an unbounded fetch (coding-standards-backend.md RavenDB §).',
  checkChainAfterAll(backendServiceFiles, /\.filter\(/),
);

report(
  'In-memory .sort() after RavenDB .all() (service files)',
  'Use .orderBy() / .orderByDescending() in the RavenDB query instead of .sort() on the result (coding-standards-backend.md RavenDB §).',
  checkChainAfterAll(backendServiceFiles, /\.sort\(/),
);

// ─────────────────────────────────────────────────────────────────────────────
// FRONTEND — React & MUI
// coding-standards-frontend.md
// ─────────────────────────────────────────────────────────────────────────────
process.stdout.write(`${c.header('Frontend — React & MUI')}\n`);

report(
  'Bare fetch() in frontend feature code',
  'All HTTP calls must go through apiClient. Only networkMonitor.ts may use bare fetch (coding-standards-frontend.md §1).',
  grepLines(frontendFeature, /(^|[^a-zA-Z_.$])fetch\(/),
);

report(
  'MUI styled() import',
  'Use sx prop for all MUI styling — styled() is forbidden (coding-standards-frontend.md §3).',
  grepLines(frontendFeature, /^import.*\bstyled\b.*from ['"]@mui\/(material|system)/),
);

report(
  'MUI barrel imports',
  'Use path imports — \'import Button from "@mui/material/Button"\' not \'import { Button } from "@mui/material"\' (coding-standards-frontend.md §4).',
  grepLines(frontendFeature, /from ['"]@mui\/(material|icons-material)['"]/),
);

report(
  'Arrow function components (.tsx files)',
  "Use function declarations — 'export function CustomerList()' not 'export const CustomerList = () =>' (coding-standards-frontend.md §5).",
  grepLines(frontendTsx, /export const [A-Z][a-zA-Z]+ =.*=>/),
);

report(
  'Multiple component functions in one .tsx file',
  'One component per file — no exceptions, not even private helpers. Move extra components to their own files (coding-standards-frontend.md §6).',
  countPerFile(frontendTsx, /\bfunction\s+[A-Z][a-zA-Z]+\s*[(<]/g).map((r) => ({
    rel: r.rel,
    text: `${r.count} component functions found (exported or private)`,
  })),
);

report(
  '.ts file inside components/ folder',
  'components/ holds React components only (.tsx). Pure logic belongs in a specific category folder: calculations/ (math), formatters/ (parse/format), comparators/ (sort), transforms/ (data shape), value-objects/ (domain primitives). See .claude/rules/frontend-architecture.md.',
  frontendFeature
    .filter((f) => /[\\/]components[\\/][^/\\]+\.ts$/.test(f))
    .map((f) => ({rel: relative(ROOT, f)})),
);

report(
  'Frontend interfaces with I prefix',
  "Frontend uses plain PascalCase — 'CustomerFilters' not 'ICustomerFilters'. The I prefix is backend-only (coding-standards-frontend.md §7).",
  grepLines(frontendFeature, /export interface I[A-Z]/),
);

report(
  'Raw Intl / toLocaleString in feature code',
  'Use MoneyField / DecimalField / DateDisplay or the useFormat* hooks — never raw Intl APIs in feature code (coding-standards-frontend.md §9).',
  grepLines(
    frontendFeature,
    /(new Intl\.(NumberFormat|DateTimeFormat)|\.toLocale(String|DateString|TimeString)\()/,
  ),
);

report(
  'parseFloat() in frontend feature code',
  'Use parseLocaleNumber(value, locale) for locale-aware parsing — parseFloat() ignores locale separators (coding-standards-frontend.md §9).',
  grepLines(frontendFeature, /parseFloat\(/),
);

report(
  'Manual AbortController in frontend feature code',
  'Pass AbortSignal through apiClient — do not create AbortController in feature code. apiClient already handles timeout and abort (coding-standards-frontend.md).',
  grepLines(
    frontendFeature,
    /new AbortController\(\)/,
    /core[/\\]services[/\\](apiClient|networkMonitor)\.ts/,
  ),
);

report(
  'async callback inside useEffect — use TanStack Query for data fetching',
  "Data fetching goes through useQuery / useMutation, not useEffect. 'useEffect(async () => {...})' leaks Promises and duplicates query-layer concerns. Use the project's query layer instead (coding-standards-frontend.md).",
  grepLines(frontendFeature, /useEffect\(\s*async/),
);

report(
  'useState<Date> — store dates as ISO strings, not Date objects',
  'React state must hold dates as ISO 8601 strings. Date objects in state cause serialization and comparison bugs. Use DateDisplay / useFormatDate for rendering (coding-standards-frontend.md).',
  grepLines(frontendFeature, /useState<Date[\s>]/),
);

// ─────────────────────────────────────────────────────────────────────────────
// FILE UPLOAD STANDARDS
// file-upload-standards.md
// ─────────────────────────────────────────────────────────────────────────────
process.stdout.write(`${c.header('File Upload Standards')}\n`);

report(
  'Base64 encoding in entity/DTO files',
  'Store binary data as RavenDB attachments, not as base64-encoded JSON fields (file-upload-standards.md §4).',
  grepLines(backendEntityDtoFiles, /(\.toString\(['"]base64['"]\)|btoa\()/),
);

report(
  'Original filename used as RavenDB attachment name',
  'Never use the uploaded filename as the attachment name — use a generated ID. Store originalname as entity metadata (file-upload-standards.md §9).',
  grepLines(backendSrc, /attachments\.store\([^)]*originalname/),
);

// ─────────────────────────────────────────────────────────────────────────────
// E2E TESTS
// ─────────────────────────────────────────────────────────────────────────────
process.stdout.write(`${c.header('E2E Tests')}\n`);

report(
  'Hardcoded route paths in E2E tests',
  "Route paths must be constants from test.constants.ts — never inline string literals like '/work-orders'.",
  grepLines(e2eFiles, /goto\(['"]\/[a-z]/),
);

// ─────────────────────────────────────────────────────────────────────────────
// RESULT
// ─────────────────────────────────────────────────────────────────────────────
process.stdout.write('\n');
if (failed) {
  process.stdout.write(
    c.red(
      'Standards check failed. Fix the violations above or add a justified exclusion with a comment.\n',
    ),
  );
  process.exit(1);
} else {
  process.stdout.write(c.green('All standards checks passed.\n'));
  process.exit(0);
}
