import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Streamdown } from "streamdown";
import type { ChatAgent, InvestigationState } from "./server";

const EMPTY_STATE: InvestigationState = {
  selectedCaseId: null,
  customerName: null,
  status: "idle",
  result: null,
  timeline: []
};

const SAMPLE_CASES = [
  {
    id: "case-acme-duplicate",
    customer: "Acme Corp",
    label: "Possible duplicate",
    prompt:
      "Investigate Acme Corp. Inspect its source records, reconcile its billed usage, and explain the evidence."
  },
  {
    id: "case-northstar-late",
    customer: "Northstar Labs",
    label: "Late-arriving usage",
    prompt:
      "Investigate Northstar Labs. Inspect its event timing, reconcile the case, and explain whether its invoice is wrong."
  },
  {
    id: "case-orbit-healthy",
    customer: "Orbit Systems",
    label: "Healthy control",
    prompt:
      "Investigate Orbit Systems and verify whether billed usage matches eligible usage."
  }
] as const;

function ToolActivity({ part }: { part: UIMessage["parts"][number] }) {
  if (!isToolUIPart(part)) return null;

  const toolName = getToolName(part);
  const done = part.state === "output-available";
  const failed =
    part.state === "output-error" || part.state === "output-denied";

  return (
    <details className={`tool-activity ${failed ? "tool-error" : ""}`}>
      <summary>
        <span className="tool-icon" aria-hidden="true">
          {failed ? "!" : done ? "✓" : "↻"}
        </span>
        <span>{done ? "Completed" : failed ? "Failed" : "Running"}</span>
        <strong>{toolName}</strong>
      </summary>
      {"input" in part && part.input !== undefined ? (
        <pre>{JSON.stringify(part.input, null, 2)}</pre>
      ) : null}
      {"output" in part && part.output !== undefined ? (
        <pre>{JSON.stringify(part.output, null, 2)}</pre>
      ) : null}
      {part.state === "output-error" ? <p>{part.errorText}</p> : null}
    </details>
  );
}

function InvestigationPanel({ state }: { state: InvestigationState }) {
  const result = state.result;

  return (
    <aside className="investigation-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Durable state</span>
          <h2>Investigation</h2>
        </div>
        <span className={`status status-${state.status}`}>
          {state.status.replace("_", " ")}
        </span>
      </div>

      {!result ? (
        <div className="panel-empty">
          <div className="empty-orbit" aria-hidden="true">
            <span />
          </div>
          <h3>No findings yet</h3>
          <p>
            Choose a synthetic case or ask the agent to begin an investigation.
          </p>
        </div>
      ) : (
        <>
          <div className="customer-block">
            <span className="eyebrow">Customer</span>
            <h3>{result.customerName}</h3>
            <code>{result.caseId}</code>
          </div>

          <div className="metrics-grid">
            <div>
              <span>Raw records</span>
              <strong>{result.rawRecordedUsage}</strong>
            </div>
            <div>
              <span>Eligible</span>
              <strong>{result.eligibleUsage}</strong>
            </div>
            <div>
              <span>Billed</span>
              <strong>{result.billedUsage}</strong>
            </div>
            <div
              className={result.discrepancy === 0 ? "metric-ok" : "metric-bad"}
            >
              <span>Difference</span>
              <strong>{result.discrepancy}</strong>
            </div>
          </div>

          <section className="findings-section">
            <div className="section-title">
              <h3>Findings</h3>
              <span>{result.findings.length}</span>
            </div>
            {result.findings.length === 0 ? (
              <div className="finding finding-ok">
                <span className="finding-mark">✓</span>
                <div>
                  <strong>Usage matched</strong>
                  <p>No reconciliation anomalies were detected.</p>
                </div>
              </div>
            ) : (
              result.findings.map((finding, index) => (
                <div
                  className={`finding finding-${finding.severity}`}
                  key={`${finding.code}-${index}`}
                >
                  <span className="finding-mark">
                    {finding.severity === "critical" ? "!" : "i"}
                  </span>
                  <div>
                    <strong>{finding.title}</strong>
                    <p>{finding.explanation}</p>
                    {finding.usageImpact !== 0 ? (
                      <small>Usage impact: {finding.usageImpact}</small>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}

      {state.timeline.length > 0 ? (
        <section className="timeline-section">
          <div className="section-title">
            <h3>Audit timeline</h3>
            <span>{state.timeline.length}</span>
          </div>
          <ol>
            {state.timeline.slice(-4).map((event) => (
              <li key={event.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                  <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </aside>
  );
}

function App() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const agent = useAgent<ChatAgent, InvestigationState>({
    agent: "ChatAgent",
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
    onError: (error) => console.error("Agent connection error", error)
  });

  const { messages, sendMessage, clearHistory, stop, status } = useAgentChat({
    agent
  });

  const investigation = agent.state ?? EMPTY_STATE;
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendPrompt(text: string) {
    if (busy) return;
    sendMessage({
      role: "user",
      parts: [{ type: "text", text }]
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    sendPrompt(message);
  }

  async function reset() {
    stop();
    clearHistory();
    await agent.stub.resetInvestigation();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            UL
          </div>
          <div>
            <strong>UsageLens</strong>
            <span>AI billing investigation</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className={`connection ${connected ? "connected" : ""}`}>
            <i /> {connected ? "Agent connected" : "Connecting"}
          </span>
          <button className="button-secondary" type="button" onClick={reset}>
            Reset session
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="case-rail">
          <div className="rail-intro">
            <span className="eyebrow">Synthetic dataset</span>
            <h2>Choose a case</h2>
            <p>Each case illustrates a different metering outcome.</p>
          </div>
          <div className="case-list">
            {SAMPLE_CASES.map((sample, index) => (
              <button
                type="button"
                className={`case-card ${investigation.selectedCaseId === sample.id ? "active" : ""}`}
                key={sample.id}
                onClick={() => sendPrompt(sample.prompt)}
                disabled={busy}
              >
                <span className="case-number">0{index + 1}</span>
                <strong>{sample.customer}</strong>
                <small>{sample.label}</small>
                <span className="case-arrow">→</span>
              </button>
            ))}
          </div>
          <div className="trust-note">
            <span aria-hidden="true">◆</span>
            <p>
              <strong>Deterministic by design</strong>
              Totals come from tested TypeScript. AI coordinates and explains.
            </p>
          </div>
        </aside>

        <section className="chat-panel">
          <div className="chat-heading">
            <div>
              <span className="eyebrow">Investigator chat</span>
              <h1>Trace every usage unit.</h1>
            </div>
            <span className="model-pill">Llama 3.3 · Workers AI</span>
          </div>

          <div className="messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="welcome-card">
                <span className="welcome-icon" aria-hidden="true">
                  ✦
                </span>
                <h2>What should we investigate?</h2>
                <p>
                  Ask about a customer, inspect raw events, or compare billed
                  and eligible usage. The agent will use tools before reaching a
                  conclusion.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    sendPrompt(
                      "List the available synthetic billing cases and tell me what each investigation can demonstrate."
                    )
                  }
                >
                  Show available cases
                </button>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  className={`message message-${message.role}`}
                  key={message.id}
                >
                  <div className="avatar" aria-hidden="true">
                    {message.role === "user" ? "You" : "AI"}
                  </div>
                  <div className="message-body">
                    <span className="message-author">
                      {message.role === "user" ? "You" : "UsageLens"}
                    </span>
                    {message.parts.map((part, index) => {
                      if (part.type === "text" && part.text.trim()) {
                        return (
                          <div
                            className="message-text"
                            key={`${message.id}-text-${index}`}
                          >
                            <Streamdown>{part.text}</Streamdown>
                          </div>
                        );
                      }
                      if (isToolUIPart(part)) {
                        return (
                          <ToolActivity
                            part={part}
                            key={`${message.id}-tool-${index}`}
                          />
                        );
                      }
                      return null;
                    })}
                  </div>
                </article>
              ))
            )}
            {busy ? (
              <div className="thinking">
                <span />
                <span />
                <span />
                <em>Investigating</em>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2}
              placeholder="Ask UsageLens to investigate a billing case…"
              aria-label="Message UsageLens"
            />
            {busy ? (
              <button
                className="send-button stop-button"
                type="button"
                onClick={stop}
              >
                Stop
              </button>
            ) : (
              <button
                className="send-button"
                type="submit"
                disabled={!input.trim()}
              >
                Send <span aria-hidden="true">↑</span>
              </button>
            )}
          </form>
          <p className="composer-note">
            Synthetic data only · No real invoices or customer actions
          </p>
        </section>

        <InvestigationPanel state={investigation} />
      </main>
    </div>
  );
}

export default App;
