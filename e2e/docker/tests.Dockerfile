# Playwright with its browsers; keep the tag in step with @playwright/test in e2e/package.json.
FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /e2e
COPY e2e/package.json e2e/package-lock.json ./
RUN npm ci
COPY e2e/ ./
CMD ["npx", "playwright", "test"]
