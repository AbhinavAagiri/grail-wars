import { config } from '../../config';
import type { GenerateOptions, LlmProvider } from '../types';
import { chatCompletion } from './openaiCompatible';

export const openRouterProvider: LlmProvider = {
  name: 'openrouter',
  generate(opts: GenerateOptions): Promise<string> {
    return chatCompletion(
      {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        apiKey: config.OPENROUTER_API_KEY,
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        extraHeaders: { 'http-referer': 'https://github.com/grail-wars' },
      },
      opts,
    );
  },
};
