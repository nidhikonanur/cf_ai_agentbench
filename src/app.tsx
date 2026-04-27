import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  Badge,
  Button,
  Empty,
  InputArea,
  Surface,
  Switch,
  Text
} from "@cloudflare/kumo";
import {
  ChatCircleDotsIcon,
  CircleIcon,
  DatabaseIcon,
  FloppyDiskBackIcon,
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon
} from "@phosphor-icons/react";
import type { ChatAgent, ReviewAgentState, ReviewHistoryEntry } from "./server";

const SAMPLE_REVIEW_REQUEST = `Task Prompt:
Add validation so only repository admins can merge a release branch, and include the merged_at timestamp in the API response.

Code Diff:
diff --git a/src/routes/merge.ts b/src/routes/merge.ts
index 1111111..2222222 100644
--- a/src/routes/merge.ts
+++ b/src/routes/merge.ts
@@ -10,7 +10,16 @@ export async function mergeReleaseBranch(request: Request) {
   const release = await getReleaseFromRequest(request);
+  if (request.user.role !== "admin") {
+    return Response.json({ error: "forbidden" }, { status: 403 });
+  }
+
   await mergeBranch(release.branchName);
-  return Response.json({ ok: true, id: release.id });
+  return Response.json({
+    ok: true,
+    id: release.id,
+    merged_at: new Date().toISOString()
+  });
 }

Repository Context:
Only repository admins can merge release branches. Existing API responses for state-changing endpoints include ISO 8601 timestamps. Current tests only cover the success path.`;

function ToolResultCard({ part }: { part: UIMessage["parts"][number] }) {
  if (!isToolUIPart(part)) {
    return null;
  }

  const toolName = getToolName(part);

  return (
    <div className="flex justify-start">
      <Surface className="max-w-[88%] rounded-2xl border border-kumo-line px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <FloppyDiskBackIcon size={14} className="text-kumo-accent" />
          <Text size="xs" bold>
            {toolName}
          </Text>
          <Badge variant="secondary">
            {part.state === "output-available" ? "Completed" : "Running"}
          </Badge>
        </div>
        {"output" in part && part.output ? (
          <pre className="overflow-auto rounded-xl bg-kumo-control p-3 text-xs text-kumo-default">
            {JSON.stringify(part.output, null, 2)}
          </pre>
        ) : (
          <Text size="xs" variant="secondary">
            Tool execution in progress.
          </Text>
        )}
      </Surface>
    </div>
  );
}

function ReviewHistorySummary({ history }: { history: ReviewHistoryEntry[] }) {
  const latest = history.at(-1);

  return (
    <Surface className="rounded-2xl border border-kumo-line px-5 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 flex items-center gap-2">
            <DatabaseIcon size={16} className="text-kumo-accent" />
            <Text size="sm" bold>
              What the agent remembers
            </Text>
          </div>
          <Text size="sm" variant="secondary">
            Each completed review is saved with a timestamp, task summary,
            overall assessment, and top risks so you can ask follow-up questions
            later.
          </Text>
        </div>

        <div className="grid gap-2 md:min-w-64">
          <div className="rounded-xl bg-kumo-control px-3 py-2">
            <Text size="xs" bold>
              Saved reviews: {history.length}
            </Text>
          </div>
          <div className="rounded-xl bg-kumo-control px-3 py-2">
            <Text size="xs" bold>
              Latest assessment
            </Text>
            <Text size="xs" variant="secondary">
              {latest ? latest.overallAssessment : "No reviews saved yet."}
            </Text>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <Text size="xs" variant="secondary">
          Try “summarize previous risks” or “compare this to my last review.”
        </Text>
      </div>
    </Surface>
  );
}

function Chat() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [reviewState, setReviewState] = useState<ReviewAgentState>({
    reviewHistory: []
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const agent = useAgent<ChatAgent, ReviewAgentState>({
    agent: "ChatAgent",
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
    onStateUpdate: (state) => setReviewState(state)
  });

  const { messages, sendMessage, clearHistory, stop, status } = useAgentChat({
    agent
  });

  const isStreaming = status === "streaming" || status === "submitted";
  const recentHistory = useMemo(
    () => [...reviewState.reviewHistory].slice(-3).reverse(),
    [reviewState.reviewHistory]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || isStreaming) {
      return;
    }

    setInput("");
    sendMessage({
      role: "user",
      parts: [{ type: "text", text }]
    });

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  return (
    <div className="min-h-screen bg-kumo-elevated">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 md:px-6">
        <header className="mb-5 rounded-2xl border border-kumo-line bg-kumo-base px-6 py-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-semibold tracking-tight text-kumo-default">
                AgentBench for Cloudflare
              </h1>
              <p className="mt-2 text-sm leading-6 text-kumo-subtle">
                AI-powered code review with memory, built on Cloudflare Workers
                AI and Agents.
              </p>
              <p className="mt-2 text-sm leading-6 text-kumo-subtle">
                Paste a task prompt, code diff, and optional repository context.
                The review output is structured to be easy to scan.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-kumo-line px-3 py-2">
                <CircleIcon
                  size={8}
                  weight="fill"
                  className={
                    connected ? "text-kumo-success" : "text-kumo-danger"
                  }
                />
                <Text size="xs" variant="secondary">
                  {connected ? "Connected" : "Disconnected"}
                </Text>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-kumo-line px-3 py-2">
                <Text size="xs" variant="secondary">
                  Debug
                </Text>
                <Switch
                  checked={showDebug}
                  onCheckedChange={setShowDebug}
                  size="sm"
                  aria-label="Toggle debug mode"
                />
              </div>
              <Button
                variant="secondary"
                icon={<TrashIcon size={16} />}
                onClick={clearHistory}
              >
                Clear Chat
              </Button>
            </div>
          </div>
        </header>

        <section className="mb-4">
          <ReviewHistorySummary history={reviewState.reviewHistory} />
        </section>

        <section className="mb-4 grid gap-3 md:grid-cols-[1fr,0.9fr]">
          <Surface className="rounded-2xl border border-kumo-line px-5 py-5">
            <Text size="sm" bold>
              Sample request
            </Text>
            <div className="mt-1">
              <Text size="xs" variant="secondary">
                Load a ready-made review prompt into the composer.
              </Text>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setInput(SAMPLE_REVIEW_REQUEST)}
              >
                Load sample review
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setInput("Summarize previous risks from my saved reviews.")
                }
              >
                Ask for history
              </Button>
            </div>
          </Surface>

          <Surface className="rounded-2xl border border-kumo-line px-5 py-5">
            <Text size="sm" bold>
              Recent reviews
            </Text>
            <div className="mt-3 space-y-3">
              {recentHistory.length === 0 ? (
                <Text size="xs" variant="secondary">
                  Completed reviews will appear here after the agent saves them.
                </Text>
              ) : (
                recentHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl bg-kumo-control px-3 py-3"
                  >
                    <Text size="xs" bold>
                      {entry.taskSummary}
                    </Text>
                    <div className="mt-1">
                      <Text size="xs" variant="secondary">
                        {entry.overallAssessment}
                      </Text>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Surface>
        </section>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-kumo-line bg-kumo-base shadow-sm">
          <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              {messages.length === 0 && (
                <Empty
                  icon={<ChatCircleDotsIcon size={32} />}
                  title="Start a code review"
                  contents={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setInput(SAMPLE_REVIEW_REQUEST)}
                      >
                        Paste sample review input
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setInput(
                            "Compare this to my last review once I paste a new diff."
                          )
                        }
                      >
                        Try a follow-up prompt
                      </Button>
                    </div>
                  }
                />
              )}

              {messages.map((message, index) => {
                const isUser = message.role === "user";
                const isLastAssistant =
                  message.role === "assistant" && index === messages.length - 1;

                return (
                  <div key={message.id} className="space-y-3">
                    {showDebug && (
                      <pre className="max-h-64 overflow-auto rounded-2xl bg-kumo-control p-3 text-[11px] text-kumo-subtle">
                        {JSON.stringify(message, null, 2)}
                      </pre>
                    )}

                    {message.parts.filter(isToolUIPart).map((part) => (
                      <ToolResultCard key={part.toolCallId} part={part} />
                    ))}

                    {message.parts
                      .filter((part) => part.type === "text")
                      .map((part, partIndex) => {
                        const text = part.text;
                        if (!text) {
                          return null;
                        }

                        if (isUser) {
                          return (
                            <div key={partIndex} className="flex justify-end">
                              <div className="max-w-[88%] rounded-2xl rounded-br-md bg-kumo-contrast px-4 py-3 text-sm leading-6 text-kumo-inverse whitespace-pre-wrap">
                                {text}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={partIndex} className="flex justify-start">
                            <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-kumo-line bg-kumo-base">
                              <Streamdown
                                className="sd-theme rounded-2xl rounded-bl-md p-4"
                                plugins={{ code }}
                                controls={false}
                                isAnimating={isLastAssistant && isStreaming}
                              >
                                {text}
                              </Streamdown>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="border-t border-kumo-line bg-kumo-base/90 px-4 py-4 md:px-6">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
              className="mx-auto max-w-3xl"
            >
              <div className="rounded-2xl border border-kumo-line bg-kumo-base px-4 py-4 shadow-sm focus-within:border-transparent focus-within:ring-2 focus-within:ring-kumo-ring">
                <InputArea
                  ref={textareaRef}
                  value={input}
                  onValueChange={setInput}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  onInput={(event) => {
                    const element = event.currentTarget;
                    element.style.height = "auto";
                    element.style.height = `${element.scrollHeight}px`;
                  }}
                  placeholder={`Task Prompt:\nDescribe the requested change.\n\nCode Diff:\nPaste a unified diff here.\n\nRepository Context:\nOptional architecture notes, tests, or conventions.`}
                  disabled={!connected || isStreaming}
                  rows={6}
                  className="min-h-[220px] resize-none bg-transparent leading-6 shadow-none! outline-none! ring-0! focus:ring-0!"
                />

                <div className="mt-4 flex items-center justify-between gap-3">
                  <Text size="xs" variant="secondary">
                    Memory is saved automatically after each completed review.
                  </Text>

                  {isStreaming ? (
                    <Button
                      type="button"
                      variant="secondary"
                      icon={<StopIcon size={16} />}
                      onClick={stop}
                    >
                      Stop
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      variant="primary"
                      icon={<PaperPlaneRightIcon size={16} />}
                      disabled={!connected || !input.trim()}
                    >
                      Review change
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-kumo-inactive">
          Loading AgentBench for Cloudflare...
        </div>
      }
    >
      <Chat />
    </Suspense>
  );
}
