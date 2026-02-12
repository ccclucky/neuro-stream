# NeuroStream 全流程测试指南（v4 — ERC20 支付）

从零开始完整测试 Agent → Gateway → Provider → Escrow 全链路。
所有数据通过前端 UI 操作生成，不手动写入数据库。

**v4 架构变更：** 支付代币从原生 ETH 改为 ERC20（USDC）。
本地测试使用 MockERC20（6 位精度），主网使用真实 USDC 合约。
Escrow 合约通过 `approve` + `transferFrom` 拉取代币，不再使用 `msg.value`。

---

## 前置条件

- Node.js >= 18
- pnpm 已安装（`pnpm install`）
- Gemini API Key（Google Cloud Console，应用限制设为"无"）

---

## Step 0: 重置数据库

```bash
pnpm -w run db:reset
```

预期输出：
```
[db-reset] ✓ 000_reset.sql
[db-reset] ✓ 001_init.sql
[db-reset] ✓ 002_payments.sql
[db-reset] ✓ 003_api_keys.sql
[db-reset] ✓ 004_gateway.sql
[db-reset] Done. Database has been reset.
```

---

## Step 1: 启动服务（4 个终端）

### 终端 1 — Hardhat 本地链

```bash
cd packages/contracts && npx hardhat node
```

等待 20 个测试账户输出后保持运行。

### 终端 2 — 部署合约 + 启动 Provider

```bash
cd packages/contracts && npx hardhat run scripts/deploy.ts --network localhost
```

**v4 变化：** 现在会部署两个合约。预期输出：
```
Deploying with account: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Account balance: 10000.0 ETH

No PAYMENT_TOKEN_ADDRESS set — deploying MockERC20...
MockERC20 deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Minted 10000.0 USDC to Account #0 (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
Minted 10000.0 USDC to Account #1 (0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
Minted 10000.0 USDC to Account #2 (0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC)
Minted 10000.0 USDC to Account #3 (0x90F79bf6EB2c4f870365E785982E1f101E93b906)
Minted 10000.0 USDC to Account #4 (0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65)
...（Account #6 ~ #19 各 10000.0 USDC）
Escrow deployed to: 0x59b670e9fA9D0A427751Af201D676719a970857b

Add to your .env:
PAYMENT_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
ESCROW_CONTRACT_ADDRESS=0x59b670e9fA9D0A427751Af201D676719a970857b
PAYMENT_TOKEN_DECIMALS=6
```
> **注意：** 如果之前部署过且 `.env.development.local` 中已有旧的 `PAYMENT_TOKEN_ADDRESS`，
> 重启 Hardhat 节点后脚本会检测到合约不存在，自动重新部署 MockERC20 并 mint 代币。
> **重要：** 记下两个合约地址！
> - `PAYMENT_TOKEN_ADDRESS` = MockERC20 合约地址
> - `ESCROW_CONTRACT_ADDRESS` = Escrow 合约地址
>
> 两个地址不再相同（v3 时只有一个 Escrow 地址）。

然后启动 Provider：

```bash
cd ../../apps/provider && pnpm dev
```

预期输出：
```
Provider service running on port 3001
Simple HTTP API — no wallet/escrow needed
```

### 终端 3 — Indexer + Frontend + Gateway

将部署输出的合约地址填入 `.env.development.local`（密钥文件，不提交 Git）：

```bash
# 在项目根目录编辑 .env.development.local
# 更新合约地址（每次重新部署后都需更新）
PAYMENT_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
ESCROW_CONTRACT_ADDRESS=0x59b670e9fA9D0A427751Af201D676719a970857b

# Next.js 前端需要 NEXT_PUBLIC_ 前缀的副本
NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=0x59b670e9fA9D0A427751Af201D676719a970857b
```

> **环境变量管理说明：**
>
> | 文件 | Git | 内容 |
> |------|-----|------|
> | `.env` | 提交 | 通用默认值（`PROVIDER_PORT`、`PAYMENT_TOKEN_DECIMALS`） |
> | `.env.development` | 提交 | 非敏感开发默认值（URL、Chain ID、公钥） |
> | `.env.development.local` | 忽略 | 密钥 + 合约地址（每个开发者独立维护） |
>
> 加载顺序：`.env` → `.env.local` → `.env.development` → `.env.development.local`
> 后加载的文件覆盖前面的值。

然后启动：

```bash
# 项目根目录
pnpm dev
```

确认日志中有：
```
[indexer] Starting — escrow=0x59b670e9fA9D0A427751Af201D676719a970857b, poll=3000ms
```

Frontend + Gateway 在 `http://localhost:3000`。

### 终端 4 — Agent（暂不启动，等 Step 3 完成）

---

## Step 2: 前端注册 Provider 服务

1. 打开 `http://localhost:3000/provider`
2. 点击 **Login** 登录（Privy 会自动创建 embedded wallet）
3. 登录后记下你的 **钱包地址**
4. 点击 **Register Service**，填写：

   | 字段 | 填写值 | 说明 |
   |------|--------|------|
   | Service ID | `text-analysis-v1` | 服务唯一标识 |
   | Service Type | `utility` | 下拉选择 |
   | Endpoint URL | `http://localhost:3001/invoke` | Provider 调用地址 |
   | Price per Call | `0.01` | 每次调用 0.01 USDC（v4：单位是 USDC，不是 ETH） |

5. 点击 **Register Service**，签名确认
6. "My Services" 列表中应出现该服务

---

## Step 3: 前端生成 API Key

1. 打开 `http://localhost:3000/agent`
2. 登录
3. 点击 **Generate API Key**，签名确认
4. **立即复制 API Key**（仅显示一次！）

---

## Step 4: 配置 Agent .env

将部署地址和 API Key 填入 `apps/agent/.env`：

```env
# NeuroStream SDK
NEUROSTREAM_API_KEY=ns_live_<你复制的 key>
NEUROSTREAM_PRIVATE_KEY=<你的 Agent 钱包私钥>
NEUROSTREAM_API_URL=https://uppsdjgmgfwbknbzvhby.supabase.co/functions/v1

# Gateway
NEUROSTREAM_GATEWAY_URL=http://localhost:3000

# Blockchain
MONAD_RPC_URL=http://127.0.0.1:8545
ESCROW_CONTRACT_ADDRESS=0x59b670e9fA9D0A427751Af201D676719a970857b

# Payment Token (v4 新增)
PAYMENT_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
PAYMENT_TOKEN_DECIMALS=6

# Gemini
GEMINI_API_KEY=<你的 Gemini API Key>
```

> **关键变量说明：**
>
> | 变量 | 用途 |
> |------|------|
> | `NEUROSTREAM_PRIVATE_KEY` | Agent 钱包私钥（任意钱包均可，需在 Step 4.5 中充值） |
> | `PAYMENT_TOKEN_ADDRESS` | **v4 新增**。MockERC20 合约地址，SDK 用它做 `approve` + `transferFrom` |
> | `PAYMENT_TOKEN_DECIMALS` | **v4 新增**。代币精度（USDC = 6） |
> | `NEUROSTREAM_GATEWAY_URL` | Gateway URL，设置后走 Gateway 流程 |
> | `NEUROSTREAM_API_KEY` | 平台 API Key |

---

## Step 4.5: 给 Agent 钱包充值（v4 新增）

Agent 钱包需要 **ETH（gas 费）** 和 **USDC（服务付款）**。

先获取你的 Agent 钱包地址（由 `NEUROSTREAM_PRIVATE_KEY` 推导）。

**1. 转 ETH（gas 费）：**

```bash
cast send <Agent钱包地址> \
  --value 10ether \
  --private-key $NEUROSTREAM_PRIVATE_KEY \
  --rpc-url http://127.0.0.1:8545
```

> 使用 Hardhat Account #0 的私钥转 10 ETH 给 Agent 钱包。

**2. Mint USDC：**

```bash
cd packages/contracts && \
PAYMENT_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3 \
MINT_TO=<Agent钱包地址> \
MINT_AMOUNT=10000 \
npx hardhat run scripts/mint-tokens.ts --network localhost
```

预期输出：
```
Minted 10000.0 USDC to <Agent钱包地址>
New balance: 10000.0 USDC
```

---

## Step 5: 启动 Agent

**终端 4：**

```bash
cd apps/agent && pnpm dev
```

预期输出：
```
╔══════════════════════════════════════════════════════════╗
║            NeuroStream AI Agent                          ║
║     Gemini-powered  ·  On-chain payments  ·  CLI         ║
╚══════════════════════════════════════════════════════════╝

  Escrow: 0x59b670e9fA9D0A427751Af201D676719a970857b
  Agent:  <Agent钱包地址>
  API Key: ns_live_...
  Wallet: <Agent钱包地址>
  Balance: 10000.0 USDC

You >
```

---

## Step 6: 测试调用

### 测试 1: 闲聊（不触发付费）

```
You > hello
```

预期：Agent 直接回复，没有 "Calling NeuroStream" 或 "Payment" 日志。不花钱。

### 测试 2: 触发服务调用（Gateway 流程）

```
You > 请帮我处理一下这段文字: Hello World
```

预期输出：
```
──────────────────────────────────────────────────────────
  Calling NeuroStream (keyword: auto)...

  ⚡ Payment  id=0xabcdef...  cost=0.01 USDC  latency=3000ms

Agent > [Gemini 基于服务结果生成的回复]
```

**幕后流程（v4 — ERC20 支付）：**
1. SDK 调用 `callService()` → 发现服务 `text-analysis-v1`
2. SDK POST `http://localhost:3000/api/gateway/invoke` → Gateway 返回 402 挑战
3. SDK 调用 `token.approve(escrow, 10000)`（0.01 USDC = 10000 最小单位）
4. SDK 调用 `escrow.open(requestId, gateway, 10000, hashLock, deadline)`（ERC20 transferFrom 拉取代币）
5. SDK 再次 POST invoke（带 requestId）→ Gateway 调用 Provider → 存结果 → claim 领款 → 返回结果
6. SDK 拿到结果，报告 metrics

### 测试 3: 查看余额变化

```
You > /balance
```

余额应少了 0.01 USDC（如 `9999.99 USDC`）。

---

## Step 7: 验证数据记录

### 方法 A: Supabase Dashboard

打开 https://supabase.com/dashboard/project/uppsdjgmgfwbknbzvhby/editor

| 表 | 预期 |
|------|------|
| `services` | 1 条：Step 2 注册的服务 |
| `api_keys` | 1 条：Step 3 生成的 key |
| `gateway_challenges` | 至少 1 条，status = `COMPLETED` |
| `payments` | 至少 1 条，status = `Released`（Indexer 写入） |
| `call_logs` | 至少 1 条，success = `true` |
| `metrics` | 1 条，total_calls >= 1 |

> **`gateway_challenges` 关键字段检查：**
>
> | 字段 | 预期值 |
> |------|--------|
> | `status` | `COMPLETED` |
> | `amount` | `10000`（0.01 USDC × 10^6） |
> | `provider_result` | Provider 返回的 JSON 结果 |
> | `claim_tx_hash` | 非空（claim 交易 hash） |
> | `provider_http_status` | `200` |

### 方法 B: 前端查看

- **Provider 面板**（`/provider`）：Revenue Statistics 显示 Total Earned > 0
- **Services 页面**（`/services`）：服务列表可见

---

## 数据流总结（v4 — ERC20 支付）

```
                           ┌──────────────────────┐
                           │   Frontend + Gateway  │
                           │     (Next.js :3000)   │
                           └──┬───────┬────────┬───┘
                     注册服务 │       │        │ Gateway API
                              ▼       │        │ /api/gateway/*
                        ┌─────────┐   │        │
                        │Supabase │   │        │
                        │services │   │        │
                        │api_keys │   │        │
                        │gateway_ │   │        │
                        │challenges│  │        │
                        └────▲────┘   │        │
                             │        │        │
           发现服务/上报指标  │ 生成Key │        │ ③ 调用 Provider
         ┌───────────────────┤        │        │ ④ 存结果
         │                   │        │        │ ⑤ claim 领款
    ┌────┴─────┐      ┌─────┴─────┐  │   ┌────▼─────┐
    │  Agent   │      │  Indexer  │  │   │ Provider │
    │  (CLI)   │      │ (viem →   │  │   │ (Express)│
    │          │      │ Supabase) │  │   │  :3001   │
    └────┬─────┘      └─────▲─────┘  │   └──────────┘
         │                  │        │    纯 HTTP API
         │ ① 请求 Gateway   │        │    无需钱包！
         │ ② approve USDC   │        │
         │ ③ 锁定 escrow    │        │
         │                  │        │
         └──────────────────┴────────┘
                     ▲
                     │
              ┌──────┴──────┐
              │  Hardhat    │   MockERC20 (USDC)
              │  (本地链)   │   + Escrow 合约
              │  :8545      │
              └─────────────┘
```

**vs v3 的区别：**
- 支付从原生 ETH 改为 ERC20 代币（USDC）
- Agent 需先 `approve` 再 `open`（两笔交易）
- 本地测试用 MockERC20，主网用真实 USDC
- Agent 需要预先拥有 USDC 代币余额

---

## Hardhat 账户分配

| 账户 | 地址 | 用途 |
|------|------|------|
| #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Deployer（合约部署 + 初始 USDC 持有者） |
| #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | 预留 |
| #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | **Gateway**（escrow 收款方 + claim 签名） |
| 自定义 | 由 `NEUROSTREAM_PRIVATE_KEY` 推导 | **Agent**（SDK 钱包，锁定 escrow） |

> 部署脚本会自动给 Account #0 ~ #19 各 mint 10,000 USDC。
> Agent 使用独立钱包，需在 Step 4.5 中手动充值 ETH + USDC。

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Agent 报 `tokenAddress is required` | 缺少 `PAYMENT_TOKEN_ADDRESS` | 添加到 `.env` |
| Agent Balance 显示 `0 USDC` | Agent 钱包没有 USDC | 使用 Hardhat 内置账户（已自动 mint），或用 `mint-tokens.ts` 手动 mint |
| `ERC20: insufficient allowance` | approve 交易未确认 | 检查 Hardhat 节点是否运行 |
| Agent 报 `Missing required env vars` | `.env` 缺字段 | 检查 Step 4 |
| `fetch failed` / `ECONNREFUSED` | Hardhat 或 Provider 没启动 | 检查终端 1、2 |
| Discovery 返回空列表 | 没注册服务 | 完成 Step 2 |
| Discovery 401 | API Key 无效 | 重新在前端 Agent 面板生成 |
| Gateway 返回 401 | API Key 无效 | 检查 `NEUROSTREAM_API_KEY` |
| Gateway 返回 404 | 服务未注册 | 完成 Step 2 |
| Gateway 返回 402 Escrow not locked | 锁定交易未确认 | 检查 Hardhat 节点 |
| `gateway_challenges` 卡在 `CREATED` | Agent 没完成 escrow 锁定 | 15 分钟后自动 FAILED |
| `gateway_challenges` 卡在 `RESULT_STORED` | claim 交易失败 | 恢复任务每 30s 重试 |
| payments 表没数据 | Indexer 没运行 | 确认终端 3 有 `[indexer] Starting` |
| Gemini 403 referer blocked | API Key 限制 | Google Console 改为"无" |
| Gemini 不调用服务 | Prompt 不够明确 | 试："使用 text-analysis 服务处理: xxx" |

---

## 快速重置

```bash
# 清空数据库重来
pnpm -w run db:reset

# 重启 Hardhat 节点（终端 1）后重新部署
cd packages/contracts && npx hardhat run scripts/deploy.ts --network localhost
# 或从项目根目录：pnpm -w run deploy:local
# （脚本会自动检测旧合约地址是否失效，失效时重新部署 MockERC20）

# 用新的合约地址更新 .env.development.local（含 NEXT_PUBLIC_ 副本）
# 重新走 Step 2 → Step 6
```
