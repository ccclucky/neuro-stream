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

### Step 0: 配置 `.env.local` for Production

```env
# 合约地址（部署后填入）
PAYMENT_TOKEN_ADDRESS=
ESCROW_CONTRACT_ADDRESS=
NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=

# 私钥
DEPLOYER_PRIVATE_KEY=<部署者私钥，需有 MON 测试币>
GATEWAY_PRIVATE_KEY=<Gateway 钱包私钥>

# Supabase prod secrets
SUPABASE_SERVICE_ROLE_KEY=<prod service role key>
SUPABASE_DB_URL=<prod PostgreSQL URL>

# Privy prod
PRIVY_APP_SECRET=<prod Privy secret>
```

### Step 1: 重置数据库（prod Supabase）

```bash
# 先切到 prod 环境
pnpm -w run db:reset
```

> 注意：`db:reset` 默认用 `-c development`。若需重置 prod 数据库，
> 临时修改脚本或手动执行：`dotenv -c production -- tsx scripts/db-reset.ts`

### Step 2: 部署合约到 Monad Testnet

```bash
pnpm -w run deploy:monad:testnet
```

预期输出：
```
Deploying to Monad Testnet (chainId: 10143)...
MockERC20 deployed to: 0x...
Escrow deployed to: 0x...
```

将合约地址填入 `.env.local`（含 `NEXT_PUBLIC_` 副本）。

### Step 3: 构建 & 启动

```bash
pnpm build
pnpm dev   # 或部署到 Vercel
```

### Step 4: 注册服务 + 生成 API Key

同本地流程 Step 2 & 3，但 Provider Endpoint 需要公网可访问的 URL。

### Step 5: 配置 Agent & 测试

Agent `.env` 中使用 Monad Testnet 的 RPC 和合约地址。
Agent 钱包需要 MON（gas）+ USDC（服务付款）。

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
| `tokenAddress is required` | 缺少 `PAYMENT_TOKEN_ADDRESS` | 添加到 `.env.local` |
| `ERC20: insufficient allowance` | approve 未确认 | 检查链节点是否运行 |
| `fetch failed` / `ECONNREFUSED` | 链或 Provider 没启动 | 检查终端 |
| Gateway 返回 402 Escrow not locked | 锁定交易未确认 | 检查链节点 |
| `gateway_challenges` 卡在 `RESULT_STORED` | claim 失败 | 恢复任务每 30s 重试 |
| payments 表没数据 | Indexer 没运行 | 确认有 `[indexer] Starting` |
| Monad Testnet 交易失败 | MON 不足 | 从 Faucet 获取测试币 |
| Provider 余额未增加 | `provider_wallet` 未设置 | 确认注册服务时已登录 |

---

## 快速重置

```bash
# 清空数据库
pnpm -w run db:reset

# 本地：重启 Hardhat 节点后重新部署
pnpm -w run deploy:local
# 用新的合约地址更新 .env.local

# Monad Testnet：重新部署
pnpm -w run deploy:monad:testnet
# 用新的合约地址更新 .env.local
```
