# AGENTS.md

- Use a Notion Custom Agent for Mail triggers; Notion Mail events are not handled directly by the Worker locally.
- Keep the Notion Worker tool boundary stable: `processLumaEmailSignal` is the first integration point.
- Keep Luma detection and handling composable in `src/luma-mail/handler.ts`; do not bury business logic in `src/index.ts` or Worker registration files.
- Use native TypeScript runnable by Node. Avoid non-erasable TypeScript syntax.
- Keep the first flow read-only for email: no replies, sends, archives, deletes, or labels.
- Add focused tests for detection/handling changes and update `docs/` when setup steps change.
