import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import { createUser, getAllUsers, getTotalStats, getAllRecentSessions, getRecentSessions, getAggregateBreakdown, getSession, initDb, getStatsByEditor, sessionEvents, getUserByToken } from './storage/sessions';
import { authMiddleware, adminMiddleware, AuthenticatedRequest } from './middleware/auth';
import { getDashboardHtml, getLoginHtml, getRegisterHtml } from './dashboard/html';
import {
  handleAnalyzeConversation,
  handleAnalyzeSession,
  handleGetTokenBreakdown,
  handleGetSuggestions,
  handleGetSessionHistory,
  handleGetStats,
  handleSetBudget,
  handleExportReport,
  handleCompressContext,
  handleGetEditorStats,
  handleEstimateCost,
  handleGetBudgetStatus,
  handleWeeklySummary,
  handleSmartCompress,
  handleImprovePrompt,
} from './tools/index';

dotenv.config();

const app = express();

// In-memory rate limit for registration: 10 per IP per hour
const regRateLimit = new Map<string, { count: number; resetAt: number }>();
const REG_LIMIT = 10;
const REG_WINDOW_MS = 60 * 60 * 1000;
app.use(cors());
// NOTE: express.json() is intentionally NOT applied globally.
// The /message endpoint hands the raw request stream to SSEServerTransport.handlePostMessage,
// which must read the body itself. A global JSON middleware consumes the stream first,
// leaving it unreadable and causing "stream is not readable".

const PORT = parseInt(process.env.PORT || '3000', 10);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'tokenlens-mcp', version: '1.0.0' });
});

// Login page
app.get('/login', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(getLoginHtml());
});

// Registration page
app.get('/register', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(getRegisterHtml());
});

// Self-service registration endpoint
app.post('/register', express.json(), async (req: Request, res: Response) => {
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = regRateLimit.get(ip);
  if (entry && now < entry.resetAt) {
    if (entry.count >= REG_LIMIT) {
      res.status(429).json({ error: 'Too many registrations. Please try again in an hour.' });
      return;
    }
    entry.count++;
  } else {
    regRateLimit.set(ip, { count: 1, resetAt: now + REG_WINDOW_MS });
  }

  const rawName = (req.body as { name?: unknown }).name;
  const name = typeof rawName === 'string'
    ? rawName.replace(/[<>"'&]/g, '').trim().slice(0, 50) || 'User'
    : 'User';

  const id = uuidv4();
  const token = uuidv4();
  const user = await createUser(id, token, name);
  res.json({ token, name: user.name, id: user.id });
});

// Web dashboard
app.get('/dashboard', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(getDashboardHtml());
});

// Auth validate
app.get('/auth/validate', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ valid: false }); return; }
  const token = authHeader.slice(7);
  const user = await getUserByToken(token);
  if (!user) { res.status(401).json({ valid: false }); return; }
  res.json({ valid: true, name: user.name, id: user.id });
});

// SSE events for dashboard — token passed as query param (EventSource doesn't support headers)
app.get('/dashboard/events', async (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;
  const user = token ? await getUserByToken(token) : null;
  const userId = user?.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('data: {"type":"connected"}\n\n');

  if (!userId) {
    res.on('close', () => {});
    return;
  }

  const onSession = (session: { userId?: string } & Record<string, unknown>) => {
    if (session.userId !== userId) return;
    res.write(`data: ${JSON.stringify({ type: 'new_session', session })}\n\n`);
  };
  sessionEvents.on('new_session', onSession);
  res.on('close', () => { sessionEvents.off('new_session', onSession); });
});

// Dashboard data API — scoped to the authenticated user
app.get('/api/dashboard', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  let userId: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    const user = await getUserByToken(authHeader.slice(7));
    userId = user?.id;
  }
  if (!userId) {
    res.json({ stats: { totalSessions: 0, totalTokens: 0, totalCost: 0 }, breakdown: {}, editorStats: {}, recentSessions: [] });
    return;
  }
  const stats = await getTotalStats(userId);
  const breakdown = await getAggregateBreakdown(userId);
  const editorStats = await getStatsByEditor(userId);
  const recentSessions = (await getRecentSessions(userId, 20)).map(s => ({
    id: s.id, provider: s.provider, model: s.model, editor: s.editor,
    timestamp: s.timestamp, totalTokens: s.breakdown.total,
    cost: s.cost, wasteCount: s.waste.length,
  }));
  res.json({ stats, breakdown, editorStats, recentSessions });
});

app.get('/api/dashboard/session/:id', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  let userId: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    const user = await getUserByToken(authHeader.slice(7));
    userId = user?.id;
  }
  if (!userId) { res.status(404).json({ error: 'Not found' }); return; }
  const session = await getSession(req.params.id, userId);
  if (!session) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(session);
});

// Admin: create user
app.post('/admin/users', express.json(), adminMiddleware, async (req: Request, res: Response) => {
  const { name } = req.body as { name?: string };
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const id = uuidv4();
  const token = uuidv4();
  const user = await createUser(id, token, name);
  res.json({ user });
});

// Admin: list users
app.get('/admin/users', adminMiddleware, async (_req: Request, res: Response) => {
  const users = await getAllUsers();
  res.json({ users });
});

// Admin: server stats
app.get('/admin/stats', adminMiddleware, async (_req: Request, res: Response) => {
  const stats = await getTotalStats();
  res.json({ stats });
});

// Direct analysis endpoint for Chrome extension — no auth required
app.post('/analyze-direct', express.json(), async (req: Request, res: Response) => {
  try {
    const result = await handleAnalyzeConversation(req.body, 'extension');
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

// Prompt improvement endpoint for Chrome extension — no auth required
app.post('/improve-prompt', express.json(), async (req: Request, res: Response) => {
  try {
    const result = await handleImprovePrompt(req.body, 'extension');
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

// AI-powered prompt improvement — user supplies their own API key
app.post('/improve-prompt-ai', express.json(), async (req: Request, res: Response) => {
  try {
    const { prompt, goal, context, provider, apiKey } = req.body as {
      prompt?: string;
      goal?: string;
      context?: string;
      provider?: string;
      apiKey?: string;
    };

    if (!prompt || !provider || !apiKey) {
      res.status(400).json({ error: 'prompt, provider, and apiKey are required' });
      return;
    }
    if (!['anthropic', 'openai', 'groq'].includes(provider)) {
      res.status(400).json({ error: 'provider must be "anthropic", "openai", or "groq"' });
      return;
    }

    const systemPrompt = `You are an expert prompt engineer. Your job is to rewrite weak or vague prompts into precise, professional ones that get excellent results from AI coding assistants.

Rules:
- Remove filler words and vague phrases ("maybe", "kind of", "I think", "something like")
- Add specificity, constraints, and expected output format
- Keep the intent 100% faithful to the original
- If a goal is provided, optimize for that goal
- Be between 80-300 words

Respond with JSON only (no markdown fences):
{
  "improvedPrompt": "...",
  "qualityScore": 8,
  "improvements": ["removed vague phrase X", "added output format", "..."],
  "tip": "one actionable tip for even better results"
}`;

    const userContent = `Original prompt: "${prompt}"${goal ? `\nGoal: ${goal}` : ''}${context ? `\nContext: ${context}` : ''}\n\nRewrite it into a precise, professional prompt.`;

    function extractJson(text: string): unknown {
      const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      return JSON.parse(stripped);
    }

    let result: unknown;

    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as Record<string, unknown>;
        const msg = (err.error as Record<string, unknown> | undefined)?.message ?? `Anthropic error ${response.status}`;
        throw new Error(String(msg));
      }
      const data = await response.json() as { content?: Array<{ text?: string }> };
      result = extractJson(data.content?.[0]?.text ?? '{}');
    } else {
      const baseUrl = provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const model = provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 800,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userContent },
          ],
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as Record<string, unknown>;
        const label = provider === 'groq' ? 'Groq' : 'OpenAI';
        const msg = (err.error as Record<string, unknown> | undefined)?.message ?? `${label} error ${response.status}`;
        throw new Error(String(msg));
      }
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      result = extractJson(data.choices?.[0]?.message?.content ?? '{}');
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

// AI-powered prompt generation — user supplies their own API key, no server key needed
app.post('/generate-prompt', express.json(), async (req: Request, res: Response) => {
  try {
    const { userRequest, answers, provider, apiKey, projectContext } = req.body as {
      userRequest?: string;
      answers?: Record<string, string>;
      provider?: string;
      apiKey?: string;
      projectContext?: string;
    };

    if (!userRequest || !provider || !apiKey) {
      res.status(400).json({ error: 'userRequest, provider, and apiKey are required' });
      return;
    }
    if (!['anthropic', 'openai', 'groq'].includes(provider)) {
      res.status(400).json({ error: 'provider must be "anthropic", "openai", or "groq"' });
      return;
    }

    const answersText = Object.entries(answers ?? {})
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');

    const systemPrompt = `You are an expert prompt engineer specializing in helping developers and vibe coders get excellent results from AI coding assistants.

Generate ONE perfect, professional prompt based on the user's request and their chosen specifications. The prompt should:
- Be specific and actionable
- Include the exact tech stack they chose
- Have clear requirements and expected output
- Be structured with sections if needed
- Feel like it was written by a senior developer
- Be between 100-400 words

Respond with JSON only (no markdown fences):
{
  "prompt": "...",
  "qualityScore": 9,
  "estimatedTokens": 180,
  "tips": ["tip 1", "tip 2"]
}`;

    const userContent = `User wants to: ${userRequest}

Their specifications:
${answersText || '  (no specific preferences — use best practices)'}${projectContext ? `\n\nProject context: ${projectContext}` : ''}

Generate the perfect prompt for this.`;

    // Helper: strip markdown fences and parse JSON
    function extractJson(text: string): unknown {
      const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      return JSON.parse(stripped);
    }

    let result: unknown;

    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as Record<string, unknown>;
        const msg = (err.error as Record<string, unknown> | undefined)?.message ?? `Anthropic error ${response.status}`;
        throw new Error(String(msg));
      }
      const data = await response.json() as { content?: Array<{ text?: string }> };
      result = extractJson(data.content?.[0]?.text ?? '{}');

    } else {
      // OpenAI-compatible: both openai and groq use the same request shape
      const baseUrl = provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const model = provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 800,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userContent },
          ],
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as Record<string, unknown>;
        const label = provider === 'groq' ? 'Groq' : 'OpenAI';
        const msg = (err.error as Record<string, unknown> | undefined)?.message ?? `${label} error ${response.status}`;
        throw new Error(String(msg));
      }
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      result = extractJson(data.choices?.[0]?.message?.content ?? '{}');
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

// Tool definitions for MCP
const TOOLS = [
  {
    name: 'analyze_conversation',
    description: 'Paste any conversation and get an instant local analysis: token count per message, cost estimate, waste detection, and optimization suggestions. No API calls — runs entirely on-server.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        messages: {
          type: 'array',
          description: 'The conversation messages to analyze',
          items: {
            type: 'object',
            properties: {
              role:    { type: 'string', enum: ['user', 'assistant', 'system'] },
              content: { type: 'string' },
            },
            required: ['role', 'content'],
          },
        },
        model: {
          type: 'string',
          description: 'Model name for cost estimation (default: claude-sonnet-4-5)',
        },
        tools_loaded: {
          type: 'array',
          description: 'Names of tools that were active during the conversation',
          items: { type: 'string' },
        },
        provider: {
          type: 'string',
          enum: ['anthropic', 'openai', 'gemini', 'groq'],
          description: 'AI provider (default: anthropic)',
        },
        editor: {
          type: 'string',
          enum: ['cursor', 'claude_desktop', 'v0', 'chatgpt', 'api', 'other'],
          description: 'Editor/client where this conversation occurred (default: other)',
        },
      },
      required: ['messages'],
    },
  },
  {
    name: 'analyze_session',
    description: 'Retrieve full breakdown, waste, and suggestions for a previously analyzed session.',
    inputSchema: { type: 'object' as const, properties: { sessionId: { type: 'string' } } },
  },
  {
    name: 'get_token_breakdown',
    description: 'Detailed token counts per category with percentages for a session.',
    inputSchema: { type: 'object' as const, properties: { sessionId: { type: 'string' } }, required: ['sessionId'] },
  },
  {
    name: 'get_suggestions',
    description: 'Prioritized optimization suggestions with estimated token savings.',
    inputSchema: { type: 'object' as const, properties: { sessionId: { type: 'string' } } },
  },
  {
    name: 'get_session_history',
    description: 'List recent analyzed sessions with token counts and costs.',
    inputSchema: { type: 'object' as const, properties: { limit: { type: 'number' } } },
  },
  {
    name: 'get_stats',
    description: 'Overall usage stats for your account.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'set_budget',
    description: 'Configure token budget limits and alert thresholds.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionLimit:   { type: 'number' },
        dailyLimit:     { type: 'number' },
        alertThreshold: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
  },
  {
    name: 'export_report',
    description: 'Export a full Markdown report for a session (breakdown, waste, suggestions). Saves to ~/.tokenlens/reports/{sessionId}.md and returns the content.',
    inputSchema: {
      type: 'object' as const,
      properties: { sessionId: { type: 'string', description: 'Defaults to most recent session' } },
    },
  },
  {
    name: 'compress_context',
    description: 'Locally compress old conversation messages by extracting first sentences. No API calls. Returns a shorter messages array ready to reuse.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        messages: { type: 'array', items: { type: 'object' }, description: 'Full conversation messages' },
        keepLast: { type: 'number', description: 'Number of recent messages to keep intact (default 4)' },
      },
      required: ['messages'],
    },
  },
  {
    name: 'get_editor_stats',
    description: 'Token usage grouped by editor (Cursor, Claude Desktop, v0, ChatGPT, API, Other).',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'estimate_cost',
    description: 'Estimate cost BEFORE sending to API. Compares all models, recommends cheapest for your complexity.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        messages: { type: 'array', items: { type: 'object' } },
        system: { type: 'string' },
        tools_loaded: { type: 'array', items: { type: 'string' } },
      },
      required: ['messages'],
    },
  },
  {
    name: 'get_budget_status',
    description: 'Current budget: tokens used today vs limit, alert level, top waste sources, avg daily usage.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'weekly_summary',
    description: 'Weekly report: tokens + cost vs last week, top editor, daily Mon–Sun breakdown.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'smart_compress',
    description: 'Smart context compression: scores messages HIGH/LOW importance, keeps HIGH in full, compresses only LOW ones. No API calls.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        messages: { type: 'array', items: { type: 'object' } },
        keepLast: { type: 'number' },
      },
      required: ['messages'],
    },
  },
  {
    name: 'improve_prompt',
    description: 'Rewrite a vague or weak prompt into a precise, goal-oriented one. Removes filler words, adds specificity, appends goal-specific instructions, and returns a quality score (1–10). Pure local — no API calls.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        prompt:  { type: 'string', description: 'The original prompt to improve' },
        context: { type: 'string', description: 'What you are working on, e.g. "React component", "Python FastAPI"' },
        goal: {
          type: 'string',
          enum: ['fix_code', 'write_code', 'explain', 'review', 'general'],
          description: 'Override goal detection (default: auto-detect from prompt text)',
        },
      },
      required: ['prompt'],
    },
  },
];

// Track active transports keyed by sessionId for POST /message routing
const transports: Map<string, SSEServerTransport> = new Map();

app.get('/sse', authMiddleware as express.RequestHandler, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;

  const transport = new SSEServerTransport('/message', res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);

  const mcpServer = new Server(
    { name: 'tokenlens-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result: unknown;
      switch (name) {
        case 'analyze_conversation': result = await handleAnalyzeConversation(args, user.id); break;
        case 'analyze_session':      result = await handleAnalyzeSession(args, user.id); break;
        case 'get_token_breakdown':  result = await handleGetTokenBreakdown(args, user.id); break;
        case 'get_suggestions':      result = await handleGetSuggestions(args, user.id); break;
        case 'get_session_history':  result = await handleGetSessionHistory(args, user.id); break;
        case 'get_stats':            result = await handleGetStats(args, user.id); break;
        case 'set_budget':           result = await handleSetBudget(args, user.id); break;
        case 'export_report':        result = await handleExportReport(args, user.id); break;
        case 'compress_context':     result = await handleCompressContext(args, user.id); break;
        case 'get_editor_stats':     result = await handleGetEditorStats(args, user.id); break;
        case 'estimate_cost':        result = await handleEstimateCost(args, user.id); break;
        case 'get_budget_status':    result = await handleGetBudgetStatus(args, user.id); break;
        case 'weekly_summary':       result = await handleWeeklySummary(args, user.id); break;
        case 'smart_compress':       result = await handleSmartCompress(args, user.id); break;
        case 'improve_prompt':       result = await handleImprovePrompt(args, user.id); break;
        default: throw new Error(`Unknown tool: ${name}`);
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  });

  res.on('close', () => {
    transports.delete(sessionId);
  });

  await mcpServer.connect(transport);
});

app.post('/message', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  await transport.handlePostMessage(req, res);
});

// Initialize DB then start listening
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`TokenLens MCP server running on http://localhost:${PORT}`);
    console.log(`  Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`  Login:     http://localhost:${PORT}/login`);
    console.log(`  Register:  http://localhost:${PORT}/register`);
    console.log(`  Health:    http://localhost:${PORT}/health`);
    console.log(`  SSE:       http://localhost:${PORT}/sse`);
    console.log(`  Admin:     POST /admin/users  (set ADMIN_SECRET env var)`);
  });
}).catch(err => {
  process.stderr.write(`Failed to initialize DB: ${err}\n`);
  process.exit(1);
});
