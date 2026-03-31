import { TokenBreakdown, WasteItem, Suggestion, Message, MessageAnalysis, Tool } from '../types/index';

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildBreakdown(
  systemPrompt: string | undefined,
  messages: Message[],
  tools: Tool[] | undefined,
  actualUsage?: { input_tokens: number; output_tokens: number }
): TokenBreakdown {
  const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
  const toolsTokens = tools ? estimateTokens(JSON.stringify(tools)) : 0;
  const historyMessages = messages.slice(0, -1);
  const lastMessage = messages[messages.length - 1];

  const historyTokens = historyMessages.reduce((sum, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return sum + estimateTokens(content);
  }, 0);

  const userMessageContent = lastMessage
    ? (typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content))
    : '';
  const userMessageTokens = estimateTokens(userMessageContent);

  if (actualUsage) {
    const totalInput = actualUsage.input_tokens;
    const responseTokens = actualUsage.output_tokens;
    const estimatedInput = systemTokens + historyTokens + toolsTokens + userMessageTokens;
    const scale = estimatedInput > 0 ? totalInput / estimatedInput : 1;
    return {
      system: Math.round(systemTokens * scale),
      history: Math.round(historyTokens * scale),
      tools: Math.round(toolsTokens * scale),
      userMessage: Math.round(userMessageTokens * scale),
      response: responseTokens,
      total: totalInput + responseTokens,
    };
  }

  const total = systemTokens + historyTokens + toolsTokens + userMessageTokens;
  return {
    system: systemTokens,
    history: historyTokens,
    tools: toolsTokens,
    userMessage: userMessageTokens,
    response: 0,
    total,
  };
}

export function detectWaste(breakdown: TokenBreakdown, tools?: Tool[]): WasteItem[] {
  const waste: WasteItem[] = [];
  const total = breakdown.total || 1;

  // ── Original checks ───────────────────────────────────────────────────────
  if (tools && tools.length > 10 && breakdown.tools > 2000) {
    waste.push({
      type: 'unused_tools',
      severity: 'high',
      estimatedWaste: Math.round(breakdown.tools * 0.4),
      description: `${tools.length} tools loaded (${breakdown.tools} tokens). Most tools are likely unused in any single turn.`,
    });
  }

  if (breakdown.history > 4000) {
    waste.push({
      type: 'long_history',
      severity: 'medium',
      estimatedWaste: Math.round(breakdown.history * 0.5),
      description: `History is ${breakdown.history} tokens — over half may be redundant context the model already internalized.`,
    });
  }

  if (breakdown.system > 1500) {
    waste.push({
      type: 'verbose_system_prompt',
      severity: 'medium',
      estimatedWaste: Math.round(breakdown.system * 0.3),
      description: `System prompt is ${breakdown.system} tokens. Repeated role descriptions and verbose rules inflate every request.`,
    });
  }

  if (breakdown.response > 3000) {
    waste.push({
      type: 'large_response',
      severity: 'low',
      estimatedWaste: 0,
      description: `Response was ${breakdown.response} tokens. Long responses cost output tokens which are typically 3–5× more expensive.`,
    });
  }

  // ── New checks ────────────────────────────────────────────────────────────
  if (breakdown.system === 0 && breakdown.total > 0) {
    waste.push({
      type: 'no_system_prompt',
      severity: 'medium',
      estimatedWaste: 0,
      description: 'No system prompt detected. Without guidance the model may ask clarifying questions, wasting tokens on back-and-forth.',
    });
  }

  if (breakdown.history === 0 && breakdown.userMessage > 0) {
    waste.push({
      type: 'single_turn',
      severity: 'low',
      estimatedWaste: 0,
      description: 'Single-turn conversation. If you have follow-up questions, batch them into one message to avoid repeated per-request overhead (system prompt + tools reloaded each time).',
    });
  }

  if (breakdown.response > 0 && breakdown.userMessage > 0 && breakdown.response > breakdown.userMessage * 5) {
    const ratio = Math.round(breakdown.response / breakdown.userMessage);
    waste.push({
      type: 'low_user_high_response',
      severity: 'medium',
      estimatedWaste: Math.round(breakdown.response * 0.4),
      description: `Response (${breakdown.response} tokens) is ${ratio}× your message (${breakdown.userMessage} tokens). The model is over-explaining — ask for concise answers.`,
    });
  }

  if (breakdown.total > 0 && breakdown.tools > total * 0.5) {
    waste.push({
      type: 'tool_heavy',
      severity: 'high',
      estimatedWaste: Math.round(breakdown.tools * 0.5),
      description: `Tools consume ${Math.round(breakdown.tools / total * 100)}% of total tokens (${breakdown.tools} tokens). Simplify tool schemas or reduce the number of registered tools.`,
    });
  }

  return waste;
}

export function detectRepeatedContext(messages: Message[]): WasteItem | null {
  if (messages.length < 3) return null;
  const words: Record<string, number> = {};
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    for (const word of content.toLowerCase().split(/\s+/)) {
      if (word.length > 4) words[word] = (words[word] || 0) + 1;
    }
  }
  const repeated = Object.values(words).filter(c => c > 3).length;
  const total = Object.keys(words).length;
  if (total > 0 && repeated / total > 0.3) {
    return {
      type: 'repeated_context',
      severity: 'low',
      estimatedWaste: Math.round(repeated * 2),
      description: `High repetition detected (${Math.round(repeated / total * 100)}% repeated words).`,
    };
  }
  return null;
}

export function generateSuggestions(waste: WasteItem[], _breakdown: TokenBreakdown): Suggestion[] {
  const suggestions: Suggestion[] = [];
  for (const item of waste) {
    switch (item.type) {
      case 'tool_heavy':
        suggestions.push({ priority: 1, title: 'Slim down tool schemas', description: 'Remove optional fields, shorten descriptions, and drop tools not needed for this task. Each tool schema is sent on every request.', estimatedSavings: item.estimatedWaste });
        break;
      case 'unused_tools':
        suggestions.push({ priority: 1, title: 'Load tools on demand', description: 'Register only the tools needed for the current task. A coding session does not need file-upload or calendar tools.', estimatedSavings: item.estimatedWaste });
        break;
      case 'long_history':
        suggestions.push({ priority: 2, title: 'Compress old messages', description: 'Use compress_context to distill earlier turns into a one-line summary. Keep only the last 3–4 exchanges in full.', estimatedSavings: item.estimatedWaste });
        break;
      case 'verbose_system_prompt':
        suggestions.push({ priority: 3, title: 'Trim system prompt', description: 'Replace prose paragraphs with bullet rules. Move static reference content (e.g. API docs) into tool results instead so it is only sent when needed.', estimatedSavings: item.estimatedWaste });
        break;
      case 'low_user_high_response':
        suggestions.push({ priority: 3, title: 'Ask for concise answers', description: 'Append "Reply in under 150 words" or "Be brief" to your message. For code tasks, ask for the code only — skip the explanation unless needed.', estimatedSavings: item.estimatedWaste });
        break;
      case 'repeated_context':
        suggestions.push({ priority: 4, title: 'Stop repeating context', description: 'The model already has earlier messages in its context window. Remove re-statements like "As I mentioned above…" or pasted-in code that was already sent.', estimatedSavings: item.estimatedWaste });
        break;
      case 'no_system_prompt':
        suggestions.push({ priority: 4, title: 'Add a focused system prompt', description: 'Even 2–3 lines ("You are a TypeScript expert. Be concise. Prefer code over prose.") prevent the model from asking scope questions that waste tokens.', estimatedSavings: 0 });
        break;
      case 'single_turn':
        suggestions.push({ priority: 5, title: 'Batch your questions', description: 'Combine related follow-up questions into a single message. Every new turn reloads the system prompt and tools, so fewer turns = lower cost.', estimatedSavings: 0 });
        break;
      case 'large_response':
        suggestions.push({ priority: 5, title: 'Cap response length', description: 'Pass max_tokens=500 (or appropriate limit) to prevent runaway responses. Output tokens cost 3–5× more than input tokens on most models.', estimatedSavings: 0 });
        break;
    }
  }
  return suggestions.sort((a, b) => a.priority - b.priority);
}

export function analyzeConversation(
  messages: Message[],
  toolsLoaded?: string[],
): {
  perMessage: MessageAnalysis[];
  breakdown: TokenBreakdown;
  waste: WasteItem[];
  suggestions: Suggestion[];
} {
  // Per-message token counts
  const perMessage: MessageAnalysis[] = messages.map((msg, i) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return {
      index: i,
      role: msg.role,
      tokens: estimateTokens(content),
      contentPreview: content.slice(0, 80) + (content.length > 80 ? '…' : ''),
    };
  });

  // Aggregate into breakdown categories
  const systemMessages  = messages.filter(m => m.role === 'system');
  const nonSystem       = messages.filter(m => m.role !== 'system');

  const systemTokens = systemMessages.reduce((sum, m) => {
    const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return sum + estimateTokens(c);
  }, 0);

  // Estimate ~200 tokens per tool name (schemas unknown; actual cost is higher)
  const toolsTokens = toolsLoaded ? toolsLoaded.length * 200 : 0;

  // Last user turn = userMessage, last assistant turn = response, everything else = history
  const lastUserIdx      = nonSystem.map(m => m.role).lastIndexOf('user');
  const lastAssistantIdx = nonSystem.map(m => m.role).lastIndexOf('assistant');

  let userMessageTokens = 0;
  let responseTokens    = 0;
  let historyTokens     = 0;

  nonSystem.forEach((msg, i) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const tokens  = estimateTokens(content);
    if (i === lastUserIdx)      userMessageTokens = tokens;
    else if (i === lastAssistantIdx) responseTokens = tokens;
    else historyTokens += tokens;
  });

  const total = systemTokens + toolsTokens + historyTokens + userMessageTokens + responseTokens;
  const breakdown: TokenBreakdown = {
    system: systemTokens,
    history: historyTokens,
    tools: toolsTokens,
    userMessage: userMessageTokens,
    response: responseTokens,
    total,
  };

  // Fake Tool objects so detectWaste can check count + token thresholds
  const fakeTools: Tool[] | undefined = toolsLoaded?.map(name => ({ name }));
  const waste = detectWaste(breakdown, fakeTools);
  const repeated = detectRepeatedContext(messages);
  if (repeated) waste.push(repeated);
  const suggestions = generateSuggestions(waste, breakdown);

  return { perMessage, breakdown, waste, suggestions };
}
