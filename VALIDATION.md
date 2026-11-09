# Validation — 2026-11-09

## Automated checks

21 local tests pass. The first adapter commit also passed all four GitHub Actions combinations: Windows and Linux, Node.js 22 and 24. CI uses deterministic subprocess fixtures and does not receive model credentials.

Covered cases include independent MCP clients, room access and ownership, idempotency, bounded jobs, persisted transcripts, backend failure without automatic retry, queued cancellation, complete native replies, UTF-8 chunk boundaries, session continuation, wrong session rejection, partial output rejection, exit failures, missing credentials, timeouts and active native-process cancellation.

## Actual providers

| Provider | Observed result |
| --- | --- |
| Codex / GPT | Completed two-round discussion with Claude through the council hub |
| Claude Code | Completed two-round discussion with GPT through the council hub |
| Antigravity CLI 1.5.3 | Returned 391 for 17×23, then recalled the first-turn marker without it being repeated |
| DeepSeek Harness CLI 0.2.2-rc.1 | Same two-turn arithmetic/context check passed using an existing desktop account through the official credential service |

The installed older DeepSeek desktop runtime, 0.2.1-rc.5, rejected the newer permission-mode argument. A separate current CLI profile was created instead of modifying the desktop profile. Headless defaults to an API-key route; enabling stored authentication alone did not select the account route. Selecting the desktop's existing deepseek-account / deepseek-flash route resolved the credential error. No account credential was copied into the repository.

## Four-provider meeting

A real hub job with participants gpt, claude, deepseek, antigravity completed one round and four replies. The topic was bounded meeting rounds and retrying timed-out requests. Claude responded to GPT, DeepSeek explicitly compared their positions, and Antigravity disagreed with the permissive retry position. The completed status denotes the configured round limit, not unanimous agreement.

This verifies background participation and shared context, not the correctness of every participant's advice. Desktop inbox wake-up, takeover of existing desktop chats, cross-machine meetings, and production load testing remain outside the implemented scope.
