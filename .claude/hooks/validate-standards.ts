// PostToolUse hook — validates the written file against the highest-risk standards.
// Non-blocking (exit 0), prints warnings to stderr.
// Paired with: remind-standards.ts (pre) and post-task-check.ts (stop).

import {existsSync, readFileSync} from 'node:fs';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function extractFilePath(input: string): string {
  try {
    const parsed = JSON.parse(input) as Record<string, unknown>;
    const toolInput = (parsed.tool_input ?? {}) as Record<string, unknown>;
    return String(toolInput.file_path ?? '');
  } catch {
    return '';
  }
}

function has(content: string, pattern: RegExp): boolean {
  return pattern.test(content);
}

const IS_TEST = /\.(test|spec)\.(tsx?|ts)$|[/\\]__tests?__[/\\]/;
const IS_BACKEND = /apps[/\\]astra-apis[/\\]src[/\\]/;
const IS_MAPPER = /\.mapper\.ts$/;
const IS_SERVICE = /\.service\.ts$/;
const IS_FRONTEND = /apps[/\\]client-web[/\\]app[/\\]/;
const IS_FRONTEND_EXCEPTION =
  /apps[/\\]client-web[/\\]app[/\\]core[/\\]formatters[/\\]|apps[/\\]client-web[/\\]app[/\\]core[/\\]hooks[/\\]useFormat|apps[/\\]client-web[/\\]app[/\\]components[/\\](MoneyField|DecimalField|DateDisplay)\.tsx|apps[/\\]client-web[/\\]app[/\\]core[/\\]services[/\\](networkMonitor|apiClient)\.ts/;

async function main(): Promise<void> {
  const input = await readStdin();
  const filePath = extractFilePath(input);

  if (!filePath || !existsSync(filePath) || IS_TEST.test(filePath)) {
    process.exit(0);
  }

  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    process.exit(0);
  }

  const warnings: string[] = [];

  // ── Core — both layers ───────────────────────────────────────────────────
  if (has(content, /(: any[^a-zA-Z0-9_]|: any$|<any>| as any[^a-zA-Z0-9_])/m)) {
    warnings.push(
      "[core] Explicit 'any' type detected — use 'unknown' instead. Strict mode is enabled.",
    );
  }

  if (has(content, /from ['"](\.\.?)[/\\]index['"]/m)) {
    warnings.push(
      '[core] Barrel import from index file — import directly from the source file. Only @ids/data-models barrel is allowed.',
    );
  }

  // ── Backend — astra-apis ─────────────────────────────────────────────────
  if (IS_BACKEND.test(filePath)) {
    if (
      has(
        content,
        /private\s+(async\s+|static\s+)?(override\s+)?_[a-zA-Z][a-zA-Z0-9]*\s*(<[^>]*>)?\s*\(/m,
      )
    ) {
      warnings.push(
        "[backend] Private method with '_' prefix — methods use plain camelCase. Only variables/injected deps get '_'.",
      );
    }

    if (has(content, /private\s+readonly\s+(?!_)[a-zA-Z]/m)) {
      warnings.push(
        "[backend] Private variable missing '_' prefix — 'private readonly _service: Service' not 'private readonly service: Service'.",
      );
    }

    if (has(content, /private\s+static\s+readonly\s+(?!_)[a-zA-Z]/m)) {
      warnings.push(
        "[backend] Private static variable missing '_' prefix — 'private static readonly _MAX_SIZE = 10' not 'private static readonly MAX_SIZE = 10'. Rule 5 applies to both instance and static private variables.",
      );
    }

    if (has(content, /export interface (?!I[A-Z])[A-Z]/m)) {
      warnings.push(
        "[backend] Interface missing 'I' prefix — 'ICustomerRepository' not 'CustomerRepository'. Backend interfaces always use the I prefix.",
      );
    }

    if (has(content, /if \(!dto\./m)) {
      warnings.push(
        "[backend] Wrong partial update guard 'if (!dto.field)' — use 'if (dto.field !== undefined)' to correctly handle 0, false, and '' values.",
      );
    }

    if (IS_MAPPER.test(filePath) && has(content, /\?\? undefined/m)) {
      warnings.push(
        "[backend] '?? undefined' in mapper — use '?? null' so optional fields are always present in the JSON response.",
      );
    }

    if (IS_SERVICE.test(filePath)) {
      if (has(content, /\.all\(\)/m) && has(content, /\.filter\(/m)) {
        warnings.push(
          '[backend] Possible in-memory .filter() after .all() — push filtering into the RavenDB query with .whereEquals() / .search().',
        );
      }
      if (has(content, /\.all\(\)/m) && has(content, /\.sort\(/m)) {
        warnings.push(
          '[backend] Possible in-memory .sort() after .all() — use .orderBy() / .orderByDescending() in the RavenDB query instead.',
        );
      }
    }
  }

  // ── Frontend — client-web ────────────────────────────────────────────────
  if (IS_FRONTEND.test(filePath) && !IS_FRONTEND_EXCEPTION.test(filePath)) {
    if (/[\\/](utils|helpers|lib|misc|common)[\\/]/.test(filePath)) {
      warnings.push(
        "[frontend-architecture] Forbidden folder name in path — name folders by what code does (formatters/, comparators/, calculations/, transforms/, value-objects/), not by grade ('utils', 'helpers', 'lib', 'misc', 'common'). See .claude/rules/frontend-architecture.md.",
      );
    }

    if (/[\\/]constants[\\/]constants\.tsx?$/.test(filePath)) {
      warnings.push(
        "[frontend-architecture] 'constants/constants.ts' is a junk-drawer pattern — name the file after the concept (formMode.ts, priceStatus.ts, pagination.ts, billType.ts), with one concept per file. If a file would only contain a single isolated value, consider whether it belongs in a more specific category folder (queries/ for query-key strings, types/ for discriminated unions). See .claude/rules/frontend-architecture.md.",
      );
    }

    if (/[\\/]components[\\/][^/\\]+\.ts$/.test(filePath)) {
      warnings.push(
        "[frontend-architecture] '.ts' file directly inside components/ — this folder is for React components (.tsx) only. Pure logic belongs in a more specific category: calculations/ (math), formatters/ (parse/format), comparators/ (sort), transforms/ (data shape), value-objects/ (domain primitives). See .claude/rules/frontend-architecture.md.",
      );
    }

    if (has(content, /(^|[^a-zA-Z_.$])fetch\(/m)) {
      warnings.push('[frontend] Bare fetch() detected — all HTTP calls must go through apiClient.');
    }

    if (
      has(
        content,
        /(new Intl\.(NumberFormat|DateTimeFormat)|\.toLocale(String|DateString|TimeString)\()/m,
      )
    ) {
      warnings.push(
        '[frontend] Raw Intl / toLocaleString — use MoneyField / DecimalField / DateDisplay or the useFormat* hooks.',
      );
    }

    if (has(content, /^import.*\bstyled\b.*from ['"]@mui\/(material|system)/m)) {
      warnings.push(
        '[frontend] MUI styled() import — use the sx prop instead. styled() is forbidden.',
      );
    }

    if (has(content, /from ['"]@mui\/(material|icons-material)['"]/m)) {
      warnings.push(
        '[frontend] MUI barrel import — use path imports: \'import Button from "@mui/material/Button"\'.',
      );
    }

    if (
      filePath.endsWith('.tsx') &&
      has(content, /export\s+const\s+[A-Z][a-zA-Z0-9]*(?:\s*<[^>]*>)?(?:\s*:\s*[^=]+)?\s*=[^;]*=>/m)
    ) {
      warnings.push(
        "[frontend] Arrow function component — use function declarations: 'export function MyComponent()' not 'export const MyComponent = () =>'. Catches plain, typed ('Foo: FC = ...'), and generic ('Foo<T> = ...') variants.",
      );
    }

    if (has(content, /export interface I[A-Z]/m)) {
      warnings.push(
        '[frontend] Interface with I prefix — frontend uses plain PascalCase. The I prefix is backend-only.',
      );
    }

    if (has(content, /parseFloat\(/m)) {
      warnings.push(
        '[frontend] parseFloat() detected — use parseLocaleNumber(value, locale) for locale-aware number parsing.',
      );
    }

    if (has(content, /new AbortController\(\)/m)) {
      warnings.push(
        '[frontend] Manual AbortController — pass AbortSignal through apiClient instead.',
      );
    }

    if (has(content, /useEffect\(\s*async/m)) {
      warnings.push(
        '[frontend] async useEffect detected — use useQuery / useMutation for data fetching, not useEffect. async callbacks inside useEffect leak Promises.',
      );
    }

    if (has(content, /useState<Date[\s>]/m)) {
      warnings.push(
        '[frontend] useState<Date> — store dates as ISO 8601 strings in state, not Date objects. Use DateDisplay / useFormatDate for rendering.',
      );
    }

    if (filePath.endsWith('.tsx')) {
      const componentCount = (content.match(/\bfunction\s+[A-Z][a-zA-Z]+\s*[(<]/g) ?? []).length;
      if (componentCount > 1) {
        warnings.push(
          `[frontend] ${componentCount} component functions in one .tsx file — one component per file, no exceptions, not even private helpers (coding-standards-frontend.md §6).`,
        );
      }
    }
  }

  if (warnings.length > 0) {
    const lines = [
      `\n[Standards validation — ${filePath}]`,
      ...warnings.map((w) => `  ⚠ ${w}`),
      '  Run: npm run check:standards  |  Docs: docs/standards/\n',
    ];
    process.stderr.write(lines.join('\n'));
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
