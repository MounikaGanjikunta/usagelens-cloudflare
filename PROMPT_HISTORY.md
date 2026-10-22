# UsageLens — Selected AI-Assisted Development History

Cloudflare encouraged AI-assisted coding for this assignment. This document contains selected and condensed prompts from my development process. I combined closely related exchanges and lightly edited the wording for clarity while preserving the original technical intent.

I excluded authentication steps, repository administration, and routine command output because they did not influence the application's design.

## 1. Researching the problem

### Context I provided

Cloudflare's Billing Engineering role emphasizes:

- usage metering and aggregation;
- subscriptions and invoicing;
- retries, concurrency, and fault tolerance;
- idempotency and reconciliation;
- auditability and financial correctness;
- asynchronous and event-driven systems.

### Prompt

> I want to build an AI application that is directly relevant to Cloudflare's Billing Engineering work rather than a generic chatbot.
>
> A recurring billing problem is that engineers and support teams must investigate why recorded usage differs from invoiced usage. The investigation may involve duplicate event delivery, idempotency keys, arrival timestamps, invoice cutoffs, and reconciliation.
>
> Could an AI agent coordinate that investigation while keeping all financial calculations deterministic? Help me evaluate whether this is a useful and achievable project for the assignment.

### Decision

I selected an AI-assisted billing investigation application.

The agent would gather and explain evidence, while deterministic TypeScript code would calculate authoritative billing results.

## 2. Defining a realistic scope

### Prompt

> I want a complete vertical slice that I can build, test, deploy, and explain within one or two days.
>
> Limit the project to a small synthetic dataset, but make the scenarios representative of real distributed billing failures. I want at least:
>
> 1. duplicate event delivery;
> 2. usage arriving after invoice finalization;
> 3. a healthy control case.
>
> Define clear success criteria and identify which production concerns should remain out of scope.

### Decision

The first version would:

- use three synthetic customer cases;
- investigate usage records through chat;
- run deterministic reconciliation;
- preserve findings and an audit timeline;
- clearly distinguish duplicate, late, and mismatched usage.

Real billing integrations, authentication, pricing plans, credits, and invoice modifications were intentionally excluded.

## 3. Establishing correctness boundaries

### Prompt

> Billing is a high-integrity domain, so the LLM should not calculate invoice totals or become the source of truth.
>
> Design a boundary where:
>
> - the model can select investigation tools;
> - server-side code owns reconciliation;
> - tool outputs contain structured evidence;
> - the browser cannot overwrite authoritative findings;
> - the model cannot claim that a credit, refund, or invoice change occurred.
>
> Explain the tradeoffs of this design.

### Decision

The project uses the following separation:

```text
LLM             → tool selection and evidence explanation
TypeScript      → authoritative reconciliation
Durable Object  → investigation state and audit history
```

This allows AI to improve usability without weakening financial correctness.

## 4. Modeling event identity and idempotency

### Prompt

> Model the difference between storage identity and business-event identity.
>
> Each stored row should have a `recordId`, while retries of the same business event should share an `idempotencyKey`.
>
> Define deterministic rules for:
>
> - selecting the canonical delivery;
> - measuring duplicate usage impact;
> - handling events received after invoice finalization;
> - calculating eligible usage;
> - comparing eligible usage with billed usage.
>
> The result should include structured findings that can be tested independently of the LLM.

### Decision

The reconciliation engine applies these invariants:

1. `recordId` identifies a stored row.
2. `idempotencyKey` identifies the business event.
3. The earliest received record for an idempotency key is canonical.
4. Later deliveries of the same business event are duplicates.
5. Events received after invoice finalization are classified as late.
6. Only eligible canonical events contribute to the current invoice.
7. Billed usage is compared with eligible usage.

## 5. Designing agent coordination and durable state

### Prompt

> Use Cloudflare's stateful infrastructure for a real reason.
>
> Design an agent that can:
>
> - discover available billing cases;
> - inspect source usage records;
> - run deterministic reconciliation;
> - retrieve the current investigation;
> - preserve the selected case, status, findings, and audit timeline.
>
> Evaluate why a Durable Object is more appropriate than a purely stateless Worker for this interaction.

### Decision

The agent exposes four tools:

- `listBillingCases`
- `inspectUsageEvents`
- `reconcileUsage`
- `getCurrentInvestigation`

A Durable Object preserves:

- conversation history;
- selected case;
- customer identity;
- investigation status;
- reconciliation result;
- audit-timeline events.

It also provides a serialized state owner for each investigation and synchronizes updates with the client.

## 6. Designing the investigation workflow

### Prompt

> Prevent the model from reaching unsupported billing conclusions.
>
> The model should inspect records when the user asks about source data or timing, and it must call the reconciliation tool before declaring whether billed usage is correct.
>
> Tool descriptions and the system prompt should make evidence collection explicit. The final explanation should be useful to both an engineer and a support or finance stakeholder.

### Decision

The agent instructions require it to:

- use only the synthetic cases returned by tools;
- avoid inventing usage events or totals;
- distinguish late events from invoice mismatches;
- call reconciliation before reaching a billing conclusion;
- explain findings using deterministic tool results;
- avoid claiming that financial actions were performed.

## 7. Designing the user experience

### Prompt

> Build an interface that makes the investigation observable instead of hiding everything behind a chat response.
>
> Show:
>
> - the available cases;
> - the conversation;
> - tool execution;
> - raw, eligible, billed, and difference metrics;
> - structured findings;
> - investigation status;
> - a durable audit timeline.
>
> The user should be able to understand how the conclusion was reached without trusting the prose alone.

### Decision

The interface combines a chat experience with a structured investigation panel.

The structured panel remains authoritative even if the model's natural-language explanation changes.

## 8. Testing the billing invariants

### Prompt

> Create unit tests around the reconciliation engine rather than testing only the model response.
>
> Verify exact totals and findings for:
>
> - duplicate delivery;
> - late-arriving usage;
> - a matched control case.
>
> The tests should prove that model behavior cannot change the financial outcome.

### Verified results

| Case           | Raw | Eligible | Billed | Difference |
| -------------- | --: | -------: | -----: | ---------: |
| Acme Corp      | 500 |      300 |    500 |        200 |
| Northstar Labs | 200 |      125 |    125 |          0 |
| Orbit Systems  | 420 |      420 |    420 |          0 |

The final reconciliation suite contains three passing tests.

## 9. Investigating duplicated model output

### Observation

During end-to-end testing, the UI displayed duplicated words and tool-call fragments. The deterministic reconciliation state remained correct.

### Prompt

> Treat this as a layered debugging problem.
>
> Determine whether duplication originates in:
>
> - the React renderer;
> - persisted agent messages;
> - the AI SDK stream;
> - the Workers AI provider;
> - or the model response format.
>
> Do not hide the defect using client-side word deduplication because that could corrupt legitimate responses.

### Finding

The behavior matched a Cloudflare provider regression affecting Llama 3.3 streaming. Responses could contain both native and OpenAI-compatible representations of the same delta.

### Resolution

The server now:

1. executes the multi-step tool loop using non-streaming generation;
2. collects completed tool calls and results;
3. converts them into a valid AI SDK UI message stream;
4. allows the agent to persist and synchronize the completed turn.

This fixed the issue at the protocol boundary.

## 10. Production verification

### Prompt

> Validate the deployed application as a complete system, not only as a local build.
>
> Confirm that:
>
> - the real Workers AI binding responds;
> - the model invokes the expected tools;
> - reconciliation produces the expected numbers;
> - Durable Object state reaches the interface;
> - the audit timeline is preserved;
> - formatting, linting, TypeScript, tests, and security checks pass.

### Verification

The deployed Acme investigation successfully:

1. inspected three source records;
2. detected duplicate delivery of `evt_acme_002`;
3. calculated 300 eligible units;
4. compared them with 500 billed units;
5. reported a 200-unit discrepancy;
6. persisted two findings and an audit timeline.

Final automated checks:

- reconciliation tests: passed;
- formatting: passed;
- linting: passed;
- TypeScript validation: passed;
- production build: passed;
- GitHub Sanity Check: passed;
- Semgrep OSS scan: passed.

## 11. Tradeoffs and future work

### Prompt

> Review the design as if it were progressing from a prototype toward a production billing service.
>
> Identify what is intentionally simplified and which improvements would provide the most value without weakening auditability or financial correctness.

### Identified next steps

- ingest investigation cases from D1 or an event pipeline;
- add approval-gated adjustment proposals;
- support pricing-plan and tier validation;
- run scheduled reconciliation using Cloudflare Workflows;
- add role-based access control;
- add structured observability and correlation identifiers;
- test retries and concurrent event delivery;
- preserve immutable reconciliation versions for auditability.

## Ownership and AI assistance

I was responsible for:

- researching the target role and selecting the billing-investigation problem;
- defining the project's scope and success criteria;
- choosing the deterministic boundary for financial calculations;
- evaluating the architecture and business rules;
- reviewing the implementation and expected results;
- testing the deployed workflow;
- documenting limitations and future improvements;
- taking responsibility for the submitted application.

Codex assisted with:

- architecture exploration;
- Cloudflare documentation lookup;
- implementation and scaffolding;
- test generation;
- debugging;
- verification commands;
- documentation and repository setup.

The final project reflects an iterative collaboration, with AI used as an engineering tool rather than as the authority for product requirements or billing correctness.
