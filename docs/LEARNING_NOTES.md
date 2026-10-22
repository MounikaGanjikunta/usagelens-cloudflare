# UsageLens learning notes

## 1. Deterministic core before AI

UsageLens keeps billing calculations in ordinary TypeScript functions. The LLM
may decide which investigation tool to call and explain the returned evidence,
but it is not trusted to calculate authoritative usage totals.

Why this matters:

- deterministic functions return the same output for the same input;
- the reconciliation rules can be unit tested;
- findings have an auditable path back to source records;
- model changes cannot silently change financial results.

## 2. Record identity versus event identity

`recordId` identifies a stored row. `idempotencyKey` identifies the business
event. If two rows have different record IDs but the same idempotency key, the
pipeline received the same business event more than once.

Idempotency means a retry can be processed safely without applying its business
effect twice.

## 3. Late-arriving usage

An event can occur inside a billing period but arrive after an invoice is
finalized. UsageLens records that as a late event instead of silently adding it
to the finalized invoice. A production system would apply an explicit policy,
such as including it in the next invoice or creating an adjustment.

## 4. Debugging an upstream streaming regression

The first end-to-end browser test showed every generated word twice. The
reconciliation state was correct, which isolated the failure to the model
response path rather than the billing engine. Cloudflare's issue tracker
documents a provider regression for Llama 3.3: its streaming response can carry
the same delta in two shapes, and the provider appends both.

UsageLens avoids that affected path by running the tool loop non-streaming and
then encoding the completed text and tool results as an AI SDK UI message
stream. The important lesson is to fix duplication at the protocol boundary,
not with a heuristic that deletes repeated words in the browser.
