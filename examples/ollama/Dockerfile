# Local MailAgent API + Ollama stack — wrangler dev bound for Docker port publish.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY examples/ollama/docker-entrypoint.sh /usr/local/bin/mailagent-ollama-entrypoint.sh
RUN chmod +x /usr/local/bin/mailagent-ollama-entrypoint.sh

EXPOSE 8787

ENTRYPOINT ["/usr/local/bin/mailagent-ollama-entrypoint.sh"]
