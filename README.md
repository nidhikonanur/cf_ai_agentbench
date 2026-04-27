# AgentBench for Cloudflare

`cf_ai_agentbench` is an original Cloudflare-native AI code review app built for the Cloudflare internship assignment. It lets a user paste a task prompt, code diff, and optional repository context into a chat interface, then generates a structured review with a PR summary, overall assessment, scorecard, key risks, missing tests, suggested improvements, and grounding notes. After each completed review, the app saves a compact history entry so the user can ask follow-up questions about previous risks or compare the current review to an earlier one.

## Live Demo
https://cf-ai-agentbench.nidhikonanurtbsg.workers.dev

## What the app does

The app focuses on one workflow: reviewing a proposed code change in chat.

The user provides input in a simple text format:

- `Task Prompt:`
- `Code Diff:`
- `Repository Context:`

The agent reads that payload, evaluates the diff against the task, and returns a structured review that is easy to scan. The same chat also supports memory-based follow-ups such as:

- `summarize previous risks`
- `compare this to my last review`

## Why this project is original

I adapted the Cloudflare Agents starter into a focused code review workflow with:

- custom prompt design for code review
- review-specific input parsing
- structured review output
- persisted review history
- follow-up memory queries tied to prior reviews

The application logic, review flow, persistence behavior, UI copy, and documentation were customized specifically for this assignment.

## Features

- Chat-based code review using the Cloudflare Agents SDK
- Structured review format with:
  - `PR Summary`
  - `Overall Assessment`
  - `Scorecard`
  - `Key Risks`
  - `Missing Tests`
  - `Suggested Improvements`
  - `Grounding Notes`
- Review request parsing for:
  - `Task Prompt:`
  - `Code Diff:`
  - `Repository Context:`
- Review memory stored in agent state
- Follow-up support for saved review history
- Sample input button in the UI
- Simple memory panel explaining what the agent remembers
- No external API keys required

## How it uses Workers AI

The app uses Workers AI through the `AI` binding configured in `wrangler.jsonc`. In `src/server.ts`, the `ChatAgent` creates a Workers AI model instance with `workers-ai-provider` and uses it to generate the review response.

Workers AI is used for:

- producing the structured code review
- answering review-history follow-up questions
- comparing the current conversation against saved review history

The model receives:

- the current chat conversation
- a code-review system prompt
- dynamic context derived from the latest review payload
- a digest of recent saved review history

## How it uses Workers, Agents SDK, Durable Objects, and state

This app is built on Cloudflare’s Agents starter and keeps the core Cloudflare-native architecture intact:

- `ChatAgent` extends `AIChatAgent`
- the agent runs as a Durable Object-backed Worker
- review history is stored in agent state as `reviewHistory`
- saved history is synchronized through the Agents SDK state model
- callable methods expose:
  - `saveReview(summary, assessment, risks)`
  - `getReviewHistory()`

The current implementation automatically saves completed structured reviews in `onChatResponse()`. History queries use `getReviewHistory()` when the user asks for prior risks or comparisons.

## How chat input works

The main composer expects a review request in plain text. The app is designed around three labeled sections:

```text
Task Prompt:
...

Code Diff:
...

Repository Context:
...
```

Only `Task Prompt:` and `Code Diff:` are required for a review request. `Repository Context:` is optional. If the latest message is a review payload, the agent produces a structured review directly. If the latest message is a history-style question, the agent uses saved review history to answer.

## How memory and review history work

After a structured review completes, the app saves a compact history record containing:

- timestamp
- task summary
- PR summary
- overall assessment
- top risks

That history lives in agent state and persists across requests. The UI shows a short explanation of what the agent remembers, the saved review count, and the latest assessment. Follow-up prompts can summarize or compare reviews based on that saved history.

What is implemented today:

- automatic saving of completed reviews
- retrieval of saved review history
- follow-up history questions in the same chat

What is not implemented today:

- file upload for repository artifacts
- side-by-side visual diff comparison UI
- export/download for review history

## Architecture

### Frontend

- React app from the Cloudflare Agents starter
- Kumo UI components for a minimal, professional interface
- `useAgent()` for live connection and synced agent state
- `useAgentChat()` for streaming chat responses

### Backend

- `src/server.ts` contains the `ChatAgent`
- Workers AI generates review and history responses
- Durable Object-backed state stores review history
- `onChatResponse()` persists completed structured reviews

### Data flow

1. The user pastes a code review request into the chat composer.
2. The agent detects whether the message is a review request or a history question.
3. For review requests, Workers AI generates a structured review.
4. The completed review is parsed and saved into `reviewHistory`.
5. For history questions, the agent retrieves saved reviews and answers using that memory.

## Local development

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
git clone https://github.com/nidhikonanur/cf_ai_agentbench.git
cd cf_ai_agentbench
npm install
npm run dev
```

### Run locally

```bash
npm run dev
```

Then open the local Vite URL, usually [http://localhost:5173](http://localhost:5173).

The local UI includes:

- title: `AgentBench for Cloudflare`
- subtitle: `AI-powered code review with memory, built on Cloudflare Workers AI and Agents.`
- sample input button
- short memory explanation

## Deployment

### Prerequisites

- a Cloudflare account
- Wrangler login completed with:

```bash
npx wrangler login
```

### Deploy command

```bash
npm run deploy
```

This builds the frontend, deploys the Worker, and deploys the Durable Object-backed agent logic.

If your account has not used Workers before, you may need to enable your `workers.dev` subdomain in the Cloudflare dashboard before the first successful deployment.

## Example input

```text
Task Prompt:
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
Only repository admins can merge release branches. Existing API responses for state-changing endpoints include ISO 8601 timestamps. Current tests only cover the success path.
```

## Example output

```md
## PR Summary

The change adds an admin-only authorization guard before merge execution and returns a merge timestamp in the success response.

## Overall Assessment

Mostly Good. The diff appears aligned with the requested behavior, but it still leaves test coverage gaps around the new authorization and timestamp contract.

## Scorecard

- Task Alignment: 9/10
- Correctness: 8/10
- Testing Coverage: 4/10
- Maintainability: 8/10
- Security: 8/10
- Documentation: 5/10

## Key Risks

- No regression test confirms non-admin users consistently receive the expected 403 response.
- Conditional: if other state-changing endpoints serialize timestamps differently, `new Date().toISOString()` could diverge from existing formatting helpers.

## Missing Tests

- Add a unit or integration test covering the forbidden path for non-admin users.
- Add a success-path test asserting `merged_at` exists and is ISO 8601 formatted.

## Suggested Improvements

- Reuse any existing response serializer or timestamp helper if the codebase already standardizes API timestamps.
- Add tests that verify authorization happens before merge side effects.

## Grounding Notes

The authorization check and timestamp response came directly from the diff. The testing gap follows from the repository context saying only the success path is currently covered. Timestamp formatting consistency is a conditional concern based on common backend conventions.
```

## Files to review

- `src/server.ts`: review agent logic, prompt handling, tools, and persistence
- `src/app.tsx`: chat UI, helper text, sample input, and memory section
- `PROMPTS.md`: prompts used to build and guide the app
- `wrangler.jsonc`: Cloudflare Worker configuration

## Future improvements

- Add optional repository file/context uploads
- Add a comparison-specific UI for the last two saved reviews
- Improve saved risk extraction and ranking
- Add lightweight test coverage for review parsing and persistence behavior
