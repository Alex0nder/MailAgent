# Jest + MailAgent

Для команд на **Jest** (CommonJS `require`).

```bash
npm install -D jest @mailagent/qa
export MAILAGENT_API_KEY=…
export MAILAGENT_API_URL=https://api.webmailagent.com
npx jest examples/jest/mailagent-signup.example.test.js
```

Vitest: [../vitest/README.md](../vitest/README.md).

При timeout: `getDebugContext()` → `formatAllureAttachment()` в CI artifact.
