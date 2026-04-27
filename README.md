# AgentBench for Cloudflare

`cf_ai_agentbench` is an original Cloudflare-native AI code review app built for the Cloudflare internship assignment. It lets a user paste a task prompt, code diff, and optional repository context into a chat interface, then generates a structured review with a PR summary, overall assessment, scorecard, key risks, missing tests, suggested improvements, and grounding notes.

After each completed review, the app saves a compact history entry so the user can ask follow-up questions about previous risks or compare the current review to an earlier one.

## Live Demo

https://cf-ai-agentbench.nidhikonanurtbsg.workers.dev

## Demo

<img width="897" height="808" alt="AgentBench review screenshot" src="https://github.com/user-attachments/assets/5295be8b-019d-4264-8736-d940b69c4922" />

<img width="910" height="824" alt="AgentBench memory screenshot" src="https://github.com/user-attachments/assets/d4123bfb-3a15-45de-aa26-1910a72dfac9" />

<img width="903" height="827" alt="AgentBench review history screenshot" src="https://github.com/user-attachments/assets/0e2434bd-2eef-42d9-a0d4-bffc47030463" />

## What the app does

AgentBench focuses on one workflow: reviewing a proposed code change in chat.

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

## Assignment requirements

This project satisfies the Cloudflare AI-powered application assignment as follows:

| Requirement | How AgentBench satisfies it |
|---|---|
| Repository name prefixed with `cf_ai_` | Repository name is `cf_ai_agentbench` |
| LLM | Uses Workers AI through the Cloudflare `AI` binding |
| Workflow / coordination | Uses Cloudflare Workers and the Agents SDK |
| User input via chat or voice | Uses a chat interface for code review requests |
| Memory or state | Stores prior review summaries in agent state as review history |
| README.md | Includes project documentation, setup instructions, examples, and deployment notes |
| PROMPTS.md | Includes prompts used to build, guide, and polish the project |
| Original work | Custom code review workflow, prompt design, review parsing, memory behavior, and UI copy |

## How it uses Workers AI

The app uses Workers AI through the `AI` binding configured in `wrangler.jsonc`. In `src/server.ts`, the `ChatAgent` creates a Workers AI model instance with `workers-ai-provider` and uses it to generate review responses.

Workers AI is used for:

- producing structured code reviews
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
