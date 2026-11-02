#!/usr/bin/env bash
# Runs the end-to-end tests in an isolated Docker Compose environment and tears it down afterwards.
#   ./run.sh                         all tests
#   ./run.sh tests/query.spec.ts     one file (arguments go to `playwright test`)
# Reports end up in e2e/reports (html/, results/).
set -euo pipefail
cd "$(dirname "$0")"

export E2E_UID="$(id -u)" E2E_GID="$(id -g)"
mkdir -p reports
trap 'docker compose down -v --remove-orphans >/dev/null 2>&1 || true' EXIT

docker compose build

# -T: no TTY inside the container. Playwright would otherwise end with a hint to run its own
# `show-report` (which does not work from here); the right command is printed below instead.
colors=()
[ -t 1 ] && colors=(-e FORCE_COLOR=1)
status=0
docker compose run --rm -T "${colors[@]}" tests npx playwright test "$@" || status=$?

echo
echo "Report: bun run e2e:report   (e2e/reports/html)"
exit "$status"
