// PreToolUse hook — injects relevant Non-Negotiable rules when Edit/Write/MultiEdit
// touches backend or frontend feature code. Non-blocking (exit 0).

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
    return String(toolInput.file_path ?? toolInput.notebook_path ?? '');
  } catch {
    return '';
  }
}

const FILE_UPLOAD_REMINDER = `[File Upload standards — docs/standards/file-upload-standards.md]
Key rules (read the full file if you have not this session):
  1. Binary data → RavenDB attachments, never base64-encoded JSON fields.
  2. Validation (MIME type, size, count) lives in the domain service — not AttachmentService, not the controller.
  3. Use AttachmentService.store() within the caller's session for atomicity (doc + attachment in one saveChanges()).
  4. Images → pipe through ImageProcessingService; define ImageVariant[] in the domain service.
  5. Attachment names are generated IDs (e.g. 'photo-{timestamp}') — never use originalname.
  6. Frontend: use dual-mode pattern (hold files in state for create, submit with PATCH for edit).
  7. Frontend: submit multipart FormData directly — no module-level File staging across routes.
`;

const BACKEND_REMINDER = `[Backend standards — docs/standards/coding-standards-backend.md]
Non-Negotiable Rules (read the file before writing if you have not this session):
  1. Controllers return DTOs (*ResponseDto), never entities. Body is a pass-through to the service.
  2. Mapping lives in the service via <entity>.mapper.ts — never map in controllers, never inline in queries.
  3. Every RavenDB query filters by locationId (except global entities).
  4. Paginated queries always call .orderBy() before .skip()/.take().
  5. Private variables prefixed with _; private methods are plain camelCase (no _ on methods).
  6. Interfaces prefixed with I (backend only).
  7. API errors use Problem Details (RFC 9457) — services throw NestJS exceptions.
  8. Partial updates: undefined = skip, null = clear, value = set. Never 'if (!dto.field)'.
  9. Mappers return ?? null (not ?? undefined) — every response field must be present in JSON.
 10. Filter and sort in the RavenDB query — never load .all() then .filter()/.sort() in JS.
`;

const RAVENDB_REMINDER = `[RavenDB Document Design — docs/standards/ravendb-document-design.md]
Key rules for entity files:
  • Embedded sub-objects live in the aggregate root's entity file — no separate files for sub-types.
  • locationId is mandatory on every location-scoped entity.
  • Rollup fields (totalOnHand etc.) must be recalculated on every write before saveChanges().
  • Use snapshot pattern for referenced data (embed vendor.name alongside vendor.id).
  • Document IDs: {collection}/{identifier} — prefer natural human-readable IDs over GUIDs.
  • Binary data → attachments, not base64 fields. Attachments don't load with session.load().
`;

const FRONTEND_REMINDER = `[Frontend standards — docs/standards/coding-standards-frontend.md]
Non-Negotiable Rules (read the file before writing if you have not this session):
  1. All HTTP calls go through apiClient — never bare fetch() in feature code.
  2. API types mirror the server's DTO contract, not backend entity shapes.
  3. Use sx prop for MUI styling — never styled() API.
  4. MUI imports use path imports, never barrel ('import Button from "@mui/material/Button"').
  5. Function declarations for components — 'export function Foo()' not 'export const Foo = () =>'.
  6. One component per file — no exceptions, not even small private helpers.
  7. .tsx files PascalCase, .ts files camelCase; no I prefix on interfaces (frontend only).
  8. CSS variables prefixed with --ids-.
  9. Locale-aware formatting: MoneyField / DecimalField / DateDisplay or useFormat* hooks — never raw Intl.
 10. Auto-dismissing banners use <HideAfterDelay> — never hand-rolled setTimeout.
 11. No manual AbortController — pass signal through apiClient.
 12. Use parseLocaleNumber() not parseFloat() for money/decimal inputs.
 13. Data fetching goes through useQuery / useMutation — never useEffect(async () => {...}). async useEffect leaks Promises.
 14. Dates in state are ISO 8601 strings — never Date objects. Let DateDisplay / useFormatDate handle rendering.
`;

const DTO_REMINDER = `[DTO standards — docs/standards/coding-standards-backend.md]
Extra rules for DTO files (applies on top of the general backend rules):
  1. File naming: '*.dto.ts' (general DTOs), '*.query.dto.ts' (query DTOs; list endpoints in this repo may also colocate their list response DTOs here), '*.response.dto.ts' (response-only shapes when separated).
  2. Every field must have class-validator decorators — @IsString(), @IsOptional(), @IsEnum(), @MaxLength() etc.
  3. Enum fields MUST have @IsEnum(EnumType) — without it, invalid values pass validation and 'as EnumType' casts in the service silently accept bad data.
  4. Required arrays need @ArrayMinSize(1) when at least one element is always expected.
  5. Partial update DTOs: undefined = skip, null = clear, value = set. Never 'if (!dto.field)'.
  6. Response DTOs: every optional field returns null (not undefined) — mappers use '?? null' so no key silently disappears from JSON.
`;

const IS_TEST = /\.(test|spec)\.(tsx?|mts|cts)$|[/\\]__tests?__[/\\]/;
const IS_UPLOAD =
  /(upload|attachment|photo|image|picture)s?[-_.][^/\\]*\.ts$|\.(upload|attachment)\.ts$/i;
const IS_BACKEND =
  /apps[/\\]astra-apis[/\\].*\.(controller|service|mapper|repository|dto|module|guard|interceptor|filter)\.ts$|apps[/\\]astra-apis[/\\].+[/\\]entities[/\\].+\.ts$|apps[/\\]astra-apis[/\\].+[/\\]indexes[/\\].+\.ts$/;
const IS_ENTITY = /apps[/\\]astra-apis[/\\].+[/\\]entities[/\\].+\.ts$/;
const IS_DTO = /apps[/\\]astra-apis[/\\].*\.dto\.ts$/;
const IS_FRONTEND = /apps[/\\]client-web[/\\]app[/\\].*\.(tsx|ts)$/;

async function main(): Promise<void> {
  const input = await readStdin();
  const filePath = extractFilePath(input);

  if (!filePath || IS_TEST.test(filePath)) {
    process.exit(0);
  }

  if (IS_UPLOAD.test(filePath)) {
    process.stderr.write(FILE_UPLOAD_REMINDER);
  }

  if (IS_BACKEND.test(filePath)) {
    process.stderr.write(BACKEND_REMINDER);
    if (IS_ENTITY.test(filePath)) {
      process.stderr.write(RAVENDB_REMINDER);
    }
    if (IS_DTO.test(filePath)) {
      process.stderr.write(DTO_REMINDER);
    }
    process.exit(0);
  }

  if (IS_FRONTEND.test(filePath)) {
    process.stderr.write(FRONTEND_REMINDER);
    process.exit(0);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
