import 'dotenv/config';
import { z } from 'zod';

// ─── Schema ──────────────────────────────────────────────────────────────────

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  LLM_API_KEY: z.string().default(''),
  LLM_PROVIDER: z.enum(['groq']).default('groq'),
  MAX_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(20),
  LLM_CONCURRENCY: z.coerce.number().int().positive().max(10).default(1),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  LLM_RETRY_BASE_MS: z.coerce.number().int().positive().default(2000),
  LLM_RETRY_MAX_MS: z.coerce.number().int().positive().default(30000),
  LLM_REQUEST_DELAY_MS: z.coerce.number().int().min(0).default(1500),
});

// ─── Parse & Validate ────────────────────────────────────────────────────────

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(`\n❌ Invalid environment variables:\n${issues}\n`);
  process.exit(1);
}

// LLM_API_KEY is required outside of test mode
if (parsed.data.NODE_ENV !== 'test' && !parsed.data.LLM_API_KEY) {
  console.error(
    '\n❌ LLM_API_KEY is required when NODE_ENV is not "test".\n' +
      '   Copy backend/.env.example to backend/.env and fill in your Groq key.\n',
  );
  process.exit(1);
}

/**
 * Validated, typed configuration object.
 * Loaded once at import time — if validation fails the process exits immediately.
 */
export const config = Object.freeze(parsed.data);
