/** Published @mailagent/* versions — sync on npm release (see docs/PUBLISH.md) */
export const NPM_PACKAGES = {
  mcp: {
    name: "@mailagent/mcp",
    version: "0.2.9",
    install: "npx -y -p @mailagent/mcp@0.2.9 mailagent-mcp",
  },
  qa: {
    name: "@mailagent/qa",
    version: "0.1.14",
    install: "npm install @mailagent/qa@0.1.14",
  },
  agent: {
    name: "@mailagent/agent",
    version: "0.1.11",
    install: "npm install @mailagent/agent@0.1.11",
  },
  agentPy: {
    name: "mailagent-agent",
    version: "0.1.0",
    install: "pip install mailagent-agent",
    path: "packages/mailagent-agent-py",
  },
} as const;
