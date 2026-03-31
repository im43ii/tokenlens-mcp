import { z } from 'zod';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { analyzeConversation } from '../analyzer/breakdown';
import { getSession, getRecentSessions, getTotalStats, getBudget, setBudget, saveSession, getStatsByEditor, getSessionsInDateRange } from '../storage/sessions';
import { MODEL_PRICING, Session } from '../types/index';

// ── Shared message schema ────────────────────────────────────────────────────
const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.union([
    z.string(),
    z.array(z.object({ type: z.string(), text: z.string().optional() })),
  ]),
});

// ── analyze_conversation ─────────────────────────────────────────────────────
const AnalyzeConversationSchema = z.object({
  messages:     z.array(MessageSchema).min(1),
  model:        z.string().optional().default('claude-sonnet-4-5'),
  tools_loaded: z.array(z.string()).optional(),
  provider:     z.enum(['anthropic', 'openai', 'gemini', 'groq']).optional().default('anthropic'),
  editor:       z.enum(['cursor','claude_desktop','v0','chatgpt','api','other']).optional().default('other'),
});

export async function handleAnalyzeConversation(args: unknown, userId: string): Promise<unknown> {
  const { messages, model, tools_loaded, provider, editor } = AnalyzeConversationSchema.parse(args);

  const { perMessage, breakdown, waste, suggestions } = analyzeConversation(messages, tools_loaded);

  // Cost estimate using local pricing table
  const pricing = MODEL_PRICING[model];
  const inputTokens = breakdown.system + breakdown.history + breakdown.tools + breakdown.userMessage;
  const cost = pricing
    ? (inputTokens / 1_000_000) * pricing.input + (breakdown.response / 1_000_000) * pricing.output
    : 0;

  const sessionId = randomUUID();
  await saveSession({
    id: sessionId,
    userId,
    provider: provider ?? 'anthropic',
    model,
    editor,
    timestamp: Date.now(),
    breakdown,
    waste,
    suggestions,
    cost,
  });

  return {
    sessionId,
    model,
    perMessage,
    breakdown,
    cost: {
      estimated: cost,
      currency: 'USD',
      note: pricing ? `Based on ${model} pricing` : `Unknown model — cost not available`,
    },
    waste,
    suggestions,
    summary: {
      totalMessages: messages.length,
      totalTokens: breakdown.total,
      wasteItems: waste.length,
      topSuggestion: suggestions[0]?.title ?? null,
    },
  };
}

// ── analyze_session ──────────────────────────────────────────────────────────
export async function handleAnalyzeSession(args: unknown, userId: string): Promise<unknown> {
  const { sessionId } = z.object({ sessionId: z.string().optional() }).parse(args);
  let session;
  if (sessionId) {
    session = await getSession(sessionId, userId);
    if (!session) throw new Error('Session not found');
  } else {
    const recent = await getRecentSessions(userId, 1);
    if (!recent.length) throw new Error('No sessions found');
    session = recent[0];
  }
  return {
    session,
    summary: {
      totalTokens: session.breakdown.total,
      wasteCount: session.waste.length,
      suggestionCount: session.suggestions.length,
      estimatedCost: session.cost,
    },
  };
}

// ── get_token_breakdown ──────────────────────────────────────────────────────
export async function handleGetTokenBreakdown(args: unknown, userId: string): Promise<unknown> {
  const { sessionId } = z.object({ sessionId: z.string() }).parse(args);
  const session = await getSession(sessionId, userId);
  if (!session) throw new Error('Session not found');
  const { breakdown } = session;
  const total = breakdown.total || 1;
  return {
    breakdown,
    percentages: {
      system:      ((breakdown.system      / total) * 100).toFixed(1) + '%',
      history:     ((breakdown.history     / total) * 100).toFixed(1) + '%',
      tools:       ((breakdown.tools       / total) * 100).toFixed(1) + '%',
      userMessage: ((breakdown.userMessage / total) * 100).toFixed(1) + '%',
      response:    ((breakdown.response    / total) * 100).toFixed(1) + '%',
    },
  };
}

// ── get_suggestions ──────────────────────────────────────────────────────────
export async function handleGetSuggestions(args: unknown, userId: string): Promise<unknown> {
  const { sessionId } = z.object({ sessionId: z.string().optional() }).parse(args);
  let session;
  if (sessionId) {
    session = await getSession(sessionId, userId);
    if (!session) throw new Error('Session not found');
  } else {
    const recent = await getRecentSessions(userId, 1);
    if (!recent.length) throw new Error('No sessions found');
    session = recent[0];
  }
  return {
    suggestions: session.suggestions,
    totalEstimatedSavings: session.suggestions.reduce((s, x) => s + x.estimatedSavings, 0),
  };
}

// ── get_session_history ──────────────────────────────────────────────────────
export async function handleGetSessionHistory(args: unknown, userId: string): Promise<unknown> {
  const { limit } = z.object({ limit: z.number().optional().default(10) }).parse(args);
  const sessions = await getRecentSessions(userId, limit);
  return {
    sessions: sessions.map(s => ({
      id: s.id,
      provider: s.provider,
      model: s.model,
      timestamp: s.timestamp,
      totalTokens: s.breakdown.total,
      cost: s.cost,
      wasteCount: s.waste.length,
    })),
    count: sessions.length,
  };
}

// ── get_stats ────────────────────────────────────────────────────────────────
export async function handleGetStats(args: unknown, userId: string): Promise<unknown> {
  void args;
  return await getTotalStats(userId);
}

// ── set_budget ───────────────────────────────────────────────────────────────
export async function handleSetBudget(args: unknown, _userId: string): Promise<unknown> {
  const params = z.object({
    sessionLimit:    z.number().nullable().optional(),
    dailyLimit:      z.number().nullable().optional(),
    alertThreshold:  z.number().min(0).max(1).optional(),
  }).parse(args);
  await setBudget(params);
  return { success: true, budget: await getBudget() };
}

// ── export_report ─────────────────────────────────────────────────────────────
function buildMarkdown(s: Session): string {
  const date = new Date(s.timestamp).toLocaleString();
  const b = s.breakdown;
  const total = b.total || 1;
  const pct = (n: number) => ((n / total) * 100).toFixed(1) + '%';

  const lines: string[] = [
    `# TokenLens Report`,
    ``,
    `**Session:** ${s.id}  `,
    `**Date:** ${date}  `,
    `**Model:** ${s.model}  `,
    `**Provider:** ${s.provider}  `,
    `**Estimated Cost:** $${s.cost.toFixed(6)}`,
    ``,
    `## Token Breakdown`,
    ``,
    `| Category       | Tokens | % of Total |`,
    `|----------------|--------|------------|`,
    `| System Prompt  | ${b.system}  | ${pct(b.system)} |`,
    `| History        | ${b.history} | ${pct(b.history)} |`,
    `| Tools          | ${b.tools}   | ${pct(b.tools)} |`,
    `| User Message   | ${b.userMessage} | ${pct(b.userMessage)} |`,
    `| Response       | ${b.response} | ${pct(b.response)} |`,
    `| **Total**      | **${b.total}** | 100% |`,
    ``,
  ];

  if (s.waste.length) {
    lines.push(`## Waste Detected`, ``);
    for (const w of s.waste) {
      const icon = w.severity === 'high' ? '🔴' : w.severity === 'medium' ? '🟡' : '🟢';
      lines.push(`### ${icon} ${w.type.replace(/_/g, ' ')} (${w.severity})`);
      lines.push(w.description);
      if (w.estimatedWaste > 0) lines.push(`*~${w.estimatedWaste} tokens wasted*`);
      lines.push('');
    }
  }

  if (s.suggestions.length) {
    lines.push(`## Optimization Suggestions`, ``);
    for (const sg of s.suggestions) {
      lines.push(`### ${sg.priority}. ${sg.title}`);
      lines.push(sg.description);
      if (sg.estimatedSavings > 0) lines.push(`*Estimated savings: ~${sg.estimatedSavings} tokens*`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export async function handleExportReport(args: unknown, userId: string): Promise<unknown> {
  const { sessionId } = z.object({ sessionId: z.string().optional() }).parse(args);
  let session: Session | null = null;
  if (sessionId) {
    session = await getSession(sessionId, userId);
    if (!session) throw new Error('Session not found');
  } else {
    const recent = await getRecentSessions(userId, 1);
    if (!recent.length) throw new Error('No sessions found');
    session = recent[0];
  }

  const markdown = buildMarkdown(session);
  const reportsDir = path.join(process.env.HOME || '/tmp', '.tokenlens', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const filePath = path.join(reportsDir, `${session.id}.md`);
  fs.writeFileSync(filePath, markdown, 'utf-8');

  return { filePath, markdown };
}

// ── compress_context (local — no API calls) ───────────────────────────────────
export async function handleCompressContext(args: unknown, _userId: string): Promise<unknown> {
  const { messages, keepLast } = z.object({
    messages:  z.array(MessageSchema).min(1),
    keepLast:  z.number().int().min(1).optional().default(4),
  }).parse(args);

  if (messages.length <= keepLast) {
    return { compressed: messages, savedTokens: 0, note: 'Nothing to compress — message count within keepLast limit.' };
  }

  const toCompress = messages.slice(0, messages.length - keepLast);
  const toKeep     = messages.slice(messages.length - keepLast);

  // Extract first sentence of each message as its summary line
  function firstSentence(text: string): string {
    const match = text.match(/^[^.!?\n]{10,}[.!?]/);
    return match ? match[0].trim() : text.slice(0, 120).trim();
  }

  const summaryLines = toCompress.map(m => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return `${m.role}: ${firstSentence(content)}`;
  });

  const originalChars = toCompress.reduce((sum, m) => {
    const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return sum + c.length;
  }, 0);

  const summaryText = summaryLines.join('  \n');
  const savedTokens = Math.round((originalChars - summaryText.length) / 4);

  const compressed = [
    {
      role: 'user' as const,
      content: `[SUMMARY — ${toCompress.length} messages compressed]\n${summaryText}`,
    },
    ...toKeep,
  ];

  return {
    compressed,
    originalMessages: toCompress.length,
    compressedTo: 1,
    savedTokens: Math.max(0, savedTokens),
  };
}

// ── get_editor_stats ──────────────────────────────────────────────────────────
export async function handleGetEditorStats(args: unknown, userId: string): Promise<unknown> {
  void args;
  return await getStatsByEditor(userId);
}

// ── estimate_cost ─────────────────────────────────────────────────────────────
const EstimateCostSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  system: z.string().optional(),
  tools_loaded: z.array(z.string()).optional(),
});

export async function handleEstimateCost(args: unknown, _userId: string): Promise<unknown> {
  const { messages, system, tools_loaded } = EstimateCostSchema.parse(args);
  const systemTokens = system ? Math.ceil(system.length / 4) : 0;
  const toolTokens = tools_loaded ? tools_loaded.length * 200 : 0;
  const messageTokens = messages.reduce((sum, m) => {
    const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return sum + Math.ceil(c.length / 4);
  }, 0);
  const inputTokens = systemTokens + toolTokens + messageTokens;
  const fullText = messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join(' ');
  const hasCode = /```|function |class |import |const |let |var /.test(fullText);
  const isLong = inputTokens > 2000;
  const isComplex = hasCode || isLong;
  const estimatedOutput = Math.round(inputTokens * (isComplex ? 0.6 : 0.4));
  const models = Object.entries(MODEL_PRICING).map(([model, p]) => {
    const inputCost = (inputTokens / 1_000_000) * p.input;
    const outputCost = (estimatedOutput / 1_000_000) * p.output;
    return { model, inputCost, outputCost, total: inputCost + outputCost };
  }).sort((a, b) => a.total - b.total);
  const recommended = isComplex
    ? (models.find(m => m.model.includes('sonnet') || m.model.includes('gpt-4o'))?.model ?? models[0].model)
    : models[0].model;
  return {
    inputTokens, estimatedOutputTokens: estimatedOutput,
    breakdown: { system: systemTokens, tools: toolTokens, messages: messageTokens },
    models, recommended,
    complexity: isComplex ? 'high' : 'low',
  };
}

// ── get_budget_status ─────────────────────────────────────────────────────────
export async function handleGetBudgetStatus(args: unknown, userId: string): Promise<unknown> {
  void args;
  const budget = await getBudget();
  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now - 7 * 24 * 3600 * 1000);
  const todaySessions = await getSessionsInDateRange(userId, todayStart.getTime(), now);
  const tokensToday = todaySessions.reduce((s, x) => s + x.breakdown.total, 0);
  const costToday = todaySessions.reduce((s, x) => s + x.cost, 0);
  const weekSessions = await getSessionsInDateRange(userId, weekStart.getTime(), now);
  const avgDailyTokens = weekSessions.reduce((s, x) => s + x.breakdown.total, 0) / 7;
  let dailyLevel: 'ok' | 'warning' | 'critical' = 'ok';
  let dailyPct = 0;
  if (budget.dailyLimit) {
    dailyPct = tokensToday / budget.dailyLimit;
    dailyLevel = dailyPct >= 0.95 ? 'critical' : dailyPct >= 0.8 ? 'warning' : 'ok';
  }
  const wasteCounts: Record<string, number> = {};
  for (const s of weekSessions) for (const w of s.waste) wasteCounts[w.type] = (wasteCounts[w.type] || 0) + 1;
  const topWaste = Object.entries(wasteCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type, count]) => ({ type, count }));
  const daysUntilLimit = budget.dailyLimit && avgDailyTokens > 0
    ? Math.round((budget.dailyLimit - tokensToday) / avgDailyTokens) : null;
  return {
    daily: { tokensUsed: tokensToday, limit: budget.dailyLimit, pctUsed: (dailyPct * 100).toFixed(1) + '%', level: dailyLevel, costToday },
    budget, topWasteSources: topWaste, daysUntilDailyLimit: daysUntilLimit,
    avgDailyTokens: Math.round(avgDailyTokens),
  };
}

// ── weekly_summary ────────────────────────────────────────────────────────────
export async function handleWeeklySummary(args: unknown, userId: string): Promise<unknown> {
  void args;
  const now = Date.now();
  const thisWeekStart = now - 7 * 24 * 3600 * 1000;
  const lastWeekStart = now - 14 * 24 * 3600 * 1000;
  const thisWeek = await getSessionsInDateRange(userId, thisWeekStart, now);
  const lastWeek = await getSessionsInDateRange(userId, lastWeekStart, thisWeekStart);
  const thisTokens = thisWeek.reduce((s, x) => s + x.breakdown.total, 0);
  const lastTokens = lastWeek.reduce((s, x) => s + x.breakdown.total, 0);
  const thisCost = thisWeek.reduce((s, x) => s + x.cost, 0);
  const lastCost = lastWeek.reduce((s, x) => s + x.cost, 0);
  const tokenChange = lastTokens > 0 ? ((thisTokens - lastTokens) / lastTokens * 100).toFixed(1) : null;
  const costChange = lastCost > 0 ? ((thisCost - lastCost) / lastCost * 100).toFixed(1) : null;
  const editorTokens: Record<string, number> = {};
  for (const s of thisWeek) editorTokens[s.editor || 'other'] = (editorTokens[s.editor || 'other'] || 0) + s.breakdown.total;
  const topEditor = Object.entries(editorTokens).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
  const wasteCounts: Record<string, number> = {};
  for (const s of thisWeek) for (const w of s.waste) wasteCounts[w.type] = (wasteCounts[w.type] || 0) + 1;
  const biggestWaste = Object.entries(wasteCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
  const daily: Record<string, number> = {};
  for (let d = 0; d < 7; d++) {
    const dayStart = new Date(now - (6 - d) * 24 * 3600 * 1000); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    const label = dayStart.toLocaleDateString('en', { weekday: 'short' });
    daily[label] = thisWeek.filter(s => s.timestamp >= dayStart.getTime() && s.timestamp < dayEnd.getTime()).reduce((sum, s) => sum + s.breakdown.total, 0);
  }
  return {
    thisWeek: { sessions: thisWeek.length, tokens: thisTokens, cost: thisCost },
    lastWeek: { sessions: lastWeek.length, tokens: lastTokens, cost: lastCost },
    changes: { tokens: tokenChange ? tokenChange + '%' : 'n/a', cost: costChange ? costChange + '%' : 'n/a' },
    topEditor, biggestWasteType: biggestWaste, daily,
  };
}

// ── improve_prompt ────────────────────────────────────────────────────────────

type ProjectType =
  | 'landing_page' | 'dashboard'   | 'auth_form'       | 'api'
  | 'mobile_app'   | 'script'      | 'component'       | 'full_stack_app'
  | 'chrome_extension' | 'data_pipeline' | 'generic';

type DomainType = 'web' | 'mobile' | 'data' | 'automation' | 'general';
type ActionType = 'build' | 'fix' | 'explain' | 'review';

interface ImproveTechStack { primary: string; reason: string; }

interface PromptVariation {
  label:           string;
  recommended?:    boolean;
  prompt:          string;
  estimatedTokens: number;
  qualityScore:    number;
}

interface VarCtx {
  subject:        string;
  projectType:    ProjectType;
  stack:          ImproveTechStack;
  originalPrompt: string;
  context?:       string;
}

// ── Detection ──────────────────────────────────────────────────────────────────

function ipDetectAction(p: string): ActionType {
  if (/\b(fix|repair|debug|solve|resolve|broken)\b/i.test(p))  return 'fix';
  if (/\b(explain|what is|how does|describe|why)\b/i.test(p))  return 'explain';
  if (/\b(review|check|audit|analy[sz]e|look at)\b/i.test(p)) return 'review';
  return 'build';
}

function ipDetectType(p: string): ProjectType {
  const t = p.toLowerCase();
  if (/\b(saas|landing|homepage|hero|features.?section)\b/.test(t))            return 'landing_page';
  if (/\b(dashboard|admin.?panel|analytics.?panel|data.?viz)\b/.test(t))       return 'dashboard';
  if (/\b(login|signup|register|auth(entication)?|password)\b/.test(t))        return 'auth_form';
  if (/\b(api|endpoint|rest|graphql|backend|server.?route)\b/.test(t))         return 'api';
  if (/\b(mobile|ios|android|react.?native|expo|flutter)\b/.test(t))           return 'mobile_app';
  if (/\b(script|automation|bot|scraper|cron|etl|pipeline)\b/.test(t))         return 'script';
  if (/\b(component|button|card|modal|dialog|navbar|sidebar|input.?field)\b/.test(t)) return 'component';
  if (/\b(chrome.?extension|browser.?extension|manifest)\b/.test(t))           return 'chrome_extension';
  if (/\b(data.?pipeline|data.?process|transform|kafka|airflow)\b/.test(t))    return 'data_pipeline';
  if (/\b(app|application|platform|system|full.?stack)\b/.test(t))             return 'full_stack_app';
  return 'generic';
}

function ipDetectDomain(pt: ProjectType): DomainType {
  if (['landing_page','dashboard','auth_form','component','full_stack_app','api'].includes(pt)) return 'web';
  if (pt === 'mobile_app')    return 'mobile';
  if (pt === 'data_pipeline') return 'data';
  if (pt === 'script')        return 'automation';
  return 'general';
}

const IP_SUBJECTS: Record<ProjectType, string> = {
  landing_page:     'SaaS landing page',
  dashboard:        'analytics dashboard',
  auth_form:        'authentication system',
  api:              'REST API',
  mobile_app:       'mobile app',
  script:           'automation script',
  component:        'UI component',
  full_stack_app:   'full-stack web application',
  chrome_extension: 'Chrome extension',
  data_pipeline:    'data pipeline',
  generic:          'application',
};

function ipVagueScore(p: string): number {
  const words = p.trim().split(/\s+/).length;
  let score = words < 4 ? 1 : words < 8 ? 2 : words < 15 ? 3 : words < 25 ? 4 : 5;
  if (/react|next\.?js|vue|angular|svelte|tailwind|typescript|python|node/i.test(p)) score = Math.min(5, score + 1);
  if (/validat|auth|responsive|dark.?mode|mobile.?first|error.?handling/i.test(p))   score = Math.min(5, score + 0.5);
  if (/zod|prisma|postgres|supabase|firebase|stripe|openai/i.test(p))                score = Math.min(5, score + 0.5);
  return Math.max(1, Math.min(5, Math.round(score)));
}

// ── Static data tables ─────────────────────────────────────────────────────────

const IP_STACKS: Record<ProjectType, ImproveTechStack> = {
  landing_page:     { primary: 'Next.js 14 + Tailwind CSS + shadcn/ui',          reason: 'Best for modern SaaS pages — fast, SEO-friendly, easy to customize' },
  dashboard:        { primary: 'React + Recharts + Tailwind CSS',                 reason: 'Recharts handles complex data visualization with minimal setup' },
  auth_form:        { primary: 'Next.js + NextAuth.js + Zod + shadcn/ui',         reason: 'NextAuth handles OAuth, JWT, and sessions out of the box' },
  api:              { primary: 'Node.js + Express + TypeScript + Zod',             reason: 'Lightweight, typed, fast — great for REST APIs of any size' },
  mobile_app:       { primary: 'React Native + Expo',                              reason: 'Cross-platform with one codebase, huge ecosystem, easy OTA updates' },
  script:           { primary: 'Python 3.11+',                                     reason: 'Fastest to write, best library support for automation and data tasks' },
  component:        { primary: 'React + TypeScript + Tailwind CSS',                reason: 'TypeScript props keep components self-documenting and type-safe' },
  full_stack_app:   { primary: 'Next.js 14 + Prisma + PostgreSQL + Tailwind CSS',  reason: 'Full-stack in one framework — API routes, SSR, ORM, and UI' },
  chrome_extension: { primary: 'Vanilla JS + Manifest V3',                         reason: 'No bundler needed for simple extensions — MV3 is the current standard' },
  data_pipeline:    { primary: 'Python + pandas + SQLAlchemy',                     reason: 'pandas is the standard for data wrangling; SQLAlchemy handles DB output' },
  generic:          { primary: 'TypeScript + Node.js',                              reason: 'Safe, versatile default for most programming tasks' },
};

const IP_QUESTIONS: Record<ProjectType, string[]> = {
  landing_page:     [
    "What does your product do? (helps write relevant copy and sections)",
    "Preferred tech stack? (Next.js, React, plain HTML...)",
    "Any design style in mind? (minimal, bold, dark theme, Linear/Vercel style...)",
  ],
  dashboard:        [
    "What data are you displaying? (sales, analytics, user metrics...)",
    "Who are the users? (admins, customers, internal team...)",
    "Any preferred chart library? (Recharts, Chart.js, or open to suggestion...)",
  ],
  auth_form:        [
    "What auth fields do you need? (email/password, social login, magic link...)",
    "Using an auth library? (NextAuth, Clerk, Supabase, custom...)",
    "What happens after login? (redirect to dashboard, show a profile...)",
  ],
  api:              [
    "What resource does this API manage? (users, products, orders...)",
    "REST or GraphQL? Framework preference? (Express, Fastify, FastAPI...)",
    "Do you need auth or rate limiting on the endpoints?",
  ],
  mobile_app:       [
    "iOS only, Android only, or cross-platform?",
    "React Native + Expo, or native Swift/Kotlin?",
    "What are the 2–3 core screens or features?",
  ],
  script:           [
    "What's the input and expected output of the script?",
    "Python or Node.js?",
    "Does it run on a schedule (cron) or on demand?",
  ],
  component:        [
    "Which framework? (React, Vue, Svelte, plain HTML...)",
    "Any design system to follow? (shadcn, Material UI, custom tokens...)",
    "What props or data does this component receive?",
  ],
  full_stack_app:   [
    "What's the single most important action users will do in this app?",
    "Preferred stack? (Next.js + PostgreSQL, MERN, Django + React...)",
    "Do you need auth, payments, or any third-party integrations?",
  ],
  chrome_extension: [
    "Which site(s) does it run on, or is it a general extension?",
    "What does the popup show? What runs in the background?",
    "Does it need to store data? (Chrome storage, remote server...)",
  ],
  data_pipeline:    [
    "What's the data source? (CSV, API, database, web scraping...)",
    "What's the output format? (database table, JSON file, dashboard...)",
    "How often does it run? (real-time, hourly, nightly batch...)",
  ],
  generic:          [
    "Can you describe in more detail what you want to build or achieve?",
    "What language or framework are you working with?",
    "What's the expected input, and what should the output look like?",
  ],
};

const IP_TIPS: Record<ProjectType, string> = {
  landing_page:     "Include your product name and one-line value prop — it makes the copy generation much more accurate.",
  dashboard:        "Specify which 3–4 metrics matter most — that shapes the entire layout.",
  auth_form:        "Mention your backend/DB (Supabase, Prisma, etc.) upfront to avoid refactoring the auth logic later.",
  api:              "List your data model fields — even rough ones — so the routes and types are usable immediately.",
  mobile_app:       "Describe the user flow for the most important action step-by-step.",
  script:           "Show a sample input row and expected output — it removes all ambiguity.",
  component:        "Paste your existing color tokens or Tailwind config so the component matches your design system.",
  full_stack_app:   "Start with 2–3 MVP features only — trying to spec everything leads to generic code.",
  chrome_extension: "Describe one specific thing the extension helps the user do — concrete beats abstract every time.",
  data_pipeline:    "Attach a sample row of your input data — transformations are hard to specify without an example.",
  generic:          "The more specific you are about input, output, and constraints, the closer the first result will be.",
};

// ── Variation builders ─────────────────────────────────────────────────────────

function buildQuick(ctx: VarCtx): string {
  const { subject, projectType: pt, stack, originalPrompt, context } = ctx;
  const tech = stack.primary.split('+')[0].trim();
  const ctxPrefix = context ? `Context: ${context}. ` : '';

  const MAP: Record<ProjectType, string> = {
    landing_page:
      `${ctxPrefix}Build a ${subject} with: hero (headline + CTA), features grid, pricing table (3 tiers), and footer. Use ${stack.primary}. Make it responsive and modern.`,
    dashboard:
      `${ctxPrefix}Build a ${subject} with a sidebar nav, KPI metric cards, a line chart, and a sortable data table. Use ${stack.primary}. Mobile-responsive.`,
    auth_form:
      `${ctxPrefix}Build a ${subject} with email/password fields, Zod validation, inline error messages, and a submit button. Use ${stack.primary}.`,
    api:
      `${ctxPrefix}Build a ${subject} with full CRUD endpoints for a single resource. Use ${stack.primary}. Include input validation and consistent error responses.`,
    mobile_app:
      `${ctxPrefix}Build a ${subject} with 3 screens: home list, detail view, and settings. Use ${stack.primary}. Follow platform design guidelines.`,
    script:
      `${ctxPrefix}Write a ${subject} in ${tech} that reads the input, processes it, and outputs the result. Include error handling and clear progress logging.`,
    component:
      `${ctxPrefix}Build a reusable ${subject} in ${tech} with TypeScript props, accessible markup, and Tailwind styling. Export as a named component.`,
    full_stack_app:
      `${ctxPrefix}Build a ${subject} with user auth, a core CRUD feature, and a clean UI. Use ${stack.primary}. Keep it focused end-to-end.`,
    chrome_extension:
      `${ctxPrefix}Build a ${subject} with a popup UI, content script, and service worker. Use ${stack.primary}. Make it work on the target page.`,
    data_pipeline:
      `${ctxPrefix}Write a ${subject} in ${tech} that reads source data, transforms it, and writes to the destination. Log progress and handle errors gracefully.`,
    generic:
      `${ctxPrefix}${originalPrompt.trim()}. Use ${tech}. Follow best practices, add error handling, and include inline comments for clarity.`,
  };
  return MAP[pt] ?? MAP.generic;
}

function buildPro(ctx: VarCtx): string {
  const { subject, projectType: pt, stack, context } = ctx;
  const ctxLine = context ? `\n**Context**: ${context}\n` : '';

  const MAP: Record<ProjectType, string> = {
    landing_page:
`Build a modern SaaS ${subject}.${ctxLine}

**Sections**:
- **Hero**: Bold headline, 1–2 line subheadline, primary CTA button, hero image/mockup placeholder
- **Features**: 3–6 cards — icon, short title, 1–2 sentence description
- **Pricing**: 3 tiers (Free / Pro / Enterprise) with a feature list and highlighted recommended plan
- **Social proof**: 3 testimonial cards or a company logo strip (realistic placeholder data)
- **FAQ**: 5–6 accordion items covering common objections
- **Footer**: Nav links, social icons, copyright

**Tech stack**: ${stack.primary}
**Requirements**:
- Fully responsive, mobile-first layout
- Dark/light mode toggle (next-themes or CSS variables)
- Smooth scroll + anchor navigation
- TypeScript throughout
- All copy in a \`lib/constants.ts\` file — easy to swap

Output: Complete, runnable Next.js page in \`app/page.tsx\` plus child components.`,

    dashboard:
`Build a ${subject}.${ctxLine}

**Layout**:
- Sidebar: logo, nav links (Dashboard, Analytics, Users, Settings), collapse toggle
- Top bar: page title, date range picker, user avatar with dropdown

**Widgets**:
- 4 KPI cards: value, % change vs last period, trend icon (up/down)
- Line chart: 30-day trend
- Bar chart: comparison by category
- Donut chart: distribution breakdown
- Sortable, paginated data table with search + row actions (view / edit / delete)

**Tech stack**: ${stack.primary}
**Requirements**:
- Sidebar collapses to icon-only on mobile
- Realistic mock data — no real API needed
- Loading skeleton states for every widget
- TypeScript + proper Recharts typings

Output: Complete app with all components and mock data wired up.`,

    auth_form:
`Build a complete ${subject}.${ctxLine}

**Pages**:
- **Login**: email + password, "Remember me", "Forgot password" link, Google + GitHub social buttons
- **Register**: name, email, password, confirm password, terms checkbox
- **Forgot password**: email input → success state → resend link
- **Protected route wrapper**: redirects unauthenticated users to /login

**Tech stack**: ${stack.primary}
**Requirements**:
- Client-side validation with Zod before any server call
- Inline error messages per field (not alert boxes)
- Loading spinner on submit button
- Accessible: proper labels, aria-invalid, focus management on error
- Session handling — explain your approach in a comment

Output: All pages + auth provider setup + \`useAuth\` hook.`,

    api:
`Build a production-ready ${subject}.${ctxLine}

**Endpoints**:
- \`GET    /items\`     — paginated list (?page=1&limit=20)
- \`GET    /items/:id\` — single item (404 if not found)
- \`POST   /items\`     — create with Zod-validated body
- \`PUT    /items/:id\` — full replacement
- \`PATCH  /items/:id\` — partial update
- \`DELETE /items/:id\` — soft delete preferred

**Error format**: \`{ error: string, code: string, statusCode: number }\`

**Tech stack**: ${stack.primary}
**Requirements**:
- Input validation on all mutating routes (Zod middleware)
- Correct HTTP status codes (200, 201, 400, 401, 404, 422, 500)
- Request/response logging middleware
- Auth Bearer token middleware (stub is fine — show the pattern)
- Config via .env (no hardcoded values)

Output: Complete Express app + router + Zod schemas + README with sample curl commands.`,

    mobile_app:
`Build a ${subject}.${ctxLine}

**Screens**:
- **Home**: FlatList of items, pull-to-refresh, loading skeleton, empty state
- **Detail**: full item view, action button (e.g. favourite/share), back nav
- **Settings**: user profile section, toggle preferences, logout

**Navigation**: Bottom tab bar (Home / Search / Profile) + stack navigator for detail screens

**Tech stack**: ${stack.primary}
**Requirements**:
- TypeScript throughout with typed navigation params
- Proper loading, error, and empty states on every screen
- Safe area handling (notch, home indicator)
- Platform-aware styles (iOS vs Android where they differ)
- Mock data — no real backend needed

Output: Complete Expo app with navigation configured and all screens.`,

    script:
`Write a production-quality ${subject}.${ctxLine}

**Interface**:
- CLI args: input source, output destination, optional flags
- \`--dry-run\`: show what would happen without doing it
- \`--verbose\`: extra logging

**Structure**:
- \`validate_input()\` — check schema/format, log bad rows
- \`transform(data)\`  — pure function, easy to unit-test
- \`load_output()\`    — write result, handle partial failures

**Tech stack**: ${stack.primary}
**Requirements**:
- Try/except error handling with helpful messages (not raw tracebacks)
- Progress logging at each major step
- Exit codes: 0 = success, 1 = input error, 2 = runtime error
- Unit tests for \`transform()\` with at least 3 cases

Output: Main script + test file + sample input data + usage examples in a docstring.`,

    component:
`Build a reusable \`${subject}\`.${ctxLine}

**Props interface** (TypeScript):
- All required props explicitly typed
- Optional props with defaults documented
- Callback props typed with event payload

**States to handle**:
- Default / idle
- Hover + focus (keyboard-accessible)
- Loading / disabled
- Error state with message slot
- Empty / zero-data state

**Tech stack**: ${stack.primary}
**Requirements**:
- ARIA roles, keyboard navigation, \`focus-visible\` ring
- \`className\` prop for external style overrides
- JSDoc comment on every prop
- Follows CSS variable / Tailwind token conventions

Output: Component file + Storybook story covering every state + one React Testing Library test.`,

    full_stack_app:
`Build a production-ready ${subject}.${ctxLine}

**Core features**:
- User auth: email/password + social login, protected routes
- Main CRUD feature: list, create, edit, delete with optimistic UI
- Dashboard: key stats at a glance
- User settings / profile page

**Tech stack**: ${stack.primary}
**Requirements**:
- Type-safe API layer (tRPC or typed fetch wrappers)
- Prisma schema with at least 2 relations + a migration
- Zod validation on every form and API input
- Error boundaries + loading states on every async operation
- Responsive UI — mobile and desktop
- All secrets in .env (no hardcoded values)

Output: Full project structure, all pages, API routes, DB schema, and a 5-step local setup guide.`,

    chrome_extension:
`Build a Manifest V3 Chrome extension: ${subject}.${ctxLine}

**Files**:
- \`manifest.json\` — permissions, host_permissions, content_scripts, action
- \`popup.html\` + \`popup.js\` — badge UI, primary action, status display
- \`content.js\` — runs on target page, reads/modifies DOM, listens for messages
- \`background.js\` — service worker, routes messages between popup/content, uses chrome.storage

**Tech stack**: ${stack.primary}
**Requirements**:
- MV3 service worker only (no persistent background pages)
- Clean message-passing protocol with typed message shapes
- chrome.storage.local for user settings
- Graceful error handling when content script isn't injected
- Icons at 16×16, 48×48, 128×128

Output: All extension files ready to load unpacked. Include a step-by-step "how to install" comment.`,

    data_pipeline:
`Build a ${subject}.${ctxLine}

**Stages**:
- **Extract**: read from source (file/API/DB — configurable via CLI or .env)
- **Validate**: reject malformed rows, log skip count
- **Transform**: apply business rules as pure, testable functions
- **Load**: upsert to destination (idempotent — running twice is safe)

**Tech stack**: ${stack.primary}
**Requirements**:
- \`--dry-run\` flag (validate + transform, skip load)
- Structured logging: rows read / transformed / skipped / written
- Config via .env (credentials, connection strings)
- Retry on transient failures (3 attempts with backoff)
- Unit tests for every transform function

Output: Full pipeline + config template (.env.example) + sample input file.`,

    generic:
`${ctx.originalPrompt.trim()}${ctxLine}

**Requirements**:
- Follow best practices for the chosen language/framework
- Input validation and error handling at every boundary
- Inline comments where the logic isn't self-evident
- Easy to extend — clean separation of concerns

**Tech stack**: ${stack.primary}

Output: Complete, working code — not pseudocode. Brief setup instructions if needed.`,
  };
  return MAP[pt] ?? MAP.generic;
}

function buildDetailed(ctx: VarCtx): string {
  const { subject, projectType: pt, stack, context } = ctx;
  const ctxLine = context ? `\n**Context**: ${context}\n` : '';

  const FILE_STRUCTURES: Record<ProjectType, string> = {
    landing_page:
`\`\`\`
app/
├── page.tsx              # Main page — composes all sections
├── layout.tsx            # Root layout (fonts, ThemeProvider)
components/sections/
│   ├── Hero.tsx
│   ├── Features.tsx
│   ├── Pricing.tsx
│   ├── Testimonials.tsx
│   ├── FAQ.tsx
│   └── Footer.tsx
components/ui/            # shadcn/ui components
lib/
└── constants.ts          # All copy + data (swap without touching components)
\`\`\``,
    dashboard:
`\`\`\`
app/dashboard/
├── page.tsx
├── layout.tsx            # Sidebar + topbar shell
components/
├── layout/Sidebar.tsx
├── layout/TopBar.tsx
├── charts/LineChart.tsx
├── charts/BarChart.tsx
├── charts/DonutChart.tsx
├── dashboard/KPICard.tsx
└── dashboard/DataTable.tsx
lib/mock-data.ts
\`\`\``,
    auth_form:
`\`\`\`
app/(auth)/login/page.tsx
app/(auth)/register/page.tsx
app/(auth)/forgot-password/page.tsx
app/(protected)/dashboard/page.tsx
components/auth/
├── LoginForm.tsx
├── RegisterForm.tsx
└── SocialButtons.tsx
lib/
├── auth.ts               # NextAuth config
├── schemas.ts            # Zod schemas
└── hooks/useAuth.ts
\`\`\``,
    api:
`\`\`\`
src/
├── index.ts              # Express entry + middleware chain
├── routes/items.ts       # All CRUD routes
├── middleware/
│   ├── auth.ts
│   ├── validate.ts       # Zod body parser
│   └── logger.ts
├── schemas/item.schema.ts
├── services/item.service.ts  # Pure business logic
└── types/index.ts
\`\`\``,
    mobile_app:
`\`\`\`
app/(tabs)/
├── index.tsx             # Home screen
├── search.tsx
└── profile.tsx
app/item/[id].tsx         # Detail screen
components/ui/
├── Card.tsx
├── Skeleton.tsx
└── EmptyState.tsx
constants/
├── mock-data.ts
└── theme.ts
hooks/useItems.ts
\`\`\``,
    script:
`\`\`\`
src/
├── main.py               # CLI entry + orchestration
├── processor.py          # Core transform logic
├── validator.py          # Schema validation
└── utils.py              # Logging, helpers
tests/
├── test_processor.py
└── fixtures/sample_input.csv
requirements.txt / .env.example
\`\`\``,
    component:
`\`\`\`
src/components/ComponentName/
├── index.tsx             # Component + sub-components
├── ComponentName.types.ts
├── ComponentName.stories.tsx
└── ComponentName.test.tsx
\`\`\``,
    full_stack_app:
`\`\`\`
app/(auth)/login/page.tsx
app/(protected)/dashboard/page.tsx
app/(protected)/settings/page.tsx
app/api/auth/[...nextauth]/route.ts
app/api/items/route.ts
app/api/items/[id]/route.ts
components/layout/ forms/ ui/
lib/
├── db.ts                 # Prisma client singleton
├── auth.ts               # NextAuth config
└── validations.ts        # Shared Zod schemas
prisma/schema.prisma
\`\`\``,
    chrome_extension:
`\`\`\`
extension/
├── manifest.json
├── popup.html + popup.js
├── content.js
├── background.js
└── icons/icon16.png, icon48.png, icon128.png
\`\`\``,
    data_pipeline:
`\`\`\`
pipeline/
├── main.py               # CLI + orchestration
├── extract.py
├── transform.py          # Pure functions — easy to test
├── load.py
├── validate.py
└── utils/logging.py
tests/test_transform.py
fixtures/sample.csv / .env.example
\`\`\``,
    generic:
`\`\`\`
src/
├── index.ts              # Entry point
├── core/                 # Business logic
├── utils/                # Shared utilities
└── types/index.ts
tests/index.test.ts
\`\`\``,
  };

  const STEPS: Record<ProjectType, string> = {
    landing_page:
`1. \`npx create-next-app\` with TypeScript + Tailwind, add shadcn/ui
2. Create \`lib/constants.ts\` with all placeholder copy
3. Build Hero → Features → Pricing → Testimonials → FAQ → Footer (one at a time)
4. Add next-themes for dark/light toggle
5. Test responsive layout at 375 / 768 / 1280 px breakpoints
6. Add smooth scroll via CSS \`scroll-behavior: smooth\` + anchor links`,
    dashboard:
`1. Scaffold app, install Recharts + Tailwind
2. Build Sidebar with collapse toggle (CSS transform, not unmount)
3. Build TopBar with date range picker
4. Create KPICard with trend icon logic
5. Add LineChart → BarChart → DonutChart with mock data
6. Build DataTable: sort state + paginate + search filter
7. Add loading skeleton components for every widget`,
    auth_form:
`1. Install and configure NextAuth with chosen providers
2. Write Zod schemas (\`loginSchema\`, \`registerSchema\`)
3. Build LoginForm: RHF + Zod resolver + inline errors
4. Build RegisterForm with same pattern
5. Add ForgotPasswordPage: email → API call → success state
6. Create \`middleware.ts\` for protected route redirects
7. Expose \`useAuth()\` hook wrapping \`useSession()\``,
    api:
`1. Scaffold Express + TypeScript, add Zod
2. Define resource schema (Zod) + TypeScript type
3. Write service layer (pure functions, no HTTP)
4. Wire routes: call service, map to HTTP response
5. Add auth middleware (verify Bearer, attach user)
6. Add validate middleware (parse body with Zod, 422 on fail)
7. Add logger middleware (method, path, status, ms)
8. Write README with curl examples for every endpoint`,
    mobile_app:
`1. \`npx create-expo-app\` with TypeScript template
2. Set up Expo Router (file-based) + bottom tab navigator
3. Build HomeScreen: FlatList + pull-to-refresh + Skeleton
4. Build DetailScreen: params typed, back button, action
5. Build SettingsScreen: profile section + Switch toggles + logout
6. Add EmptyState + ErrorState components globally
7. Test on iOS Simulator and Android Emulator`,
    script:
`1. Write CLI arg parser with help text + required flags
2. Implement \`validate_input()\` + write unit tests first
3. Implement \`transform()\` as a pure function + write tests
4. Implement \`load_output()\` with write-error handling
5. Wire up in \`main()\` with step-by-step logging
6. Add \`--dry-run\` flag (skip load, log what would happen)
7. Test full pipeline with sample data; compare to expected output`,
    component:
`1. Define TypeScript props interface with JSDoc on each prop
2. Build default render state
3. Add hover + focus styles (\`group\`/\`peer\` Tailwind patterns)
4. Add loading + disabled states
5. Add error state with message slot (render prop or prop)
6. Write ARIA attributes; test keyboard-only navigation
7. Write Storybook stories: one per state
8. Write RTL tests: renders, user interaction, accessibility`,
    full_stack_app:
`1. Init Next.js, set up Prisma + local PostgreSQL
2. Write schema.prisma (models + relations) + run migration
3. Configure NextAuth + add middleware for protected routes
4. Build API routes (GET/POST/PUT/DELETE) with Zod validation
5. Build UI: list page → create form → detail/edit page → delete
6. Connect UI to API with typed fetch or tRPC
7. Add error boundaries + loading skeletons throughout
8. Write local setup guide (clone → working in ≤5 commands)`,
    chrome_extension:
`1. Write manifest.json — all permissions declared upfront
2. Build popup.html + popup.js — UI + primary action
3. Write content.js — DOM read/write + message listener
4. Write background.js — message router + chrome.storage
5. Test popup → content message passing in DevTools
6. Test content → background message passing
7. Add settings persistence with chrome.storage.local
8. Generate icons, load unpacked, test on target site`,
    data_pipeline:
`1. Write CLI interface + load config from .env
2. Write \`extract()\` + integration test with sample file
3. Write \`validate()\`: reject bad rows, count + log skips
4. Write \`transform()\` as pure functions — unit-test each rule
5. Write \`load()\` with upsert (duplicate-safe)
6. Wire up in \`run()\` with per-stage logging
7. Test full run: verify row counts in + out match expected
8. Test \`--dry-run\`: confirm zero writes occurred`,
    generic:
`1. Define input/output data structures as TypeScript types
2. Write the core logic as pure functions
3. Wire up entry point (CLI / HTTP handler / export)
4. Add error handling at every external boundary
5. Write unit tests for core functions
6. Add inline comments for non-obvious logic`,
  };

  const EDGE_CASES: Record<ProjectType, string> = {
    landing_page:
`- Long headline text wrapping oddly at narrow widths (clamp font size)
- CLS on font/image load — use \`next/font\` and explicit \`next/image\` dimensions
- Missing \`og:image\` or wrong aspect ratio breaks social sharing previews
- Pricing "recommended" badge misaligned on mobile viewport`,
    dashboard:
`- Empty state when account has no data yet (first login)
- Large number formatting (1,234,567 not 1234567)
- Chart tooltips overflowing viewport on small screens
- Timezone mismatch in date-axis labels vs user's local time`,
    auth_form:
`- Double-submit while previous request is in flight (disable button on submit)
- Email with valid format but non-existent domain passes client validation
- Session cookie not cleared after logout if response is cached by CDN
- Social login returns a different email on second sign-in (account merging)`,
    api:
`- Concurrent DELETE requests for the same resource (handle 404 gracefully)
- Pagination cursor invalid after item deleted mid-session
- Very long string inputs hitting DB column length constraint
- JWT expiry during a long-running request (401 mid-stream)`,
    mobile_app:
`- Keyboard pushing content off-screen on short Android devices (KeyboardAvoidingView)
- Back button inconsistency between iOS swipe and Android hardware button
- FlatList rendering blank rows when data array contains undefined entries
- App state lost after OS terminates the background process`,
    script:
`- Input file is empty or contains headers-only (detect and exit cleanly)
- Inconsistent line endings in source file (CRLF vs LF)
- Process killed mid-write leaves a corrupt output file (write to temp then rename)
- Integer overflow on very large numeric fields`,
    component:
`- Rendered inside a constrained flex/grid parent (use min-w-0, overflow-hidden)
- Long text content overflowing the component's bounds (text-ellipsis or break-word)
- Multiple instances on one page conflicting on HTML IDs (use useId())
- Used inside a form without forwarding ref — breaks imperative focus`,
    full_stack_app:
`- Optimistic UI update conflicts with server error (roll back cleanly)
- Session expires mid-flow (intercept 401 → redirect to login → restore state)
- DB migration fails halfway in production (use transactions + test on staging)
- File upload exceeds server body-size limit (validate size before upload)`,
    chrome_extension:
`- Content script not injected on SPA navigation (listen to pushState/popState)
- Extension context invalidated after update — content script loses message channel
- Target site's CSP blocks inline scripts or injected resources
- chrome.storage quota exceeded with heavy usage (monitor usage, prune old data)`,
    data_pipeline:
`- Source schema changes without notice (validate + alert, don't silently mangle data)
- Partial write failure leaving destination in inconsistent state (use transactions)
- Duplicate rows in source data (dedupe before load, not after)
- Source temporarily unavailable — retry with exponential backoff vs fail-fast`,
    generic:
`- Empty or null input where non-null is assumed
- Concurrent calls sharing mutable state (race conditions)
- Large input causing memory pressure (stream instead of loading all at once)
- Network failure partway through a multi-step operation (partial rollback strategy)`,
  };

  const fs  = FILE_STRUCTURES[pt] ?? FILE_STRUCTURES.generic;
  const st  = STEPS[pt]          ?? STEPS.generic;
  const ec  = EDGE_CASES[pt]     ?? EDGE_CASES.generic;

  return `Build a production-ready ${subject}.${ctxLine}

**Tech stack**: ${stack.primary}
_(${stack.reason})_

**Suggested file structure**:
${fs}

**Full requirements**:
${buildPro(ctx)}

---

**Implementation order** (follow this sequence):
${st}

**Edge cases to handle**:
${ec}

**Testing checklist**:
- Unit tests for all pure business-logic functions
- Integration test: one happy-path end-to-end run
- Manual: empty state / error state / loading state / mobile view

**Output**: Complete, runnable code. Use realistic placeholder data where real data is unavailable. Add a one-line comment at the top of each file explaining its purpose.`;
}

// ── Schema + main handler ──────────────────────────────────────────────────────

const ImprovePromptSchema = z.object({
  prompt:  z.string().min(1),
  context: z.string().optional(),
  // goal kept for backward-compat but ignored — type is now auto-detected
  goal:    z.string().optional(),
});

export async function handleImprovePrompt(args: unknown, _userId: string): Promise<unknown> {
  const { prompt, context } = ImprovePromptSchema.parse(args);

  const projectType = ipDetectType(prompt);
  const action      = ipDetectAction(prompt);
  const domain      = ipDetectDomain(projectType);
  const subject     = IP_SUBJECTS[projectType];
  const vagueScore  = ipVagueScore(prompt);
  const stack       = IP_STACKS[projectType];

  const ctx: VarCtx = { subject, projectType, stack, originalPrompt: prompt, context };

  const quickPrompt    = buildQuick(ctx);
  const proPrompt      = buildPro(ctx);
  const detailedPrompt = buildDetailed(ctx);

  const variations: PromptVariation[] = [
    {
      label:           'Quick & Simple',
      prompt:          quickPrompt,
      estimatedTokens: Math.ceil(quickPrompt.length / 4),
      qualityScore:    6,
    },
    {
      label:           'Professional',
      recommended:     true,
      prompt:          proPrompt,
      estimatedTokens: Math.ceil(proPrompt.length / 4),
      qualityScore:    9,
    },
    {
      label:           'Ultra Detailed',
      prompt:          detailedPrompt,
      estimatedTokens: Math.ceil(detailedPrompt.length / 4),
      qualityScore:    10,
    },
  ];

  return {
    originalPrompt: prompt,
    vagueScore,
    detectedIntent: { action, subject, domain },
    clarifyingQuestions: vagueScore < 3 ? IP_QUESTIONS[projectType] : [],
    suggestedTechStack:  stack,
    variations,
    tip: IP_TIPS[projectType],
  };
}

// ── smart_compress ────────────────────────────────────────────────────────────
export async function handleSmartCompress(args: unknown, _userId: string): Promise<unknown> {
  const { messages, keepLast } = z.object({
    messages: z.array(MessageSchema).min(1),
    keepLast: z.number().int().min(1).optional().default(4),
  }).parse(args);
  if (messages.length <= keepLast) return { compressed: messages, savedTokens: 0, importanceScores: [], note: 'Nothing to compress.' };
  const toEvaluate = messages.slice(0, messages.length - keepLast);
  const toKeep = messages.slice(messages.length - keepLast);
  function scoreImportance(content: string): 'HIGH' | 'LOW' {
    if (/```|https?:\/\/|\d{4,}|let.?s use|decided|will use|important|critical/i.test(content)) return 'HIGH';
    if (content.length > 200) return 'HIGH';
    if (content.length < 80) return 'LOW';
    if (/^(ok|sure|thanks|got it|understood|yes|no|okay|great|perfect)[.,!]?\s*$/i.test(content.trim())) return 'LOW';
    return 'HIGH';
  }
  function firstSentence(text: string): string {
    const m = text.match(/^[^.!?\n]{10,}[.!?]/);
    return m ? m[0].trim() : text.slice(0, 100).trim();
  }
  const scored = toEvaluate.map(m => {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return { message: m, text, importance: scoreImportance(text) };
  });
  const originalTokens = scored.reduce((s, x) => s + Math.ceil(x.text.length / 4), 0);
  const compressed = [
    ...scored.map(s => s.importance === 'HIGH'
      ? s.message
      : { role: s.message.role, content: '[compressed] ' + firstSentence(s.text) }
    ),
    ...toKeep,
  ];
  const compressedTokens = compressed.slice(0, scored.length).reduce((sum, m) => {
    const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return sum + Math.ceil(c.length / 4);
  }, 0);
  return {
    compressed,
    savedTokens: Math.max(0, originalTokens - compressedTokens),
    importanceScores: scored.map(s => ({ role: s.message.role, importance: s.importance, preview: s.text.slice(0, 60) })),
    keptFull: scored.filter(s => s.importance === 'HIGH').length,
    compressedCount: scored.filter(s => s.importance === 'LOW').length,
  };
}
