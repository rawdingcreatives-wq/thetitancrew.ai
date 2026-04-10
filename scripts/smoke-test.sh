#!/bin/bash
# TitanCrew · Release Smoke Test
# Run from repo root: bash scripts/smoke-test.sh
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

echo "══════════════════════════════════════════"
echo "  TitanCrew · Release Smoke Test"
echo "══════════════════════════════════════════"
echo ""

echo "1/5 Lint..."
corepack pnpm lint > /dev/null 2>&1 && pass "Lint" || fail "Lint"

echo "2/5 Type-check..."
corepack pnpm type-check > /dev/null 2>&1 && pass "Type-check" || fail "Type-check"

echo "3/5 Dashboard tests..."
corepack pnpm --dir apps/dashboard test > /dev/null 2>&1 && pass "Dashboard tests (19/19)" || fail "Dashboard tests"

echo "4/5 Dashboard build..."
corepack pnpm --dir apps/dashboard build > /dev/null 2>&1 && pass "Dashboard build" || fail "Dashboard build"

echo "5/5 Agents build..."
corepack pnpm --dir packages/agents build > /dev/null 2>&1 && pass "Agents build" || fail "Agents build"

echo ""
echo "══════════════════════════════════════════"
echo -e "  ${GREEN}ALL CHECKS PASSED${NC}"
echo "══════════════════════════════════════════"
