# Native TypeScript

This project is written so Node can run the TypeScript source directly without a transpile step.

The Node.js guidance says Node `v22.18.0` and later can run erasable TypeScript syntax directly:

```bash
node src/some-file.ts
```

Project constraints:

- Use only erasable TypeScript syntax.
- Do not use TypeScript enums, namespaces, parameter properties, decorators, or runtime-only TypeScript constructs.
- Keep imports explicit with `.ts` extensions.
- Use `npm run typecheck` for static checks and `npm test` for runtime tests.

The `tsconfig.json` enables `erasableSyntaxOnly` so type checking catches syntax that Node cannot strip natively.

Local tests intentionally import only the composable logic in `src/luma-mail.ts`. The Worker entrypoint imports `@notionhq/workers`, which is exercised by the Notion CLI during local Worker execution or deployment.

