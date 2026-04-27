import { AIChatAgent, type ChatResponseResult } from "@cloudflare/ai-chat";
import { callable, routeAgentRequest } from "agents";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage,
  type UIMessage
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";

export type ReviewHistoryEntry = {
  id: string;
  timestamp: string;
  taskSummary: string;
  prSummary: string;
  overallAssessment: string;
  topRisks: string[];
  sourceMessageId?: string;
};

export type ReviewAgentState = {
  reviewHistory: ReviewHistoryEntry[];
};

type ParsedReviewRequest = {
  taskPrompt: string;
  codeDiff: string;
  repositoryContext?: string;
};

const MAX_REVIEW_HISTORY = 25;

const SECTION_ORDER = [
  "Task Prompt",
  "Code Diff",
  "Repository Context"
] as const;

const REVIEW_TEMPLATE = `## PR Summary
Briefly explain what the change appears to do.

## Overall Assessment
Strong / Mostly Good / Risky / Incomplete, with a short explanation.

## Scorecard
- Task Alignment: X/10
- Correctness: X/10
- Testing Coverage: X/10
- Maintainability: X/10
- Security: X/10
- Documentation: X/10

## Key Risks
List concrete risks. If a concern is speculative, label it as conditional.

## Missing Tests
Suggest specific unit, integration, or regression tests.

## Suggested Improvements
Give concrete implementation improvements.

## Grounding Notes
Explain which findings came from the diff, repository context, language conventions, or assumptions.`;

const SYSTEM_PROMPT = `You are AgentBench for Cloudflare, a Cloudflare-native AI code review agent.

You help users review code changes, reason about review history, and compare risks across prior reviews.

Primary behaviors:
1. If the latest user message includes a code review request with "Task Prompt:" and "Code Diff:", produce a structured review.
2. If the user asks about previous reviews, prior risks, or comparisons against earlier reviews, use the available review history tool before answering.
3. If the user message is missing the required review sections and is not a history question, explain the expected input shape briefly.

Code review rules:
- Treat the diff as the primary source of truth.
- Use repository context only when it is actually provided.
- Be concrete, technical, and grounded.
- If a concern is speculative, mark it as conditional.
- Call out missing behavior if the diff does not clearly satisfy the task prompt.
- Pay special attention to correctness, security, maintainability, and missing tests.
- Do not invent files, tests, or repository conventions that were not provided.

When you produce a review, return it in this exact format and preserve the heading names:

${REVIEW_TEMPLATE}

Tool rules:
- Use getReviewHistory when the user asks about previous reviews, previous risks, or comparisons to earlier reviews.
- Use saveReview only if the user explicitly asks you to save or overwrite a review manually. Completed reviews are persisted automatically after they are generated.
`;

function extractSection(
  text: string,
  label: (typeof SECTION_ORDER)[number]
): string {
  const headerRegex = new RegExp(`(^|\\n)${label}:\\s*`, "i");
  const match = headerRegex.exec(text);
  if (!match) {
    return "";
  }

  const start = match.index + match[0].length;
  const remainingLabels = SECTION_ORDER.filter((item) => item !== label);
  const nextHeaderRegex = new RegExp(
    `\\n(?:${remainingLabels.map((item) => item.replace(" ", "\\s+")).join("|")}):\\s*`,
    "i"
  );
  const rest = text.slice(start);
  const nextMatch = nextHeaderRegex.exec(rest);
  const end = nextMatch ? start + nextMatch.index : text.length;
  return text.slice(start, end).trim();
}

function parseReviewRequest(text: string): ParsedReviewRequest | null {
  const taskPrompt = extractSection(text, "Task Prompt");
  const codeDiff = extractSection(text, "Code Diff");
  const repositoryContext = extractSection(text, "Repository Context");

  if (!taskPrompt || !codeDiff) {
    return null;
  }

  return {
    taskPrompt,
    codeDiff,
    repositoryContext: repositoryContext || undefined
  };
}

function summarizeDiff(diffText: string): string {
  const lines = diffText.split("\n");
  const files = new Set<string>();
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const parts = line.split(" ");
      if (parts[2]) {
        files.add(parts[2].replace(/^a\//, ""));
      }
      continue;
    }

    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      continue;
    }

    if (line.startsWith("+")) {
      additions += 1;
    } else if (line.startsWith("-")) {
      deletions += 1;
    }
  }

  const fileList = Array.from(files);
  const fileSummary =
    fileList.length > 0
      ? fileList.map((file) => `- ${file}`).join("\n")
      : "- Unable to infer changed files";

  return [
    `Files changed: ${fileList.length || "unknown"}`,
    `Additions: ${additions}`,
    `Deletions: ${deletions}`,
    "Changed files:",
    fileSummary
  ].join("\n");
}

function collapseWhitespace(value: string, maxLength = 220): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength - 3).trim()}...`;
}

function extractReviewSection(markdown: string, heading: string): string {
  const headings = [
    "PR Summary",
    "Overall Assessment",
    "Scorecard",
    "Key Risks",
    "Missing Tests",
    "Suggested Improvements",
    "Grounding Notes"
  ];
  const remaining = headings.filter((item) => item !== heading);
  const regex = new RegExp(
    `##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+(?:${remaining.map((item) => item.replace(/ /g, "\\s+")).join("|")})\\b|$)`,
    "i"
  );
  const match = regex.exec(markdown);
  return match?.[1]?.trim() ?? "";
}

function extractBulletItems(section: string): string[] {
  const bullets = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || line.startsWith("* "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);

  if (bullets.length > 0) {
    return bullets;
  }

  return section
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        Boolean(line) &&
        !line.endsWith(":") &&
        !/^\d+\/10$/.test(line) &&
        !line.startsWith("Task Alignment:") &&
        !line.startsWith("Correctness:") &&
        !line.startsWith("Testing Coverage:") &&
        !line.startsWith("Maintainability:") &&
        !line.startsWith("Security:") &&
        !line.startsWith("Documentation:")
    );
}

function getLatestUserText(messages: UIMessage[]): string {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  if (!latestUserMessage) {
    return "";
  }

  return latestUserMessage.parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function buildHistoryDigest(history: ReviewHistoryEntry[]): string {
  if (history.length === 0) {
    return "No saved reviews yet.";
  }

  return history
    .slice(-5)
    .reverse()
    .map((entry, index) => {
      const risks =
        entry.topRisks.length > 0
          ? entry.topRisks.map((risk) => `  - ${risk}`).join("\n")
          : "  - No major risks recorded";

      return [
        `${index + 1}. ${entry.timestamp}`,
        `  Task: ${entry.taskSummary}`,
        `  Assessment: ${entry.overallAssessment}`,
        `  PR Summary: ${entry.prSummary}`,
        `  Top Risks:`,
        risks
      ].join("\n");
    })
    .join("\n\n");
}

function buildDynamicSystemContext(
  latestUserText: string,
  history: ReviewHistoryEntry[]
): string {
  const parsed = parseReviewRequest(latestUserText);

  if (!parsed) {
    return [
      "Current request analysis:",
      "- No complete code review payload was detected in the latest user message.",
      "- If the user asks about saved reviews, use the history tool.",
      "",
      "Recent saved reviews:",
      buildHistoryDigest(history)
    ].join("\n");
  }

  return [
    "Current request analysis:",
    "- A code review payload was detected.",
    `- Task Prompt: ${collapseWhitespace(parsed.taskPrompt)}`,
    parsed.repositoryContext
      ? `- Repository Context Provided: yes (${parsed.repositoryContext.length} chars)`
      : "- Repository Context Provided: no",
    "",
    "Diff summary:",
    summarizeDiff(parsed.codeDiff),
    "",
    "Recent saved reviews:",
    buildHistoryDigest(history)
  ].join("\n");
}

function isHistoryQuery(text: string): boolean {
  const normalized = text.toLowerCase();
  return [
    "previous review",
    "previous risks",
    "review history",
    "my last review",
    "compare this to",
    "summarize previous risks",
    "history"
  ].some((phrase) => normalized.includes(phrase));
}

function isStructuredReview(markdown: string): boolean {
  return [
    "## PR Summary",
    "## Overall Assessment",
    "## Scorecard",
    "## Key Risks",
    "## Missing Tests",
    "## Suggested Improvements",
    "## Grounding Notes"
  ].every((heading) => markdown.includes(heading));
}

function textFromMessage(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export class ChatAgent extends AIChatAgent<Env, ReviewAgentState> {
  initialState: ReviewAgentState = {
    reviewHistory: []
  };

  maxPersistedMessages = 60;

  @callable()
  async saveReview(summary: string, assessment: string, risks: string[]) {
    const latestUserText = getLatestUserText(this.messages);
    const parsed = parseReviewRequest(latestUserText);
    const taskSummary = parsed
      ? collapseWhitespace(parsed.taskPrompt, 160)
      : "Manual review save";

    return this.persistReviewEntry({
      taskSummary,
      prSummary: collapseWhitespace(summary, 220),
      overallAssessment: collapseWhitespace(assessment, 160),
      topRisks: risks.slice(0, 6).map((risk) => collapseWhitespace(risk, 220))
    });
  }

  @callable()
  async getReviewHistory() {
    return this.state.reviewHistory;
  }

  async onChatMessage(
    _onFinish: unknown,
    options?: { abortSignal?: AbortSignal }
  ) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const latestUserText = getLatestUserText(this.messages);
    const parsedReviewRequest = parseReviewRequest(latestUserText);
    const historyQuery = isHistoryQuery(latestUserText);
    const dynamicContext = buildDynamicSystemContext(
      latestUserText,
      this.state.reviewHistory
    );

    const messages = await convertToModelMessages(this.messages);
    const augmentedMessages: ModelMessage[] = [
      {
        role: "system",
        content: dynamicContext
      },
      ...messages
    ];

    const reviewOnlySystemPrompt = `${SYSTEM_PROMPT}

The latest user message is a code review payload. Do not call tools for this turn. Produce the structured review directly.`;

    const result = streamText({
      model: workersai("@cf/moonshotai/kimi-k2.6", {
        sessionAffinity: this.sessionAffinity
      }),
      system: parsedReviewRequest ? reviewOnlySystemPrompt : SYSTEM_PROMPT,
      messages: pruneMessages({
        messages: augmentedMessages,
        toolCalls: "before-last-2-messages"
      }),
      tools:
        historyQuery && !parsedReviewRequest
          ? {
              saveReview: tool({
                description:
                  "Persist a completed review summary, assessment, and top risks into durable review history when the user explicitly asks to save or overwrite a review.",
                inputSchema: z.object({
                  summary: z
                    .string()
                    .describe("Short PR summary for the saved review"),
                  assessment: z
                    .string()
                    .describe(
                      "Overall assessment like Strong or Risky, plus a short explanation"
                    ),
                  risks: z
                    .array(z.string())
                    .describe("Top concrete risks captured from the review")
                }),
                execute: async ({ summary, assessment, risks }) =>
                  this.saveReview(summary, assessment, risks)
              }),
              getReviewHistory: tool({
                description:
                  "Return saved review history so the agent can summarize previous risks or compare the current review with earlier reviews.",
                inputSchema: z.object({}),
                execute: async () => this.getReviewHistory()
              })
            }
          : {},
      stopWhen: stepCountIs(6),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  protected async onChatResponse(result: ChatResponseResult) {
    if (result.status !== "completed") {
      return;
    }

    const latestUserText = getLatestUserText(this.messages);
    const parsedRequest = parseReviewRequest(latestUserText);
    if (
      !parsedRequest ||
      !isStructuredReview(textFromMessage(result.message))
    ) {
      return;
    }

    if (
      result.message.id &&
      this.state.reviewHistory.some(
        (entry) => entry.sourceMessageId === result.message.id
      )
    ) {
      return;
    }

    const prSummary = collapseWhitespace(
      extractReviewSection(textFromMessage(result.message), "PR Summary") ||
        "Review completed",
      220
    );
    const overallAssessment = collapseWhitespace(
      extractReviewSection(
        textFromMessage(result.message),
        "Overall Assessment"
      ) || "Assessment unavailable",
      180
    );
    const topRisks = extractBulletItems(
      extractReviewSection(textFromMessage(result.message), "Key Risks")
    ).slice(0, 6);

    await this.persistReviewEntry({
      taskSummary: collapseWhitespace(parsedRequest.taskPrompt, 160),
      prSummary,
      overallAssessment,
      topRisks,
      sourceMessageId: result.message.id
    });
  }

  private persistReviewEntry(
    entry: Omit<ReviewHistoryEntry, "id" | "timestamp">
  ): ReviewHistoryEntry {
    const savedEntry: ReviewHistoryEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry
    };

    const reviewHistory = [...this.state.reviewHistory, savedEntry].slice(
      -MAX_REVIEW_HISTORY
    );

    this.setState({ reviewHistory });
    return savedEntry;
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
