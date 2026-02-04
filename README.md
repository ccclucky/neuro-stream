# NeuroStream

Agent-native payment and settlement protocol layer. Enables AI agents to automatically discover, pay for, and consume services with on-chain escrow guarantees.

## Core Flow

```
Agent → Escrow Lock → Provider (ciphertext) → Claim → Decrypt
```

## Project Structure

```
packages/
  contracts/   — Escrow smart contract (Solidity + Hardhat)
  sdk/         — TypeScript SDK for Agent developers
  indexer/     — Envio HyperIndex for on-chain events
apps/
  frontend/    — Next.js DApp (Privy + Wagmi + shadcn/ui)
  provider/    — Provider API service
  backend/     — Supabase Edge Functions + migrations
memory-bank/   — Project documentation
```

## Setup

1. Copy `.env.example` to `.env` and fill in values
2. `pnpm install`
3. `pnpm dev`

## Documentation

- [PRD](memory-bank/prd.md)
- [Architecture](memory-bank/architecture.md)
- [Implementation Plan](memory-bank/implementation-plan.md)
- [Tech Stack](memory-bank/tech-stack.md)
