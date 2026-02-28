# NeuroStream 全流程测试指南（v5 — Monad Testnet + 简化环境变量）

从零开始完整测试 Agent → Gateway → Provider → Escrow 全链路。
适配 Monad Testnet 部署、4 文件环境变量结构、Provider 直接收款、钱包 MON 存取。

**v5 变更：**
- 环境变量从 6 文件简化为 4 文件（`.env` + `.env.development` + `.env.production` + `.env.local`）
- Secrets 和合约地址统一放 `.env.local`（gitignored）
- Provider 嵌入式钱包直接收到 claim 资金（98% provider + 2% platform）
- 钱包页面支持 MON 原生代币存取

---

## 环境变量结构

| 文件 | Git | 内容 |
|------|-----|------|
| `.env` | 提交 | 通用默认值（`PAYMENT_TOKEN_DECIMALS`、`PLATFORM_FEE_BPS`、`PROVIDER_PORT`） |
| `.env.development` | 提交 | 开发环境非敏感配置（Hardhat URL、Supabase dev、Privy dev） |
| `.env.production` | 提交 | 生产环境非敏感配置（Monad RPC、Supabase prod、Privy prod） |
| `.env.local` | 忽略 | Secrets + 合约地址（切换环境时更新此文件） |

加载顺序：`.env` → `.env.local` → `.env.<env>`
后加载的文件覆盖前面的值。

---

## 前置条件

- Node.js >= 18
- pnpm 已安装（`pnpm install`）
- Gemini API Key（Google Cloud Console，应用限制设为"无"）
- 对于 Monad Testnet：MON 测试币（从 Monad Faucet 获取）

---

## A. 本地测试流程（Hardhat）

### Step 0: 重置数据库

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

确认 `gateway_challenges` 表包含 `provider_wallet` 列。

### Step 1: 启动服务（4 个终端）

#### 终端 1 — Hardhat 本地链

```bash
cd packages/contracts && npx hardhat node
```

等待 20 个测试账户输出后保持运行。

#### 终端 2 — 部署合约 + 启动 Provider

```bash
pnpm -w run deploy:local
```

预期输出（部署两个合约 — MockERC20 + Escrow）：
```
MockERC20 deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Escrow deployed to: 0x59b670e9fA9D0A427751Af201D676719a970857b
```

将合约地址填入 `.env.local`：

```env
PAYMENT_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
ESCROW_CONTRACT_ADDRESS=0x59b670e9fA9D0A427751Af201D676719a970857b
NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=0x59b670e9fA9D0A427751Af201D676719a970857b
```

然后启动 Provider：

```bash
cd apps/provider && pnpm dev
```

#### 终端 3 — Indexer + Frontend + Gateway

```bash
pnpm dev
```

确认日志中有 `[indexer] Starting`。Frontend + Gateway 在 `http://localhost:3000`。

#### 终端 4 — Agent（等 Step 3 完成后启动）

### Step 2: 前端注册 Provider 服务

1. 打开 `http://localhost:3000/provider`
2. 点击 **Login** 登录（Privy 创建 embedded wallet）
3. 记下你的**钱包地址**（Provider 嵌入式钱包，claim 资金直接到这里）
4. 点击 **Register Service**，填写：

   | 字段 | 值 | 说明 |
   |------|----|------|
   | Service ID | `text-analysis-v1` | 服务唯一标识 |
   | Service Type | `utility` | 下拉选择 |
   | Endpoint URL | `http://localhost:3001/invoke` | Provider 调用地址 |
   | Price per Call | `0.01` | 0.01 USDC |

5. 签名确认，"My Services" 列表中应出现该服务

### Step 3: 前端生成 API Key

1. 打开 `http://localhost:3000/agent`
2. 登录
3. 点击 **Generate API Key**，签名确认
4. **立即复制 API Key**（仅显示一次！）

### Step 4: 配置 Agent .env

复制 `apps/agent/.env.example` 为 `apps/agent/.env`，填入 3 个必填项：

```env
# ── 必填（3 个） ──────────────────────────────────────────
NEUROSTREAM_API_KEY=ns_live_<你复制的 key>
NEUROSTREAM_PRIVATE_KEY=<Agent 钱包私钥>
GEMINI_API_KEY=<你的 Gemini API Key>

# ── SDK 配置（部署后的定值，填一次即可） ─────────────────
NEUROSTREAM_API_URL=https://uppsdjgmgfwbknbzvhby.supabase.co/functions/v1
NEUROSTREAM_GATEWAY_URL=http://localhost:3000
ESCROW_CONTRACT_ADDRESS=0x59b670e9fA9D0A427751Af201D676719a970857b
PAYMENT_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

> 其余变量有默认值：`MONAD_RPC_URL` 默认 `http://127.0.0.1:8545`，`PAYMENT_TOKEN_DECIMALS` 默认 `6`。

### Step 4.5: 给 Agent 钱包充值

Agent 钱包需要 **ETH/MON（gas）** 和 **USDC（服务付款）**。

**本地 Hardhat**：部署脚本已自动给账户 #0~#19 各 mint 10,000 USDC。
如果 Agent 使用这些账户的私钥，无需额外操作。

**自定义钱包**：通过前端钱包页面充值。
1. 打开 `http://localhost:3000/wallet`，登录
2. Link External Wallet（连接持有 USDC 的外部钱包）
3. Deposit USDC → 输入金额 → 确认

**运营方 Mint 工具**（仅限本地测试，给自己的钱包 mint）：
```bash
MINT_TO=<目标地址> npx hardhat run scripts/mint-tokens.ts --network localhost
```

### Step 5: 启动 Agent & 测试

```bash
cd apps/agent && pnpm dev
```

```
You > 请帮我处理一下这段文字: Hello World
```

预期：Gateway 流程完成，Agent 收到结果，扣费 0.01 USDC。

### Step 6: 验证

| 表 | 预期 |
|------|------|
| `services` | 1 条：注册的服务 |
| `api_keys` | 1 条：生成的 key |
| `gateway_challenges` | status = `COMPLETED`，`provider_wallet` 非空 |
| `payments` | status = `Released` |

---

## B. Monad Testnet 部署流程

### 前置条件

| 需要 | 说明 |
|------|------|
| MON 测试币 | 从 [Monad Faucet](https://faucet.monad.xyz/) 获取，至少 3 个地址各需 MON：Deployer、Gateway、Agent |
| Supabase 生产项目 | 与开发环境隔离的独立项目 |
| Privy 生产 App | Privy Dashboard 创建 production application |
| Gemini API Key | Google Cloud Console，应用限制设为 "无" |
| 公网域名/URL | Frontend 需部署到 Vercel 或其他托管平台 |

### 架构概览

```
┌──────────┐   HTTPS   ┌────────────────────────────────┐   RPC    ┌──────────────────┐
│  Agent   │ ────────→ │  Frontend (Vercel / localhost)  │ ──────→ │  Monad Testnet   │
│ (本地)   │           │  ├─ Gateway API Route           │         │  Chain ID: 10143 │
└──────────┘           │  ├─ Indexer (轮询链上事件)       │         │  ├─ MockERC20    │
                       │  └─ Next.js Pages               │         │  └─ Escrow       │
┌──────────┐   HTTPS   │                                │         └──────────────────┘
│ Provider │ ←──────── │                                │
│ (公网)   │           └──────────┬─────────────────────┘
└──────────┘                      │ REST
                       ┌──────────▼─────────────────────┐
                       │  Supabase (prod)               │
                       │  ├─ PostgreSQL                  │
                       │  └─ Edge Functions              │
                       └────────────────────────────────┘
```

### 角色 & 钱包一览

| 角色 | 私钥环境变量 | 所需资产 | 说明 |
|------|-------------|---------|------|
| Deployer | `DEPLOYER_PRIVATE_KEY` | MON（gas） | 仅部署合约时使用 |
| Gateway | `GATEWAY_PRIVATE_KEY` | MON（gas）+ USDC（approve 流转） | 后端自动签名 escrow 交易 |
| Agent | `NEUROSTREAM_PRIVATE_KEY` | MON（gas）+ USDC（服务付款） | Agent 程序自动签名 |
| Provider | Privy embedded wallet | 无需预充值 | claim 后自动收到 USDC |
| Platform | `PLATFORM_ADDRESS` | 无需预充值 | claim 后自动收到 2% 手续费 |

---

### Step 0: 准备钱包

生成 3 个以太坊钱包（Deployer、Gateway、Platform），可用任何工具（MetaMask、ethers.js 等）。

```bash
# 示例：用 Node.js 生成钱包
node -e "const w = require('ethers').Wallet.createRandom(); console.log('Address:', w.address, '\nPrivate Key:', w.privateKey)"
```

前往 [Monad Faucet](https://faucet.monad.xyz/) 给 **Deployer** 和 **Gateway** 地址领取 MON 测试币。

---

### Step 1: 配置环境变量

#### 1a. 确认 `.env.production`（已提交到 git）

该文件包含 Monad Testnet 的公开配置，通常无需修改：

```env
# .env.production — 非敏感配置（已提交）
MONAD_RPC_URL=https://testnet-rpc.monad.xyz/
CHAIN_ID=10143
SUPABASE_URL=https://<your-prod-project>.supabase.co
SUPABASE_ANON_KEY=<prod anon key>
PRIVY_APP_ID=<prod privy app id>

# Next.js 公开变量（前端读取）
NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz/
NEXT_PUBLIC_CHAIN_ID=10143
NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS=6
NEXT_PUBLIC_SUPABASE_URL=https://<your-prod-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<prod anon key>
NEXT_PUBLIC_PRIVY_APP_ID=<prod privy app id>
```

> 如果之前未配置 Supabase 或 Privy 生产项目，需先在各平台创建项目并填入。

#### 1b. 配置 `.env.local`（gitignored，存放 secrets）

```env
# ── 私钥 ─────────────────────────────────────────────────
DEPLOYER_PRIVATE_KEY=0x<部署者私钥，需有 MON 测试币>
GATEWAY_PRIVATE_KEY=0x<Gateway 钱包私钥>

# ── Platform 手续费接收地址 ──────────────────────────────
PLATFORM_ADDRESS=0x<Platform 钱包地址>

# ── 合约地址（Step 3 部署后填入）──────────────────────────
PAYMENT_TOKEN_ADDRESS=
ESCROW_CONTRACT_ADDRESS=
NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=

# ── Supabase prod secrets ────────────────────────────────
SUPABASE_SERVICE_ROLE_KEY=<prod service role key>
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres

# ── Privy prod ───────────────────────────────────────────
PRIVY_APP_SECRET=<prod privy secret>
```

> **注意**：`.env.local` 被 `.gitignore` 排除，永远不要提交到 git。

---

### Step 2: 初始化 Supabase 生产数据库

#### 2a. 关联生产项目

```bash
pnpm -w run supabase:link:prod
```

这会将 Supabase CLI 关联到 `.env.production` 中的生产项目。

#### 2b. 重置/初始化数据库表结构

```bash
pnpm -w run db:reset:prod
```

> `pnpm -w run db:reset` 默认使用 `-c development`，生产环境需手动指定 `-c production`。

预期输出：
```
[db-reset] ✓ 000_reset.sql
[db-reset] ✓ 001_init.sql
[db-reset] ✓ 002_payments.sql
[db-reset] ✓ 003_api_keys.sql
[db-reset] ✓ 004_gateway.sql
[db-reset] Done. Database has been reset.
```

#### 2c. 部署 Edge Functions

```bash
pnpm -w run supabase:deploy:prod
```

这会部署 `services`、`metrics`、`api-keys` 三个 Edge Function 到生产 Supabase。

---

### Step 3: 部署合约到 Monad Testnet

```bash
pnpm -w run deploy:monad:testnet
```

该命令等价于 `dotenv -c production -- pnpm --filter @neurostream/contracts deploy:monad`，会：
1. 检查 `PAYMENT_TOKEN_ADDRESS` 是否已设置且合约存在
2. 若无 → 部署 **MockERC20**（6 decimals），并给 deployer mint 10,000 USDC
3. 部署 **Escrow** 合约（参数：paymentToken, platformAddress, feeBps）

预期输出：
```
Deploying to Monad Testnet (chainId: 10143)...
MockERC20 deployed to: 0xEdF86dE5C40a3C5FFf16CA63278A31094e038b10
Escrow deployed to: 0xFdB5bA752536663323d5f5004549E04bB1BA86d5

Add to your .env:
  PAYMENT_TOKEN_ADDRESS=0xEdF86dE5C40a3C5FFf16CA63278A31094e038b10
  ESCROW_CONTRACT_ADDRESS=0xFdB5bA752536663323d5f5004549E04bB1BA86d5
```

#### 3a. 回填合约地址

将输出的地址填入 **两个文件**：

**`.env.local`**（secrets 文件，后端/部署使用）：
```env
PAYMENT_TOKEN_ADDRESS=0x<token address>
ESCROW_CONTRACT_ADDRESS=0x<escrow address>
NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=0x<token address>
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=0x<escrow address>
```

**`.env.production`**（提交到 git，Vercel 等部署平台读取）：
```env
# 追加到 .env.production
NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=0x<token address>
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=0x<escrow address>
```

#### 3b. 在区块浏览器验证合约

打开 [Monad Testnet Explorer](https://testnet.monadexplorer.com)，搜索合约地址确认部署成功：
- MockERC20: `https://testnet.monadexplorer.com/address/0x<token>`
- Escrow: `https://testnet.monadexplorer.com/address/0x<escrow>`

---

### Step 4: 给 Gateway 钱包充值 USDC

Gateway 需要 USDC 来执行 escrow 操作（approve + open）。部署脚本仅给 Deployer mint 了 USDC，需转一部分给 Gateway：

```bash
# 方法 1：用 Mint 脚本（如果 MockERC20 有 public mint）
MINT_TO=<gateway 地址> dotenv -c production -- npx hardhat run scripts/mint-tokens.ts --network monad

# 方法 2：通过前端 Wallet 页面从外部钱包转入
```

同时确认 Gateway 地址有足够 MON 用于 gas。

---

### Step 5: 部署 Frontend

#### 方案 A：Vercel 部署（推荐）

1. 将项目推送到 GitHub
2. 在 [Vercel](https://vercel.com) 导入项目
3. 配置：
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/frontend`
   - **Build Command**: `cd ../.. && pnpm build --filter @neurostream/frontend`
   - **Install Command**: `pnpm install`

4. 在 Vercel Dashboard → Settings → Environment Variables 添加以下变量：

   | 变量名 | 值 | 说明 |
   |--------|-----|------|
   | `NEXT_PUBLIC_MONAD_RPC_URL` | `https://testnet-rpc.monad.xyz/` | Monad RPC |
   | `NEXT_PUBLIC_CHAIN_ID` | `10143` | 链 ID |
   | `NEXT_PUBLIC_CHAIN_NAME` | `Monad Testnet` | 链名称 |
   | `NEXT_PUBLIC_NATIVE_CURRENCY_SYMBOL` | `MON` | 原生代币符号 |
   | `NEXT_PUBLIC_BLOCK_EXPLORER_URL` | `https://testnet.monadexplorer.com` | 区块浏览器 |
   | `NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS` | `0x<token>` | USDC 合约地址 |
   | `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS` | `0x<escrow>` | Escrow 合约地址 |
   | `NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS` | `6` | Token 精度 |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<prod>.supabase.co` | Supabase URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | Supabase 公钥 |
   | `NEXT_PUBLIC_PRIVY_APP_ID` | `<prod privy id>` | Privy App ID |
   | `GATEWAY_PRIVATE_KEY` | `0x<gateway key>` | Gateway 签名用（Server-side） |
   | `GATEWAY_WALLET_ADDRESS` | `0x<gateway addr>` | Gateway 地址 |
   | `ESCROW_CONTRACT_ADDRESS` | `0x<escrow>` | Server-side 合约交互 |
   | `PAYMENT_TOKEN_ADDRESS` | `0x<token>` | Server-side 合约交互 |
   | `MONAD_RPC_URL` | `https://testnet-rpc.monad.xyz/` | Server-side RPC |
   | `SUPABASE_URL` | `https://<prod>.supabase.co` | Server-side Supabase |
   | `SUPABASE_ANON_KEY` | `eyJ...` | Server-side Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Server-side 管理操作 |
   | `PRIVY_APP_ID` | `<prod privy id>` | Server-side Privy |
   | `PRIVY_APP_SECRET` | `<prod privy secret>` | Server-side Privy |
   | `PLATFORM_ADDRESS` | `0x<platform addr>` | 手续费接收地址 |
   | `PLATFORM_FEE_BPS` | `200` | 2% 手续费 |
   | `PAYMENT_TOKEN_DECIMALS` | `6` | Server-side Token 精度 |

5. 部署完成后记下域名，如 `https://neuro-stream.vercel.app`

#### 方案 B：本地运行（调试用）

```bash
pnpm build
pnpm dev   # 默认使用 -c development，需要切换到 production 环境
```

如需本地使用生产环境配置：
```bash
dotenv -c production -- pnpm --filter @neurostream/frontend dev
```

---

### Step 6: 部署 Provider（公网可访问）

Provider 是独立的 HTTP 服务，Agent 通过 Gateway 间接调用。**Endpoint URL 必须公网可访问。**

#### 方案 A：云服务器部署

在云服务器（AWS EC2、DigitalOcean 等）上：

```bash
git clone <repo-url> && cd neuro-stream-demo
pnpm install
cd apps/provider && pnpm dev
```

确保端口 3001（或自定义端口）开放，记下公网 URL，如 `http://<server-ip>:3001/invoke`。

#### 方案 B：ngrok 暴露本地端口（快速测试）

```bash
# 终端 1：启动 Provider
cd apps/provider && pnpm dev

# 终端 2：暴露端口
ngrok http 3001
```

记下 ngrok URL，如 `https://abc123.ngrok-free.app/invoke`。

---

### Step 7: 注册服务 + 生成 API Key

#### 7a. 注册 Provider 服务

1. 打开 `https://<your-frontend-domain>/provider`
2. 登录（Privy 创建 embedded wallet）
3. 记下 Provider **embedded wallet 地址**（claim 资金会到这里）
4. 点击 **Register Service**，填写：

   | 字段 | 值 | 说明 |
   |------|----|------|
   | Service ID | `text-analysis-v1` | 服务唯一标识 |
   | Service Type | `utility` | 下拉选择 |
   | Endpoint URL | `https://<public-provider-url>/invoke` | **必须是公网 URL** |
   | Price per Call | `0.01` | 0.01 USDC |

5. 签名确认

#### 7b. 生成 Agent API Key

1. 打开 `https://<your-frontend-domain>/agent`
2. 登录（使用 Agent 钱包对应的账户，或任意账户）
3. 点击 **Generate Key**，签名确认
4. **立即复制 API Key**（仅显示一次！）

---

### Step 8: 配置 Agent & 测试

#### 8a. 配置 Agent 环境变量

复制 `apps/agent/.env.example` 为 `apps/agent/.env`：

```env
# ── 必填（3 个） ───────────────────────────────────────────
NEUROSTREAM_API_KEY=ns_live_<Step 7b 复制的 key>
NEUROSTREAM_PRIVATE_KEY=0x<Agent 钱包私钥>
GEMINI_API_KEY=<你的 Gemini API Key>

# ── SDK 配置（Monad Testnet）──────────────────────────────
NEUROSTREAM_API_URL=https://<prod-supabase>.supabase.co/functions/v1
NEUROSTREAM_GATEWAY_URL=https://<your-frontend-domain>
ESCROW_CONTRACT_ADDRESS=0x<Step 3 部署的 escrow 地址>
PAYMENT_TOKEN_ADDRESS=0x<Step 3 部署的 token 地址>
MONAD_RPC_URL=https://testnet-rpc.monad.xyz/
PAYMENT_TOKEN_DECIMALS=6
```

#### 8b. 给 Agent 钱包充值

Agent 钱包需要 **MON**（gas）和 **USDC**（服务付款）：

1. **MON**：从 [Monad Faucet](https://faucet.monad.xyz/) 领取
2. **USDC**：通过前端 Wallet 页面存入
   - 打开 `https://<your-frontend-domain>/wallet`，用 Agent 账户登录
   - Link External Wallet（连接持有 USDC 的外部钱包）
   - Deposit USDC → 输入金额 → 确认

   或使用 Mint 脚本（如果 Agent 地址和 Deployer 不同）：
   ```bash
   MINT_TO=<agent 地址> dotenv -c production -- npx hardhat run scripts/mint-tokens.ts --network monad
   ```

#### 8c. 启动 Agent 测试

```bash
cd apps/agent && pnpm dev
```

Agent 启动后会开启 Web UI（默认 `http://localhost:3002`）和 CLI 两种交互方式。

测试对话：
```
You > 请帮我分析一下这段文字: Hello World
```

预期流程：
1. Agent 调用 `call_service` → 发送请求到 Gateway
2. Gateway 返回 402 Challenge → Agent 执行 escrow open（链上交易）
3. Gateway 调用 Provider → 获取结果
4. Gateway 执行 claim → USDC 分配（98% Provider + 2% Platform）
5. Agent 收到分析结果

---

### Step 9: 全链路验证

#### 9a. 数据库验证

在 Supabase Dashboard（生产项目）检查以下表：

| 表 | 预期 |
|------|------|
| `services` | 1 条：`text-analysis-v1`，endpoint 为公网 URL |
| `api_keys` | 1 条：`is_active=true` |
| `gateway_challenges` | status = `COMPLETED`，`provider_wallet` 非空 |
| `payments` | status = `Released`，amount 正确 |

#### 9b. 链上验证

在 [Monad Testnet Explorer](https://testnet.monadexplorer.com) 检查：

1. **Escrow 合约**：搜索 escrow 地址，应有 `open` + `claim` 交易
2. **USDC 合约**：查看 Token Transfers，确认：
   - Agent → Escrow（open 时锁定）
   - Escrow → Provider embedded wallet（claim 98%）
   - Escrow → Platform 地址（claim 2%）

#### 9c. 前端验证

1. **Wallet 页面**：交易记录中的 tx hash 可点击跳转到 Monad Explorer
2. **Agent 页面**：Call History 表的 Tx 列 hash 可点击跳转
3. **Provider 页面**：USDC 余额增加（98% of 0.01 USDC = 0.0098 USDC）

---

### Monad Testnet 快速参考

| 项目 | 值 |
|------|-----|
| Chain ID | `10143` |
| RPC URL | `https://testnet-rpc.monad.xyz/` |
| Block Explorer | `https://testnet.monadexplorer.com` |
| Native Token | MON |
| Faucet | `https://faucet.monad.xyz/` |
| 平台手续费 | 2%（200 bps） |
| Token Decimals | 6 |

---

## C. 钱包功能测试

> **核心概念：** 用户登录（Privy）即自动创建 embedded wallet，无需任何额外操作。
> 钱包页面的存取功能是在 **外部钱包**（MetaMask 等）↔ **embedded wallet** 之间互转。

### 前置：登录即拥有 embedded wallet

1. 打开 `http://localhost:3000/wallet`
2. 点击 **Connect Wallet** 登录（Email / Google / 任意 Privy 支持的方式）
3. Privy 自动创建 embedded wallet，页面显示钱包地址和余额（USDC + MON）

### 存取操作（需要 Link External Wallet）

1. 点击 **Connect External Wallet**，连接 MetaMask 等外部钱包
2. 四种操作（Tab 切换）：

   | Tab | 方向 | 说明 |
   |-----|------|------|
   | Deposit USDC | 外部钱包 → embedded wallet | ERC20 transfer |
   | Withdraw USDC | embedded wallet → 外部钱包 | ERC20 transfer |
   | Deposit MON | 外部钱包 → embedded wallet | 原生代币转账 |
   | Withdraw MON | embedded wallet → 外部钱包 | 原生代币转账 |

3. 输入金额，点击按钮，外部钱包签名确认
4. 交易成功后余额自动刷新（约 3 秒延迟）

### Provider 收款验证

1. Provider 登录后，embedded wallet 地址自动记录为 `provider_wallet`
2. Agent 调用服务后，Gateway 执行 `claim()`，资金**直接到 Provider 的 embedded wallet**：
   - 98% → Provider embedded wallet
   - 2% → Platform 地址
3. Provider 在钱包页面可看到 USDC 余额增加
4. Provider 可通过 Withdraw USDC 将收入提取到外部钱包

---

## Hardhat 账户分配（本地测试）

| 账户 | 地址 | 用途 |
|------|------|------|
| #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Deployer |
| #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Gateway |
| 自定义 | 由 `NEUROSTREAM_PRIVATE_KEY` 推导 | Agent |

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| `tokenAddress is required` | 缺少 `PAYMENT_TOKEN_ADDRESS` | 添加到 `.env.local` 和 `.env.production` |
| `ERC20: insufficient allowance` | approve 未确认 | 检查链节点是否运行 |
| `fetch failed` / `ECONNREFUSED` | 链或 Provider 没启动 | 检查终端 |
| Gateway 返回 402 Escrow not locked | 锁定交易未确认 | 检查链节点 |
| `gateway_challenges` 卡在 `RESULT_STORED` | claim 失败 | 恢复任务每 30s 重试 |
| payments 表没数据 | Indexer 没运行 | 确认有 `[indexer] Starting` |
| Monad Testnet 交易失败 | MON 不足 | 从 [Faucet](https://faucet.monad.xyz/) 获取测试币 |
| Provider 余额未增加 | `provider_wallet` 未设置 | 确认注册服务时已登录 |
| `DEPLOYER_PRIVATE_KEY` 为空 | `.env.local` 未配置 | 确认 `.env.local` 中有 Deployer 私钥 |
| Vercel 部署后 Gateway 500 | Server-side 环境变量缺失 | 在 Vercel Dashboard 补齐所有非 `NEXT_PUBLIC_` 变量 |
| Agent 连不上 Gateway | `NEUROSTREAM_GATEWAY_URL` 错误 | 确认指向正确的前端域名（含 https://） |
| Provider Endpoint 不可达 | 非公网 URL | 用 ngrok 或部署到云服务器 |
| Privy 登录失败 | App ID/Secret 不匹配 | 确认 `.env.production` 中用的是 prod Privy 配置 |

---

## 快速重置

```bash
# ── 本地（Hardhat）──────────────────────────────────────
pnpm -w run db:reset                    # 清空 dev 数据库
pnpm -w run deploy:local                # 重启 Hardhat 后重新部署
# 用新的合约地址更新 .env.local

# ── Monad Testnet ──────────────────────────────────────
dotenv -c production -- tsx scripts/db-reset.ts   # 清空 prod 数据库
pnpm -w run deploy:monad:testnet                  # 重新部署合约
# 用新的合约地址更新 .env.local + .env.production + Vercel 环境变量

# ── Supabase Edge Functions ────────────────────────────
pnpm -w run supabase:link:prod          # 关联生产项目
pnpm -w run supabase:deploy:prod        # 重新部署所有 Edge Functions
```
