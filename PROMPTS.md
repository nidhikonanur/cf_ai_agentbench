# PROMPTS.md

This file documents the main prompts used in `cf_ai_agentbench` and the prompts that were used to help build and polish the project.

## Code review agent system prompt

```text
You are AgentBench for Cloudflare, a Cloudflare-native AI code review agent.

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

## PR Summary
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
Explain which findings came from the diff, repository context, language conventions, or assumptions.

Tool rules:
- Use getReviewHistory when the user asks about previous reviews, previous risks, or comparisons to earlier reviews.
- Use saveReview only if the user explicitly asks you to save or overwrite a review manually. Completed reviews are persisted automatically after they are generated.
```

## Memory / history prompt

```text
If the user asks about previous reviews, previous risks, or wants a comparison to an earlier review, retrieve saved review history first and ground the answer in that history. Summaries should mention timestamps, task summaries, assessments, and top risks when available. If there is no saved history yet, say so clearly and invite the user to submit a review first.
```

## UI polish prompt

```text
Polish the AgentBench UI.

Keep the app simple and professional. Make the title clear, add short helper text, and make the review output easy to scan.

UI requirements:
- Title: AgentBench for Cloudflare
- Subtitle: AI-powered code review with memory, built on Cloudflare Workers AI and Agents.
- Add a sample input button if easy to implement.
- Add a small section explaining what the agent remembers.
- Keep styling minimal and clean.
- Do not add unnecessary animations or complex components.
- Make sure the UI still works locally with npm run dev.
- Update README.md if the UI behavior changes.
```

## README cleanup prompt

```text
Review and improve README.md and PROMPTS.md for the Cloudflare internship assignment.

README.md should clearly explain:
- what the app does
- why it is original
- how it uses Workers AI
- how it uses Workers, Agents SDK, Durable Objects, or state
- how chat input works
- how memory or review history works
- how to run locally
- how to deploy
- example input and output
- future improvements

PROMPTS.md should include:
- the code review agent system prompt
- the memory/history prompt
- the UI polish prompt
- the README cleanup prompt
- the original build prompt
- a short note that AI-assisted coding was used and all generated code was reviewed and adapted

Make both files polished, specific, and honest. Do not claim any feature exists unless it is implemented.
```

## Original build prompt

```text
You are helping me build an original Cloudflare AI internship assignment project.

Project name: cf_ai_agentbench

Goal:
Build a Cloudflare-native AI-powered code review agent. The app should let a user chat with an AI agent and submit a task prompt, code diff, and optional repository context. The agent should generate a structured review of the code change, including a PR summary, risk scorecard, correctness concerns, security concerns, missing tests, suggested improvements, and grounding notes. The agent should also remember prior reviews in state so the user can ask follow-up questions like “compare this to my last review” or “summarize previous risks.”

Cloudflare assignment requirements:
- Repository name must be prefixed with cf_ai_
- Include README.md with documentation and clear running instructions
- Include PROMPTS.md with all AI prompts used
- Use an LLM, preferably Workers AI
- Use workflow or coordination with Workers, Durable Objects, or Agents SDK
- Include user input through chat
- Include memory or state
- All work must be original

Technical direction:
- This project was created from the Cloudflare Agents starter.
- Use TypeScript.
- Use the existing Cloudflare Agents SDK structure where possible.
- Use Workers AI for the LLM.
- Use the existing chat UI if present.
- Use agent state or Durable Object storage to persist review history.
- Do not require external API keys.
- Keep the app simple and polished.

Core features to implement:
1. Chat input where the user can paste a code review request.
2. The agent should recognize code review requests containing:
   - Task Prompt:
   - Code Diff:
   - Repository Context:
3. The agent should generate a structured review in this exact format:

## PR Summary
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
Explain which findings came from the diff, repository context, language conventions, or assumptions.

4. Add memory:
   - Store each completed review with timestamp, task summary, overall assessment, and top risks.
   - Add a way for the agent to summarize previous reviews when the user asks about review history.
   - Add a way for the agent to compare the current review against prior reviews if possible.

5. Add at least two lightweight tools or callable methods if the starter supports them:
   - saveReview(summary, assessment, risks)
   - getReviewHistory()
   If the exact callable syntax differs in the starter, implement equivalent functionality using the recommended Agents SDK pattern.

6. Update the UI title to:
   AgentBench for Cloudflare

7. Add helper text in the UI:
   Paste a task prompt, code diff, and optional repository context. The agent will review the change and remember prior reviews.

8. Add sample input somewhere in the README.

README.md requirements:
Create a polished README with:
- Project title
- One-paragraph description
- Why I built this
- Features
- How the project satisfies the Cloudflare assignment requirements
- Architecture
- How Workers AI is used
- How Agents SDK / Durable Objects / state are used
- Setup instructions
- Local run instructions
- Deployment instructions if available
- Example input
- Example output
- Future improvements

PROMPTS.md requirements:
Create a PROMPTS.md file containing:
- The main system prompt used by the code review agent
- The review output format prompt
- The memory/history prompt
- The AI coding prompts used to build the project, including this prompt
- A short note explaining that AI-assisted coding was used and that the implementation was reviewed and customized

Important:
- Do not invent features that are not implemented.
- Keep the code readable and commented where helpful.
- Do not include secrets.
- Do not copy from external submissions.
- After making changes, tell me what files changed and what commands I should run.
```

## Additional build and implementation prompts used

```text
Adapt the official Cloudflare Agents starter into a Workers AI powered code review agent without requiring external API keys.
```

```text
Use Durable Object-backed agent state to persist prior review summaries and expose saveReview/getReviewHistory using the Agents SDK callable pattern.
```

```text
Simplify the starter UI so it focuses on code review chat, sample input, and visible memory status.
```

## Note on AI-assisted coding

AI-assisted coding was used to help scaffold and iterate on this project. All generated code and generated documentation were reviewed, edited, and adapted to fit the assignment requirements and to avoid claiming features that are not implemented.
