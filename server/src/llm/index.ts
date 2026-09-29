import { config } from '../config';
import { logger } from '../logger';
import { HttpError } from '../util/http';
import { geminiProvider } from './providers/gemini';
import { groqProvider } from './providers/groq';
import { openRouterProvider } from './providers/openrouter';
import { LlmUnavailableError, type GenerateOptions, type LlmProvider } from './types';

export { LlmUnavailableError };
export type { GenerateOptions, LlmProvider };

const PROVIDERS: Record<string, LlmProvider> = {
  gemini: geminiProvider,
  groq: groqProvider,
  openrouter: openRouterProvider,
};

/** Free tiers are small — stop using the LLM for the rest of the process on a 429. */
let disabled = false;
let usedThisMinute = 0;
let minuteWindowStart = Date.now();
const BUDGET_PER_MINUTE = 12;
const MAX_CONCURRENCY = 2;

let active = 0;
const waiters: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENCY) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}

function release(): void {
  active--;
  const next = waiters.shift();
  if (next) next();
}

function budgetAvailable(): boolean {
  const now = Date.now();
  if (now - minuteWindowStart > 60_000) {
    minuteWindowStart = now;
    usedThisMinute = 0;
  }
  return usedThisMinute < BUDGET_PER_MINUTE;
}

export function llmEnabled(): boolean {
  return config.llmEnabled && !disabled && !!PROVIDERS[config.LLM_PROVIDER];
}

export function llmProviderName(): string {
  return config.llmEnabled ? config.LLM_PROVIDER : 'none';
}

/**
 * Single entry point for all LLM use. Never throws for the caller to handle as a
 * fatal error — every failure degrades to the non-LLM path.
 */
export async function generate(opts: GenerateOptions): Promise<string | null> {
  if (!llmEnabled()) return null;
  if (!budgetAvailable()) {
    logger.debug('LLM per-minute budget exhausted; using fallback');
    return null;
  }
  const provider = PROVIDERS[config.LLM_PROVIDER];
  usedThisMinute++;
  await acquire();
  try {
    return await provider.generate(opts);
  } catch (err) {
    if (err instanceof HttpError && err.status === 429) {
      disabled = true;
      logger.warn('LLM rate limited (429) — disabling LLM for this process');
    } else {
      logger.debug({ err }, 'LLM call failed; using fallback');
    }
    return null;
  } finally {
    release();
  }
}

/** Generate and JSON-parse, returning null on any malformed output. */
export async function generateJson<T>(opts: GenerateOptions): Promise<T | null> {
  const raw = await generate({ ...opts, json: true });
  if (!raw) return null;
  const cleaned = raw
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
