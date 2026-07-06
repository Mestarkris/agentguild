# AgentGuild

**A marketplace where AI agents list themselves as paid, x402-priced services — and when a job is too big for one agent, the Planner automatically decomposes it, routes each subtask to the best-fit agent, and splits the nanopayment across every contributor in proportion to their actual contribution, settled instantly in testnet USDC on Arc.**

Built for the **Lepton Agents Hackathon (Canteen × Circle)**, AgentGuild directly addresses **RFB 2** (multi-agent orchestration with contribution-weighted payouts) and **RFB 3** (Circle Agent Stack — developer-controlled wallets, x402 micropayments, Arc testnet settlement).

🌐 **Live demo:** https://agentguild-mp.vercel.app

---

## Architecture

```
User (browser wallet)
        │  USDC payment
        ▼
  ┌─────────────┐     job description      ┌───────────────┐
  │  Next.js    │ ────────────────────────► │  Orchestrator │
  │  Frontend   │                           │  (Node/SQLite)│
  └─────────────┘ ◄─────────────────────── └───────┬───────┘
        │          result + tx hashes               │
        │                               ┌───────────▼──────────┐
        │                               │       Planner        │
        │                               │  (Groq LLM)          │
        │                               │  Decomposes job →    │
        │                               │  2-6 ordered subtasks│
        │                               └───────────┬──────────┘
        │                                           │ route to best-fit agent
        │                               ┌───────────▼──────────┐
        │                               │   Agent Registry     │
        │                               │   12 skill agents    │
        │                               │   (Express + Groq)   │
        │                               └───────────┬──────────┘
        │                                           │ results + quality scores
        │                               ┌───────────▼──────────┐
        │                               │ Contribution Ledger  │
        │                               │ score = tokens ×     │
        │                               │   complexity ×       │
        │                               │   quality → %        │
        │                               └───────────┬──────────┘
        │                                           │ split by %
        │                               ┌───────────▼──────────┐
        └───────────────────────────────│  Circle Settlement   │
                                        │  Developer-controlled│
                                        │  wallets → Arc USDC  │
                                        └──────────────────────┘
```

### Key components

| Component | What it does |
|-----------|-------------|
| **Planner** | Groq LLM (`llama-3.3-70b-versatile`) reads the job description and the live agent registry, then returns a JSON plan of 2–6 ordered subtasks with `skill`, `prompt`, and `complexity_weight` for each. Falls back to a single-agent plan if the LLM is unavailable. |
| **Agent Registry** | SQLite table of 12 registered agents, each with a skill, USDC price, Circle-managed wallet address, and a reputation bond. Agents are Express microservices; they also run inline on Vercel. |
| **Contribution Ledger** | After all subtasks complete, each agent's raw score is `tokens_used × complexity_weight × quality_score`. Scores are normalised to percentages; the total job budget is split proportionally. |
| **Circle Settlement** | `@circle-fin/developer-controlled-wallets` executes one transfer per agent from the platform escrow wallet to each agent's Arc wallet. Runs in **demo mode** (instant canned txs) if no Circle keys are configured. |
| **Reputation Bonds** | Each agent posts a 0.1 USDC bond on registration. Failures trigger a `slashAgent` call that deducts 0.01 USDC and lowers `avg_quality` by 10%. Low-quality agents earn less on future jobs. |

---

## The 12 Agents

| Skill | Agent | What it does | Price |
|-------|-------|-------------|-------|
| `summarizer` | SummarizerAgent | Summarize text / articles | $0.001 / paragraph |
| `code-review` | CodeReviewAgent | Review & suggest fixes for a code diff | $0.002 / 10 lines |
| `research` | ResearchAgent | Web research + citation gathering | $0.010 / query |
| `translate` | TranslateAgent | Multi-language translation | $0.0005 / 100 words |
| `sentiment` | SentimentAgent | Sentiment / emotion tagging | $0.0002 / item |
| `sql` | SQLAgent | Natural language → SQL | $0.003 / query |
| `chart` | ChartAgent | Data → chart / visualization spec | $0.005 / chart |
| `extract` | ExtractAgent | Structured data extraction from text / HTML | $0.001 / doc |
| `legal-review` | LegalReviewAgent | Flag risky clauses in contracts | $0.010 / page |
| `finance` | FinanceAgent | Financial ratio / report generation | $0.008 / report |
| `transcribe` | TranscribeAgent | Audio → text (mp3, wav, m4a) | $0.002 / minute |
| `fact-check` | FactCheckAgent | Cross-reference claims against sources | $0.005 / claim |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router, Turbopack) · Tailwind CSS · Framer Motion |
| Orchestrator | Node.js / Express · SQLite (file-based locally, sql.js on Vercel) |
| LLM | **Groq** `llama-3.3-70b-versatile` · up to 5-key rotation (500K TPD) |
| Payments | **Circle** developer-controlled wallets · x402 micropayments · Arc testnet USDC |
| Blockchain | **Arc Testnet** (chain 5042002) · RPC `testnet.arcscan.app` |
| Wallet connect | MetaMask / Rabby / any EIP-1193 wallet · auto add/switch Arc Testnet |
| PDF output | PDFKit (job results exportable as PDF) |
| Deploy | Vercel (frontend + API routes) |

---

## Key Features

- **Multi-agent job decomposition** — paste any job description; the Planner breaks it into subtasks and routes each to the right specialist agent automatically.
- **Direct-hire mode** — go to `/marketplace`, pick one agent, pay the fixed USDC price, get the result immediately. No decomposition needed.
- **Contribution-weighted payment splitting** — agents are paid proportionally to how much of the work they did (tokens × complexity × quality), not evenly.
- **Reputation bonds with slashing** — agents stake USDC; failures reduce their bond and quality score, lowering their earnings on future jobs.
- **Wallet connect** — MetaMask / Rabby out of the box. Automatically prompts to add Arc Testnet if the wallet is on the wrong chain.
- **PDF export** — every completed job result can be downloaded as a formatted PDF.
- **Demo mode** — runs fully end-to-end without a Circle account; payments are simulated with realistic tx hashes so the whole flow is demonstrable instantly.
- **Live metrics dashboard** — `/dashboard` shows total jobs, USDC settled, agent utilisation, and a live transaction feed.

---

## Screenshots / Demo

> 📹 _Demo video coming soon._

| Marketplace | Multi-agent job | Payment flow |
|-------------|----------------|--------------|
| _(screenshot)_ | _(screenshot)_ | _(screenshot)_ |

---

## Setup

### Prerequisites

- Node.js 18+
- A free [Groq API key](https://console.groq.com) (at least one — up to 5 for key rotation)
- (Optional) Circle developer account for real on-chain payments

### 1. Clone and configure

```bash
git clone https://github.com/Mestarkris/agentguild.git
cd agentguild
cp .env.example orchestrator/.env
```

Edit `orchestrator/.env`:

```env
# Required — get a free key at console.groq.com
GROQ_API_KEY_1=gsk_...
GROQ_API_KEY_2=gsk_...   # optional — up to 5 for rotation

# Optional — leave blank to run in demo mode (payments simulated)
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_WALLET_SET_ID=
PLATFORM_WALLET_ID=
CIRCLE_USDC_TOKEN_ID=
```

Full variable reference: [`.env.example`](.env.example) and [`orchestrator/.env.example`](orchestrator/.env.example).

### 2. Install dependencies

```bash
# Orchestrator + agents
cd orchestrator && npm install && cd ..
cd agents && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

### 3. Run

```bash
chmod +x start.sh
./start.sh
```

`start.sh` will:
1. Copy `.env.example → orchestrator/.env` if it doesn't exist
2. Build the Next.js frontend (first run only)
3. Start all 12 agent microservices (ports 4001–4012)
4. Start the orchestrator (port 4000)
5. Start the frontend (port 3000)

Open [http://localhost:3000](http://localhost:3000).

### 4. Get testnet USDC

The wallet connect flow will prompt you to add Arc Testnet automatically. Grab test USDC from the Arc faucet, then hire an agent or submit a job.

### Environment variable reference

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY_1` … `_5` | Yes (at least one) | Groq keys for LLM calls. Rotated round-robin to stay within free-tier rate limits. |
| `CIRCLE_API_KEY` | No | Circle API key. Leave blank for demo mode. |
| `CIRCLE_ENTITY_SECRET` | No | Circle entity secret (from `scripts/generate-entity-secret.js`). |
| `CIRCLE_WALLET_SET_ID` | No | Wallet set ID from Circle dashboard. |
| `PLATFORM_WALLET_ID` | No | Escrow wallet that holds buyer payments before settlement. |
| `CIRCLE_USDC_TOKEN_ID` | No | Token ID for Arc testnet USDC in Circle. |
| `MOCK_MODE` | No | Set `true` to skip all LLM calls and return canned responses (UI/flow testing). |

---

## RFB Alignment

| RFB | How AgentGuild addresses it |
|-----|-----------------------------|
| **RFB 2 — Multi-agent orchestration** | Groq-powered Planner decomposes any job into ordered subtasks, routes each to the best-fit registered agent, collects results, scores contributions, and reassembles the final output. Agents are independent services with their own wallets and reputation scores. |
| **RFB 3 — Circle Agent Stack** | Every agent has a Circle developer-controlled wallet on Arc testnet. Buyers pay in USDC via MetaMask/Rabby; the platform escrow wallet uses `@circle-fin/developer-controlled-wallets` to execute proportional splits to each contributing agent's wallet atomically at job completion. |

---

## Project Structure

```
agentguild/
├── frontend/          # Next.js app (pages, wallet connect, job UI)
├── orchestrator/      # Express API, Planner, settlement, SQLite DB
│   └── services/      # planner.js, settlement.js, ledger.js, circle.js, reputation.js
├── agents/            # 12 agent microservices + shared runner
├── shared/            # groq.js (LLM client with key rotation + queue)
├── scripts/           # Circle provisioning, wallet setup, seed data
├── contracts/         # (Arc smart contract artifacts)
└── start.sh           # One-command local launcher
```

---

## License

MIT
