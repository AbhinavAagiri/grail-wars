import { politePostJson } from '../../util/http';
import type { GenerateOptions } from '../types';

export interface ChatConfig {
  url: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
}

export async function chatCompletion(
  cfg: ChatConfig,
  { system, prompt, maxTokens, json }: GenerateOptions,
): Promise<string> {
  const payload = await politePostJson<any>(
    cfg.url,
    {
      model: cfg.model,
      max_tokens: maxTokens,
      temperature: 0.8,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    },
    { timeoutMs: 10_000, headers: { authorization: `Bearer ${cfg.apiKey}`, ...(cfg.extraHeaders ?? {}) } },
  );
  return String(payload?.choices?.[0]?.message?.content ?? '');
}
