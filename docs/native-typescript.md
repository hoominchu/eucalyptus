# Native TypeScript

This project is written so Node can run the TypeScript source directly during local development.

The Node.js guidance says Node `v22.18.0` and later can run erasable TypeScript syntax directly:

```bash
node src/some-file.ts
```

Project constraints:

- Use only erasable TypeScript syntax.
- Do not use TypeScript enums, namespaces, parameter properties, decorators, or runtime-only TypeScript constructs.
- Keep imports explicit with `.ts` extensions.
- Use `npm run typecheck` for static checks and `npm test` for runtime tests.
- Use `npm run build` before deployment; it typechecks the native TypeScript source and bundles the Worker to `dist/index.js` for the Notion hosted runtime.

The `tsconfig.json` enables `erasableSyntaxOnly` so type checking catches syntax that Node cannot strip natively.

Local tests intentionally import only composable feature logic such as `src/luma-mail/handler.ts` and `src/health/importHealthFixture.ts`. The Worker entrypoint imports `@notionhq/workers`, which is exercised by the Notion CLI during local Worker execution. Deployment uses the generated JavaScript bundle because the hosted capability-discovery runtime loads the packaged `dist/index.js` entrypoint after build.
