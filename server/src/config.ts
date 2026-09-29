import 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const EnvSchema = z.object({
  // .catch() rather than .default(): a blank or bogus PORT (some shells export
  // PORT=0) should quietly fall back to 3000 instead of failing to boot.
  PORT: z.coerce.number().int().positive().catch(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CONTACT_EMAIL: z.string().default('you@example.com'),
  LLM_PROVIDER: z.enum(['none', 'gemini', 'groq', 'openrouter']).default('none'),
  GEMINI_API_KEY: z.string().default(''),
  GROQ_API_KEY: z.string().default(''),
  OPENROUTER_API_KEY: z.string().default(''),
  TMDB_API_KEY: z.string().default(''),
  IMAGE_SEARCH_PROVIDER: z.enum(['none', 'brave', 'google_cse']).default('none'),
  BRAVE_SEARCH_KEY: z.string().default(''),
  GOOGLE_CSE_KEY: z.string().default(''),
  GOOGLE_CSE_CX: z.string().default(''),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.string().default('info'),
  /**
   * Where site feedback is delivered. FEEDBACK_TO is never exposed to clients;
   * FEEDBACK_WEBHOOK_URL accepts any endpoint that turns a JSON POST into an
   * email (Formspree, a Google Apps Script, Zapier, …) so no paid service or
   * SMTP credentials are required.
   */
  FEEDBACK_TO: z.string().default('aagiriabhinav2@gmail.com'),
  FEEDBACK_WEBHOOK_URL: z.string().default(''),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  isProd: boolean;
  llmEnabled: boolean;
};

function loadEnv(): Record<string, string | undefined> {
  // Load .env from the repo root if present, without adding a dependency.
  try {
    const candidates = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '../.env'),
    ];
    for (const file of candidates) {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = value;
      }
    }
  } catch {
    // .env is optional; ignore any read failure.
  }
  return process.env;
}

function build(): AppConfig {
  const env = loadEnv();
  // Treat empty values as unset so defaults apply.
  const cleaned: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    cleaned[key] = typeof value === 'string' && value.trim() === '' ? undefined : value;
  }
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const data = parsed.data;
  const llmEnabled =
    data.LLM_PROVIDER !== 'none' &&
    ((data.LLM_PROVIDER === 'gemini' && !!data.GEMINI_API_KEY) ||
      (data.LLM_PROVIDER === 'groq' && !!data.GROQ_API_KEY) ||
      (data.LLM_PROVIDER === 'openrouter' && !!data.OPENROUTER_API_KEY));

  return { ...data, isProd: data.NODE_ENV === 'production', llmEnabled };
}

export const config: AppConfig = build();

/** Identifiable, polite User-Agent for public APIs. */
export function userAgent(): string {
  return `GrailWars/1.0 (contact: ${config.CONTACT_EMAIL})`;
}
