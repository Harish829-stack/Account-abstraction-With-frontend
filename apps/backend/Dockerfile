FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /workspace/apps/backend

# The backend uses the repo-local @aa/action-tags package. Keep the same
# relative layout inside the image so its file: dependency and lockfile agree.
COPY packages/action-tags/ ../../packages/action-tags/
COPY apps/backend/package*.json ./
RUN npm ci

COPY apps/backend/ ./

# Generate Prisma Client
RUN npx prisma generate

# Build NestJS app
RUN npm run build

EXPOSE 3001

CMD ["npm", "run", "start:container"]
