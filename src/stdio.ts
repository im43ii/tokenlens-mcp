import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { initDb } from './storage/sessions';
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

process.on('uncaughtException', (err) => {
  process.stderr.write(`[TokenLens] uncaughtException: ${err.stack ?? err}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[TokenLens] unhandledRejection: ${reason}\n`);
  process.exit(1);
});

// Stdio mode uses a fixed local user ID — no auth needed
const STDIO_USER_ID = 'local';

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
          description: 'Editor/client where this conversation occurred (default: claude_desktop)',
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
        context: { type: 'string', description: 'What you are working on, e.g. "React component"' },
        goal: {
          type: 'string',
          enum: ['fix_code', 'write_code', 'explain', 'review', 'general'],
          description: 'Override goal detection (default: auto-detect)',
        },
      },
      required: ['prompt'],
    },
  },
];

async function main() {
  // Initialize DB before accepting any requests
  await initDb();

  const server = new Server(
    { name: 'tokenlens-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result: unknown;
      switch (name) {
        case 'analyze_conversation': result = await handleAnalyzeConversation(args, STDIO_USER_ID); break;
        case 'analyze_session':      result = await handleAnalyzeSession(args, STDIO_USER_ID); break;
        case 'get_token_breakdown':  result = await handleGetTokenBreakdown(args, STDIO_USER_ID); break;
        case 'get_suggestions':      result = await handleGetSuggestions(args, STDIO_USER_ID); break;
        case 'get_session_history':  result = await handleGetSessionHistory(args, STDIO_USER_ID); break;
        case 'get_stats':            result = await handleGetStats(args, STDIO_USER_ID); break;
        case 'set_budget':           result = await handleSetBudget(args, STDIO_USER_ID); break;
        case 'export_report':        result = await handleExportReport(args, STDIO_USER_ID); break;
        case 'compress_context':     result = await handleCompressContext(args, STDIO_USER_ID); break;
        case 'get_editor_stats':     result = await handleGetEditorStats(args, STDIO_USER_ID); break;
        case 'estimate_cost':        result = await handleEstimateCost(args, STDIO_USER_ID); break;
        case 'get_budget_status':    result = await handleGetBudgetStatus(args, STDIO_USER_ID); break;
        case 'weekly_summary':       result = await handleWeeklySummary(args, STDIO_USER_ID); break;
        case 'smart_compress':       result = await handleSmartCompress(args, STDIO_USER_ID); break;
        case 'improve_prompt':       result = await handleImprovePrompt(args, STDIO_USER_ID); break;
        default: throw new Error(`Unknown tool: ${name}`);
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`TokenLens stdio error: ${err}\n`);
  process.exit(1);
});
