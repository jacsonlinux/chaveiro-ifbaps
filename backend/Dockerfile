FROM mcr.microsoft.com/playwright:v1.62.0-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3010
ENV EXTERNAL_ENV_PATH=/run/secrets/chaveiro-ifbaps.env

EXPOSE 3010

CMD ["node", "dist/main.js"]
