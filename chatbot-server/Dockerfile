FROM node:20-alpine

WORKDIR /workspace/chatbot-server

# The chatbot uses the repo-local @aa/action-tags package. Preserve the
# repository-relative path expected by package.json and package-lock.json.
COPY packages/action-tags/ ../packages/action-tags/
COPY chatbot-server/package*.json ./
RUN npm ci

COPY chatbot-server/ ./

EXPOSE 3002

CMD ["node", "server.js"]
