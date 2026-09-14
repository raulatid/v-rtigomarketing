#!/bin/sh
# Vercel's Install Command. `vercel.json` points here because Vercel caps
# `installCommand` at 256 characters and the package list alone is longer.
#
# The blog display's screenshot (scripts/blog-preview.mjs) needs a Chromium, and
# the Amazon Linux 2023 build image has none of the shared libraries it links
# against — the loader names only the first missing one (libnspr4.so), so all 21
# that Playwright lists for Chromium (nativeDeps.ts) go in at once, as their
# AL2023 packages. Build container only: the functions and dist/ never see them.
#
# THE DEPLOY CONTRACT (DECISIONS §42): a screenshot failure must never fail a
# deploy. So the dnf step is guarded — a failed package install prints one line
# and the build carries on to the neutral plate — and `npm install`, exactly
# Vercel's default for a package-lock.json project, is exec'd last so this
# script's exit status is npm's and nothing else.
#
# No `set -e`, on purpose: the guard IS the error handling.

dnf install -y --setopt=install_weak_deps=False \
  alsa-lib \
  atk \
  at-spi2-atk \
  at-spi2-core \
  cairo \
  cups-libs \
  dbus-libs \
  glib2 \
  libdrm \
  libX11 \
  libxcb \
  libXcomposite \
  libXdamage \
  libXext \
  libXfixes \
  libxkbcommon \
  libXrandr \
  mesa-libgbm \
  nspr \
  nss \
  pango \
  || echo '[blog-preview] Chromium system libraries could not be installed; the blog display will wear its neutral plate'

exec npm install
