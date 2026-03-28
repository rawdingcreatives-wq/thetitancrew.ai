#!/bin/bash
# ─────────────────────────────────────────────────────────────
# TitanCrew — Initial GitHub push script
# Run this ONCE from inside the titancrew-repo folder:
#   cd path/to/titancrew-repo
#   bash push-to-github.sh
# ─────────────────────────────────────────────────────────────

set -e  # exit on any error

REMOTE="https://github.com/rawdingcreatives-wq/titancrew.ai.git"

echo "🚀 TitanCrew — Initializing repo..."

# Initialize git if not already done
if [ ! -d ".git" ]; then
  git init
  echo "✅ git init"
else
  echo "ℹ️  git already initialized"
fi

# Set main branch
git checkout -b main 2>/dev/null || git checkout main

# Add remote (skip if already exists)
if ! git remote get-url origin > /dev/null 2>&1; then
  git remote add origin "$REMOTE"
  echo "✅ Remote added: $REMOTE"
else
  echo "ℹ️  Remote already set"
fi

# Stage everything
git add .

# Commit
git commit -m "feat: TitanCrew v1.0 — full platform build (Phases 0–6)

- 6 Customer Crew agents with guardrail chain (HIL, LiabilityFilter, AuditLogger, CostGovernor)
- 9 Meta-Swarm agents (OnboarderAgent, BillingChurnAgent, PerformanceOptimizerAgent, CaseStudyGeneratorAgent, ViralLoopAgent, etc.)
- Next.js 15 dashboard with 10 pages and 20+ components
- Google Calendar + QuickBooks Online + Ferguson/Grainger integrations
- Legal: ToS, DPA, AI Liability Disclaimer, TCPA Policy
- Supabase RLS on all 21 tables, DB-level CostGovernor trigger
- 6 n8n workflows for automation and cron scheduling
- 495 seed leads (TX/FL/CA) + cold email/DM templates
- E2E simulation: 24/24 tests passing
- One-click deploy guide: Railway + Vercel + Supabase (~45 min)"

echo "✅ Initial commit created"

# Push
echo "📤 Pushing to GitHub..."
git push -u origin main

echo ""
echo "🎉 Done! Your repo is live:"
echo "   https://github.com/rawdingcreatives-wq/titancrew.ai"
echo ""
echo "Next steps:"
echo "  1. Go to Supabase and run the 3 SQL files in infrastructure/supabase/"
echo "  2. Copy .env.example → .env.local and fill in your keys"
echo "  3. Deploy dashboard to Vercel (import from GitHub)"
echo "  4. Deploy agents to Railway (import from GitHub)"
echo "  5. See DEPLOY.md for the full walkthrough"
