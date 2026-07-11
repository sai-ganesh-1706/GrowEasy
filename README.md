# GrowEasy Import

A CSV-to-CRM import tool that takes an arbitrary CSV file, sends rows through an LLM (Groq/Llama 3.3 70B) to extract structured CRM records, and shows results with skip reasons. Built as a monorepo with a Next.js frontend and Express backend.

---

## Architecture

```
┌────────────────────┐         ┌───────────────────────────────────┐
│   Next.js (3000)   │  HTTP   │       Express API (3001)          │
│                    │────────▶│                                   │
│  Upload ─▶ Preview │         │  POST /api/csv/upload             │
│  ─▶ Processing     │         │    ├─ multer (5 MB, .csv only)    │
│  ─▶ Results        │         │    ├─ papaparse → parse CSV       │
│                    │         │    └─ store in memory session      │
│                    │         │                                   │
│                    │         │  POST /api/csv/extract             │
│                    │         │    ├─ split rows into batches      │
│                    │         │    ├─ send each batch to LLM       │
│                    │         │    ├─ validate response with Zod   │
│                    │         │    └─ aggregate parsed + skipped   │
└────────────────────┘         └───────────────────────────────────┘
```

**Why two steps?** Upload does no AI work — it parses the CSV, stores rows in a server-side session, and returns a preview. The user reviews the preview before triggering extraction, which is the expensive LLM call. This avoids wasting API credits on files the user didn't intend to process.

**Why batching?** LLMs have context window limits and get less reliable with very large payloads. The extraction service splits rows into batches (configurable via `MAX_BATCH_SIZE`, default 25), processes them concurrently (3 at a time), and aggregates results. If a batch fails, it retries up to 2 times with exponential backoff before marking those rows as skipped — so one rate-limit error doesn't kill a 500-row import.

---

## Setup

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9 (ships with Node 18+)
- A [Groq API key](https://console.groq.com/keys) (free tier works)

### Install

```bash
git clone <repo-url> && cd GrowEasy
npm install        # installs all workspaces (frontend + backend)
```

### Configure

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
PORT=3001
NODE_ENV=development
LLM_API_KEY=gsk_your_groq_api_key_here   # required — get one at console.groq.com
LLM_PROVIDER=groq
MAX_BATCH_SIZE=25                         # rows per LLM call (lower = more reliable, higher = fewer API calls)
```

The frontend reads `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:3001` if unset).

### Run

```bash
# Terminal 1 — backend
npm run dev:backend     # starts Express on :3001

# Terminal 2 — frontend
npm run dev:frontend    # starts Next.js on :3000
```

Open [http://localhost:3000](http://localhost:3000).

### Test

```bash
npm test --workspace=backend    # 22 tests across 3 suites
```

---

## API

### `GET /api/health`

Health check. Returns `{ "status": "ok" }`.

### `POST /api/csv/upload`

Upload and parse a CSV file.

**Request:** `multipart/form-data` with a `file` field (`.csv`, max 5 MB).

**Response (200):**

```json
{
  "uploadId": "a1b2c3d4-...",
  "fileName": "leads.csv",
  "totalRows": 340,
  "rawRowCount": 342,
  "headers": ["Name", "Email", "Phone", "Company"],
  "normalizedHeaders": ["name", "email", "phone", "company"],
  "preview": [
    { "Name": "Alice", "Email": "alice@example.com", "Phone": "555-0100", "Company": "Acme" }
  ]
}
```

`preview` contains up to 20 rows. `rawRowCount` is the pre-dedup/pre-trim count; `totalRows` is the actual data row count.

**Errors:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ "error": "No file uploaded..." }` | No file attached or wrong field name |
| 400 | `{ "error": "CSV file is empty..." }` | File has no content |
| 400 | `{ "error": "...no data rows" }` | File has headers but zero data rows |
| 413 | `{ "error": "File too large" }` | Exceeds 5 MB |

### `POST /api/csv/extract`

Run AI extraction on a previously uploaded CSV.

**Request:**

```json
{ "uploadId": "a1b2c3d4-..." }
```

**Response (200):**

```json
{
  "totalRows": 340,
  "totalImported": 335,
  "totalSkipped": 5,
  "parsed": [
    {
      "created_at": "2024-03-15",
      "name": "Alice Smith",
      "email": "alice@example.com",
      "country_code": "+1",
      "mobile_without_country_code": "5550100",
      "company": "Acme Corp",
      "city": "New York",
      "state": "NY",
      "country": "USA",
      "lead_owner": "",
      "crm_status": "GOOD_LEAD_FOLLOW_UP",
      "crm_note": "",
      "data_source": "",
      "possession_time": "",
      "description": ""
    }
  ],
  "skipped": [
    {
      "row": { "Name": "Bob", "Email": "", "Phone": "" },
      "reason": "No email or phone number found"
    }
  ]
}
```

**Errors:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ "error": "uploadId is required" }` | Missing or empty `uploadId` |
| 404 | `{ "error": "Upload session not found..." }` | `uploadId` doesn't exist or expired |
| 401 | `{ "error": "LLM API authentication failed..." }` | Bad `LLM_API_KEY` |
| 429 | `{ "error": "Too many requests..." }` | Rate limited (API-level or app-level) |

---

## Design Decisions

### Prompt strategy

The system prompt is a single file ([crmExtractionPrompt.ts](backend/src/prompts/crmExtractionPrompt.ts)) that owns all business rules. Key choices:

- **Explicit enum lists** injected from the Zod schema (`CRM_STATUSES`, `DATA_SOURCES`) so the prompt and validation layer can't drift apart.
- **"No hallucination" rule** — the LLM is told to leave fields empty rather than guess, especially for `crm_status` and `data_source` which have strict enum constraints.
- **"Preserve all data" rule** — extra columns and extra emails/phones go into `crm_note` so nothing is silently dropped.
- **Schema context** — each batch includes the CSV headers plus 5 sample rows so the LLM understands the input format without needing it repeated in every batch.
- **Retry prompt** — if the LLM returns invalid JSON or fails Zod validation, we send a follow-up message with the parse error and the original rows, giving it one chance to self-correct before marking the batch as failed.

### Skip logic

A row is skipped in two scenarios:

1. **By the LLM** — the row has no email or phone number. The system prompt instructs the LLM to put it in `skipped` with a reason.
2. **By the backend** — if a batch fails all retry attempts (3 total), every row in that batch is marked skipped with `"AI extraction failed after 3 attempts: <error>"`. This means the rest of the import still succeeds.

Critical errors (401 auth failure, 500 config errors) bypass this and fail the entire request — there's no point retrying if the API key is wrong.

### Retry with backoff

Each batch gets up to 3 attempts (1 initial + 2 retries) with exponential backoff (1s, 2s). This handles the most common failure mode: Groq's free tier 429 rate limits. Retry counts are surfaced in structured JSON logs so you can monitor reliability without adding external tooling.

### Tradeoffs

- **In-memory session store** — CSV data is stored in a `Map` keyed by `uploadId`. This is fine for a single-process dev setup but won't survive a server restart or work with multiple replicas. A production version would use Redis or a database.
- **No streaming/SSE for progress** — the frontend shows staged messages during extraction rather than real progress from the backend. Real batch-by-batch progress would require SSE or WebSocket, which was deprioritized.
- **No auth** — there's no user authentication. The tool assumes a trusted internal environment.
- **Groq-only** — the LLM provider is abstracted behind an `ILlmProvider` interface, so adding OpenAI or Anthropic is straightforward, but only Groq is implemented.

---

## Known Limitations

Things I'd do with more time:

- **Persistent session storage** — swap the in-memory `Map` for Redis with TTL-based expiry.
- **Real progress updates** — SSE endpoint so the frontend shows "Processed batch 3 of 8" instead of staged messages.
- **Virtualized tables** — react-window or similar for large CSVs (thousands of rows) to avoid DOM bloat.
- **End-to-end tests** — Playwright or Cypress covering the full upload → preview → extract → results flow.
- **CSV export on the backend** — currently the frontend generates the CSV client-side; a server-side endpoint would handle larger datasets.
- **Multi-provider LLM** — OpenAI, Anthropic, and Gemini providers behind the existing `ILlmProvider` interface.
- **File type support** — XLSX and TSV parsing alongside CSV.
- **Rate limiting per uploadId** — prevent the same upload from being extracted concurrently.

---

## Project Structure

```
GrowEasy/
├── backend/
│   ├── src/
│   │   ├── config.ts              # Zod-validated env vars
│   │   ├── controllers/           # Route handlers
│   │   ├── middleware/             # Error handler, multer, validation, requestId
│   │   ├── prompts/               # LLM system + user prompts
│   │   ├── routes/                # Express routers
│   │   ├── services/              # CSV parsing, LLM client, extraction orchestrator
│   │   ├── types/                 # AppError, CRM Zod schemas, session types
│   │   ├── utils/                 # Structured logger
│   │   └── index.ts               # Express app entry
│   ├── __tests__/                 # Jest test suites
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/                   # Next.js app router (layout, page, globals.css)
│   │   ├── components/            # DropZone, DataTable, ProcessingView, ResultsView, etc.
│   │   └── lib/                   # API client, TypeScript types
│   └── tailwind.config.ts         # Design tokens (CSS custom properties)
├── package.json                   # Monorepo root with npm workspaces
└── README.md
```

---

## Testing a Sample Import

1. Start both servers (see [Setup](#run) above).
2. Open http://localhost:3000.
3. Use one of the sample CSVs from the project brief, or create your own with columns like `Name, Email, Phone, Company, City`.
4. Upload → review the preview table → click **Confirm Import**.
5. Check the Results tab: imported records show CRM status badges, skipped records show the reason with expandable original data.
6. Click **Download CSV** to export the parsed CRM records.

Minimal test CSV:

```csv
Name,Email,Phone,Company,Status
Alice Smith,alice@example.com,+1-555-0100,Acme Corp,interested
Bob Jones,,,"",
Carol Lee,carol@example.com,+44-20-7946-0958,Globex,closed won
```

Expected: Alice → imported (status: Good Lead), Bob → skipped (no email or phone), Carol → imported (status: Sale Done).
