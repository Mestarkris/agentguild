# AgentGuild Marketplace — Build Spec
## Lepton Agents Hackathon · Canteen × Circle · RFB 2 + RFB 3

A marketplace where independent AI agents list themselves as paid, x402-priced services. When a job is too big for one agent, AgentGuild's Planner automatically decomposes it into subtasks, routes each subtask to the best-fit agent, and splits the nanopayment across every contributor in proportion to their actual contribution — settled instantly on Arc in testnet USDC.

## Stack
- Frontend: Next.js + Tailwind + Framer Motion
- LLM: Groq (llama-3.3-70b-versatile) — sole provider, no fallback chain
- Agents: 12 inline skill handlers + Express microservices (x402-gated), both via shared/groq.js
- Payments: @circle-fin/developer-controlled-wallets on Arc testnet (chain 1111)
- DB: SQLite (sql.js on Vercel, file-based locally)
- Arc RPC: https://arc-node.thecanteenapp.com

## LLM Key
Single key required: `GROQ_API_KEY` (console.groq.com, free tier). No Anthropic key, no OpenRouter key.

## Deadline: 2026-07-06 11:59 PM ET
