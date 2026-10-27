FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /workspace/financial-agent

COPY financial-agent/package*.json ./
RUN npm install

COPY financial-agent/ ./
COPY packages/server-auth/ ../packages/server-auth/

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 3003

CMD ["npm", "run", "dev"]
