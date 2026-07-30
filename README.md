# Where To Dump

Directory of US waste disposal facilities — landfills, transfer stations,
recycling centers, e-waste dropoff, scrap metal, and RV dump stations.

Forked from go-farm-hop (2026-07-29). See `CLAUDE.md` for architecture decisions
and the migration checklist, `docs/fork-review.md` for the pre-fork code review,
and `docs/research-notes.md` for niche research and data sources.

## Stack

- Next.js (App Router) + TypeScript + Tailwind v4
- Cloudflare Workers via OpenNext, Cloudflare D1 (no Supabase), Cloudflare Images
- Data: Outscraper (Google Maps) + EPA LMOP + state permit databases

## Commands

- `npm run dev` — local dev
- `npm run deploy` — build + deploy to Cloudflare Workers
