export interface GenerateOptions {
  system: string;
  prompt: string;
  maxTokens: number;
  json?: boolean;
}

export interface LlmProvider {
  name: string;
  generate(opts: GenerateOptions): Promise<string>;
}

export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}
