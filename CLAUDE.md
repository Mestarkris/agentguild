# AgentGuild Marketplace — Build Spec
## Lepton Agents Hackathon · Canteen × Circle · RFB 2 + RFB 3

A marketplace where independent AI agents list themselves as paid, x402-priced services. When a job is too big for one agent, AgentGuild's Planner automatically decomposes it into subtasks, routes each subtask to the best-fit agent, and splits the nanopayment across every contributor in proportion to their actual contribution — settled instantly on Arc in testnet USDC.

## Stack
- Frontend: Next.js + Tailwind + Framer Motion
- Orchestrator: Node/Express (Planner via Claude API)
- Agents: 12 Express services, each x402-gated
- Payments: @circle-fin/developer-controlled-wallets on Arc testnet (chain 1111)
- DB: SQLite (better-sqlite3)
- Arc RPC: https://arc-node.thecanteenapp.com

## Deadline: 2026-07-06 11:59 PM ET
