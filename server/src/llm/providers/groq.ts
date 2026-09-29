import { config } from '../../config';
import type { GenerateOptions, LlmProvider } from '../types';
import { chatCompletion } from './openaiCompatible';

export const groqProvider: LlmProvider = {
  name: 'groq',
  generate(opts: GenerateOptions): Promise<string> {
    return chatCompletion(
      {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: config.GROQ_API_KEY,
        model: 'llama-3.3-70b-versatile',
      },
      opts,
    );
  },
};
