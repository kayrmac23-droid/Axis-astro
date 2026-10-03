#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web (remote containers)
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo '{"async": true, "asyncTimeout": 300000}'

cd "${CLAUDE_PROJECT_DIR:-.}"

# Install dependencies so lint, tests, and build all work out of the box.
#
# --no-save is load-bearing, not a style choice. A plain `npm install` REWRITES
# package-lock.json on every run in this container: the committed lockfile was
# written by npm 11, the image ships npm 10.9.7, and the older npm strips the
# `libc` field from all 30 platform-specific native packages (@img/sharp-*,
# @next/swc-linux-*, @rolldown/binding-linux-*, lightningcss-linux-*). Since this
# hook fires on every session start AND resume, every resume left the working
# tree dirty with a lockfile downgrade — noise that is easy to commit by accident
# and that would break glibc/musl variant selection if it ever landed.
#
# --no-save keeps the install incremental (so the cached container state is still
# worth something) while never writing package.json or package-lock.json.
# Measured in this image: install 1304ms/dirty, install --no-save 944ms/clean,
# ci 20773ms/clean. `npm ci` also fixes the mutation but wipes node_modules and
# rebuilds from scratch, which is ~16x slower on every single resume.
npm install --no-save
