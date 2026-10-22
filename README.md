# UsageLens

**An AI-assisted billing investigation tool built on Cloudflare**

[Live demo](https://usagelens.g-mounika36.workers.dev) ·
[Prompt history](./PROMPT_HISTORY.md) ·
[Learning notes](./docs/LEARNING_NOTES.md)

## Overview

UsageLens helps a billing engineer investigate metering discrepancies without
allowing an LLM to become the source of truth for financial calculations.

A user selects a synthetic billing case or asks a question in chat. The AI
agent inspects the source events, invokes a deterministic reconciliation
engine, explains the evidence, and stores the investigation state and audit
timeline in a Durable Object.

The project focuses on problems that matter in financial infrastructure:
idempotency, duplicate delivery, late-arriving events, invoice cutoffs,
auditability, and safe use of AI.

> All customers and usage records are synthetic. The application does not
> access real billing data or modify invoices.

## Why I built this

I built UsageLens for Cloudflare's AI-powered application assignment while
applying to the Billing Engineering team. I wanted the project to demonstrate
more than a general-purpose chatbot, so I chose a workflow where state,
correctness, and explainability are essential.

My primary design decision was to separate probabilistic and deterministic
responsibilities:

```text
LLM             → choose tools and explain evidence
TypeScript      → calculate authoritative billing results
Durable Object  → preserve investigation state and history
```

This boundary lets AI improve the investigation experience without trusting it
to calculate an invoice or invent financial facts.

## What I implemented

- A React investigation interface with case selection, chat, findings, metrics,
  and an audit timeline.
- A Cloudflare `AIChatAgent` backed by a Durable Object.
- Four server-side investigation tools that the model can call.
- A deterministic TypeScript reconciliation engine with unit tests.
- Durable state for the selected customer, investigation status, findings, and
  timeline.
- Three synthetic cases covering duplicate delivery, late usage, and a healthy
  control.
- Deployment to `workers.dev` using Wrangler.
- An end-to-end production test using the real Workers AI binding.

I also diagnosed a duplicated-output problem during browser testing. The
reconciliation state was correct, which isolated the defect to the model
response path. It matched a known Cloudflare provider regression affecting
Llama 3.3 streaming. I changed the server to run the multi-step tool loop
non-streaming and then emit a valid AI SDK UI message stream. This fixed the
protocol boundary without trying to remove repeated words in the browser.

## Demo scenarios

### 1. Acme Corp — duplicate delivery

Two stored rows have different record IDs but the same idempotency key. Raw
records contain 500 units, but only 300 are eligible. The engine reports a
200-unit overstatement and marks the case for review.

### 2. Northstar Labs — late-arriving usage

A 75-unit event occurred during the billing period but arrived after invoice
finalization. The finalized invoice correctly contains 125 eligible units, and
the late event is surfaced separately for an adjustment policy.

### 3. Orbit Systems — healthy control

Billed usage and eligible canonical usage both equal 420 units. The engine
reports no findings.

## Architecture

```text
┌─────────────────────────────────────────────┐
│ React client                                │
│ chat · case picker · findings · timeline    │
└──────────────────────┬──────────────────────┘
                       │ WebSocket
                       ▼
┌─────────────────────────────────────────────┐
│ Cloudflare AIChatAgent / Durable Object     │
│ chat memory · case state · audit timeline   │
│                                             │
│ Tools                                       │
│ ├─ listBillingCases                         │
│ ├─ inspectUsageEvents                       │
│ ├─ reconcileUsage                           │
│ └─ getCurrentInvestigation                  │
└──────────────────┬──────────────────┬───────┘
                   │                  │
                   ▼                  ▼
        ┌──────────────────┐  ┌──────────────────┐
        │ Workers AI       │  │ TypeScript rules │
        │ Llama 3.3 70B    │  │ + unit tests     │
        └──────────────────┘  └──────────────────┘
```

## Reconciliation rules

The deterministic engine applies the following rules:

1. `recordId` identifies a stored row.
2. `idempotencyKey` identifies the underlying business event.
3. When multiple records share an idempotency key, only the earliest received
   record is canonical.
4. A canonical event received after invoice finalization is classified as late
   and excluded from the current invoice.
5. Billed usage is compared with eligible canonical usage.
6. Duplicate, late, and mismatch findings are returned with evidence and usage
   impact.

The LLM cannot overwrite the calculation result, and the browser cannot
directly mutate server-authoritative investigation state.

## Cloudflare assignment coverage

| Requirement             | Implementation                                      |
| ----------------------- | --------------------------------------------------- |
| LLM                     | Llama 3.3 70B on Workers AI                         |
| Workflow / coordination | Cloudflare Agents SDK and server-side tools         |
| User input              | React chat synchronized over WebSockets             |
| Memory / state          | Durable Object chat, findings, status, and timeline |

## Technology

- Cloudflare Workers and Workers AI
- Cloudflare Agents SDK and Durable Objects
- TypeScript and React
- AI SDK tool calling
- Vitest
- Wrangler

## Run locally

Requirements:

- Node.js 22
- A Cloudflare account
- Wrangler authenticated with `npx wrangler login`

```bash
nvm use
npm install
npm test
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Workers AI uses a remote
binding because model inference does not run in the local Worker simulator. No
external LLM API key is required.

## Verification

```bash
npm test
npm run lint
npx tsc --noEmit
npx vite build
```

The reconciliation test suite verifies all three scenarios, including exact
eligible usage, discrepancy amounts, and finding codes.

## Project structure

```text
src/
  billing/
    fixtures.ts          # Synthetic customers and usage events
    reconcile.ts         # Deterministic reconciliation rules
    reconcile.test.ts    # Billing correctness tests
    types.ts             # Billing domain model
  app.tsx                # Chat and investigation dashboard
  server.ts              # Durable agent, model, and tools
  styles.css             # Responsive interface
docs/
  LEARNING_NOTES.md      # Technical concepts and debugging notes
PROMPT_HISTORY.md        # AI-assistance history required by the assignment
```

## Scope and next steps

I intentionally kept the first version small enough to complete and understand
end to end. It does not use real customer data, issue credits, change invoices,
or implement production authentication.

The next production-oriented steps would be:

- ingest cases from D1 or an event pipeline;
- add approval-gated adjustment proposals;
- support pricing plans and tier validation;
- run scheduled reconciliation with Cloudflare Workflows;
- add role-based access control and structured observability;
- add replay tests for retries and concurrent event delivery.

## AI-assisted development

Cloudflare explicitly encouraged AI-assisted coding for this assignment. I used
AI as a development partner for brainstorming, implementation support,
documentation lookup, and debugging. I remained responsible for selecting and
scoping the problem, evaluating the architecture, reviewing the generated code,
validating the billing rules, testing the deployed behavior, and publishing the
application.

The complete development conversation is summarized in
[PROMPT_HISTORY.md](./PROMPT_HISTORY.md). The engineering concepts I learned and
reviewed are documented in [docs/LEARNING_NOTES.md](./docs/LEARNING_NOTES.md).
