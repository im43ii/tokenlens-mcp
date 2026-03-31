export interface TokenBreakdown {
  system: number;
  history: number;
  tools: number;
  userMessage: number;
  response: number;
  total: number;
}

export interface WasteItem {
  type:
    | 'unused_tools' | 'long_history' | 'verbose_system_prompt'
    | 'repeated_context' | 'large_response'
    | 'no_system_prompt' | 'single_turn' | 'low_user_high_response' | 'tool_heavy';
  severity: 'low' | 'medium' | 'high';
  estimatedWaste: number;
  description: string;
}

export interface Suggestion {
  priority: number;
  title: string;
  description: string;
  estimatedSavings: number;
}

export interface Session {
  id: string;
  userId: string;
  provider: string;
  model: string;
  editor: string;
  timestamp: number;
  breakdown: TokenBreakdown;
  waste: WasteItem[];
  suggestions: Suggestion[];
  cost: number;
}

export interface User {
  id: string;
  token: string;
  name: string;
  createdAt: number;
  isActive: boolean;
}

export interface Budget {
  sessionLimit: number | null;
  dailyLimit: number | null;
  alertThreshold: number;
}

export interface MessageAnalysis {
  index: number;
  role: string;
  tokens: number;
  contentPreview: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: string;
  text?: string;
}

export interface Tool {
  name: string;
  description?: string;
  input_schema?: object;
}


export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
};
