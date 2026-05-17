#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web (remote containers)
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo '{"async": true, "asyncTimeout": 300000}'

cd "${CLAUDE_PROJECT_DIR:-.}"

# Install dependencies so lint, tests, and build all work out of the box
npm install
