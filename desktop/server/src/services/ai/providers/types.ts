/** Unified chat provider interface */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatProvider {
  /** Provider identifier */
  readonly name: string;

  /**
   * Generate a chat completion (non-streaming).
   * Returns the full response text.
   */
  chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<string>;

  /**
   * Generate a chat completion with streaming.
   * Yields text tokens one at a time via an async iterable.
   */
  streamChat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncIterable<string>;
}

export interface ImageProvider {
  readonly name: string;

  generate(prompt: string, options?: ImageOptions): Promise<ImageResult>;
}

export interface ImageOptions {
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
}

export interface ImageResult {
  urls: string[];
  provider: string;
  modelVersion: string;
}
