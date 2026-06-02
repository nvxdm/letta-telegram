# syntax=docker/dockerfile:1.6

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN yarn build && yarn install --frozen-lockfile --production --ignore-scripts && yarn cache clean

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/package.json ./package.json

USER app
CMD ["node", "dist/main.js"]
