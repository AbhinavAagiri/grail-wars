import { config } from '../../config';
import { politePostJson } from '../../util/http';
import type { GenerateOptions, LlmProvider } from '../types';

const MODEL = 'gemini-2.0-flash';

export const geminiProvider: LlmProvider = {
  name: 'gemini',
  async generate({ system, prompt, maxTokens, json }: GenerateOptions): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY)}`;
    const payload = await politePostJson<any>(
      url,
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.8,
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      },
      { timeoutMs: 10_000 },
    );
    const text = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? '';
    return String(text);
  },
};
