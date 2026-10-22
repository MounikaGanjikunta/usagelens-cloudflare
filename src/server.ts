import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable, routeAgentRequest, type Connection } from "agents";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  pruneMessages,
  stepCountIs,
  tool
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import { billingCases, getBillingCase } from "./billing/fixtures";
import { reconcileBillingCase } from "./billing/reconcile";
import type { ReconciliationResult } from "./billing/types";

export interface InvestigationTimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  detail: string;
}

export interface InvestigationState {
  selectedCaseId: string | null;
  customerName: string | null;
  status: "idle" | "investigating" | "review_required" | "matched";
  result: ReconciliationResult | null;
  timeline: InvestigationTimelineEvent[];
}

const initialInvestigationState: InvestigationState = {
  selectedCaseId: null,
  customerName: null,
  status: "idle",
  result: null,
  timeline: []
};

const caseIdSchema = z.enum([
  "case-acme-duplicate",
  "case-northstar-late",
  "case-orbit-healthy"
]);

export class ChatAgent extends AIChatAgent<Env, InvestigationState> {
  initialState = initialInvestigationState;
  maxPersistedMessages = 60;
  chatRecovery = true;
  messageConcurrency = "queue" as const;
  waitForMcpConnections = false;

  /**
   * Investigation state is server-authoritative. The browser can observe it,
   * but changes must go through a callable method or an agent tool.
   */
  validateStateChange(
    _nextState: InvestigationState,
    source: Connection | "server"
  ) {
    if (source !== "server") {
      throw new Error("Investigation state can only be changed by the agent.");
    }
  }

  @callable()
  resetInvestigation() {
    this.setState(initialInvestigationState);
    return { success: true };
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    // Llama 3.3 currently emits two representations of each streaming delta.
    // The Workers AI provider can therefore duplicate text and tool arguments.
    // Generate the multi-step tool loop non-streaming, then return one valid UI
    // message stream so AIChatAgent can still persist and synchronize the turn.
    const result = await generateText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are UsageLens, an AI-assisted billing usage investigator.

Your job is to help a billing engineer understand the three synthetic cases available through your tools. You coordinate the investigation and explain evidence clearly. Deterministic TypeScript code—not you—calculates usage totals and discrepancies.

Rules:
- Never invent customers, usage events, totals, or findings.
- Use listBillingCases when the user has not identified a case.
- Use inspectUsageEvents when the user asks about source records or timing.
- You MUST call reconcileUsage before giving a conclusion about whether billed usage is correct.
- Treat idempotencyKey as the business-event identity and recordId as the stored-row identity.
- Explain late events separately from invoice mismatches.
- State that all data is synthetic when relevant.
- Keep responses concise, evidence-based, and understandable to both engineers and support staff.
- Do not claim a real credit, refund, or invoice change has been performed.`,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),
      tools: {
        listBillingCases: tool({
          description:
            "List the synthetic billing cases that are available for investigation.",
          inputSchema: z.object({}),
          execute: async () =>
            billingCases.map((billingCase) => ({
              caseId: billingCase.id,
              customerName: billingCase.customer.name,
              period: billingCase.period,
              billedUsage: billingCase.billedUsage,
              recordCount: billingCase.events.length
            }))
        }),

        inspectUsageEvents: tool({
          description:
            "Inspect the source usage-event records, invoice cutoff, and billed usage for one synthetic case.",
          inputSchema: z.object({
            caseId: caseIdSchema.describe("The exact case ID to inspect")
          }),
          execute: async ({ caseId }) => {
            const billingCase = getBillingCase(caseId);
            if (!billingCase) return { error: "Billing case not found" };

            this.setState({
              selectedCaseId: billingCase.id,
              customerName: billingCase.customer.name,
              status: "investigating",
              result: null,
              timeline: [
                ...this.state.timeline,
                {
                  id: crypto.randomUUID(),
                  timestamp: new Date().toISOString(),
                  title: "Source records inspected",
                  detail: `${billingCase.events.length} records loaded for ${billingCase.customer.name}.`
                }
              ]
            });

            return {
              caseId: billingCase.id,
              customer: billingCase.customer,
              period: billingCase.period,
              invoiceFinalizedAt: billingCase.invoiceFinalizedAt,
              billedUsage: billingCase.billedUsage,
              events: billingCase.events
            };
          }
        }),

        reconcileUsage: tool({
          description:
            "Run deterministic reconciliation for a synthetic billing case and persist the findings.",
          inputSchema: z.object({
            caseId: caseIdSchema.describe("The exact case ID to reconcile")
          }),
          execute: async ({ caseId }) => {
            const billingCase = getBillingCase(caseId);
            if (!billingCase) return { error: "Billing case not found" };

            const reconciliation = reconcileBillingCase(billingCase);
            this.setState({
              selectedCaseId: billingCase.id,
              customerName: billingCase.customer.name,
              status:
                reconciliation.status === "matched"
                  ? "matched"
                  : "review_required",
              result: reconciliation,
              timeline: [
                ...this.state.timeline,
                {
                  id: crypto.randomUUID(),
                  timestamp: new Date().toISOString(),
                  title: "Reconciliation completed",
                  detail:
                    reconciliation.status === "matched"
                      ? "Billed usage matches eligible usage."
                      : `${reconciliation.findings.length} finding(s) require review.`
                }
              ]
            });

            return reconciliation;
          }
        }),

        getCurrentInvestigation: tool({
          description:
            "Return the currently persisted investigation state and timeline.",
          inputSchema: z.object({}),
          execute: async () => this.state
        })
      },
      stopWhen: stepCountIs(8),
      abortSignal: options?.abortSignal
    });

    const stream = createUIMessageStream({
      originalMessages: this.messages,
      execute: ({ writer }) => {
        writer.write({ type: "start" });

        for (const step of result.steps) {
          writer.write({ type: "start-step" });

          for (const call of step.toolCalls) {
            writer.write({
              type: "tool-input-available",
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              input: call.input,
              dynamic: call.dynamic
            });

            const toolResult = step.toolResults.find(
              (candidate) => candidate.toolCallId === call.toolCallId
            );
            if (toolResult) {
              writer.write({
                type: "tool-output-available",
                toolCallId: toolResult.toolCallId,
                output: toolResult.output,
                dynamic: toolResult.dynamic
              });
            }
          }

          writer.write({ type: "finish-step" });
        }

        const textId = crypto.randomUUID();
        writer.write({ type: "text-start", id: textId });
        writer.write({ type: "text-delta", id: textId, delta: result.text });
        writer.write({ type: "text-end", id: textId });
        writer.write({ type: "finish", finishReason: result.finishReason });
      }
    });

    return createUIMessageStreamResponse({ stream });
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
