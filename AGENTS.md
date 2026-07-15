<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Worker rules

## src/worker.ts entry point

`main = "src/worker.ts"` in `wrangler.toml`. OpenNext deploy respects this.

**Do NOT use `@/` path aliases in `src/worker.ts`** — wrangler's esbuild bundler does NOT resolve TypeScript `paths` from tsconfig. Always use relative imports like cf-fedishort does.

❌ `import { signRequest } from "@/lib/activitypub/security";`
✅ `import { signRequest } from "../lib/activitypub/security";`
