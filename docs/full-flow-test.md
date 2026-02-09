# NeuroStream 全流程测试指南（v3 — Gateway 架构）

从零开始完整测试 Agent → Gateway → Provider → Escrow 全链路。
所有数据通过前端 UI 操作生成，不手动写入数据库。

**v3 架构变更：** Agent 不再直接调用 Provider，而是通过 Gateway（Next.js API Route）中转。
Gateway 统一处理 escrow 锁定、Provider 调用、claim 领款。Provider 只需提供纯 HTTP 接口。

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

确认输出的合约地址为 `0x5FbDB2315678afecb367f032d93F642f64180aa3`，然后：

```bash
cd ../../apps/provider && pnpm dev
```

预期输出（注意：Provider 不再需要钱包）：
```
Provider service running on port 3001
Simple HTTP API — no wallet/escrow needed
```

### 终端 3 — Indexer + Frontend + Gateway

```bash
# 项目根目录
pnpm dev
```

确认日志中有：
```
[indexer] Starting — escrow=0x5FbDB2315678afecb367f032d93F642f64180aa3, poll=3000ms
```

Frontend + Gateway 在 `http://localhost:3000`。
Gateway API 端点：
- `POST http://localhost:3000/api/gateway/invoke`
- `GET  http://localhost:3000/api/gateway/status`

### 终端 4 — Agent（暂不启动，等 Step 3 完成）

---

## Step 2: 前端注册 Provider 服务

1. 打开 `http://localhost:3000/provider`
2. 点击 **Login** 登录（Privy 会自动创建 embedded wallet）
3. 登录后记下你的 **钱包地址**
4. 点击 **Register Service**，填写：

   | 字段 | 填写值 | 说明 |
   |------|--------|------|
   | Service ID | `text-analysis-v1` | 服务唯一标识，Agent 通过关键词匹配发现此服务 |
   | Service Type | `utility` | 下拉选择：`utility` / `ai` / `data` / `compute` |
   | Endpoint URL | `http://localhost:3001/invoke` | Provider Express 服务的调用地址，必须是完整 URL |
   | Price per Call (ETH) | `0.001` | 每次调用价格，Agent 会锁定此金额到 Escrow 合约 |

   > **注意：** Endpoint URL 必须指向已启动的 Provider 服务。本地测试填 `http://localhost:3001/invoke`；
   > 如果 Provider 部署在远程服务器，填对应的公网地址。

5. 点击 **Register Service**，前端会弹出钱包签名请求，确认签名
6. 注册成功后，"My Services" 列表中应出现该服务

---

## Step 3: 前端生成 API Key

1. 打开 `http://localhost:3000/agent`
2. 登录（使用与 Provider 相同的账号或不同账号均可）
3. 在 **API Key** 区域点击 **Generate API Key**，签名确认
4. **立即复制显示的 API Key**（仅显示一次！）

---

## Step 4: 配置 Agent .env

将前端获取的 API Key 填入 `apps/agent/.env`：

```env
# NeuroStream SDK
NEUROSTREAM_API_KEY=ns_live_<你复制的 key>
NEUROSTREAM_PRIVATE_KEY=0xc731b2749e01eec8cd2c7d8720fbf681665865dfcb7ac21afdfeda2f545e7b20
NEUROSTREAM_API_URL=https://uppsdjgmgfwbknbzvhby.supabase.co/functions/v1

# Gateway（v3 新增 — 走 Gateway 流程）
NEUROSTREAM_GATEWAY_URL=http://localhost:3000

# Blockchain
MONAD_RPC_URL=http://127.0.0.1:8545
ESCROW_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

# Gemini
GEMINI_API_KEY=<你的 Gemini API Key>
```

> **关键变量说明：**
>
> | 变量 | 用途 |
> |------|------|
> | `NEUROSTREAM_GATEWAY_URL` | **v3 新增**。设置后 SDK 自动走 Gateway 流程；不设置则走旧的直连 Provider 流程 |
> | `NEUROSTREAM_PRIVATE_KEY` | Agent 钱包私钥，用于签名 escrow 锁定交易 |
> | `NEUROSTREAM_API_KEY` | 平台 API Key，Gateway 用它验证 Agent 身份 |

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

  Escrow: 0x5FbDB2315678afecb367f032d93F642f64180aa3
  Agent:  0x...（你的 Agent 钱包地址）
  Balance: 9999.99... ETH

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

  ⚡ Payment  id=0xabcdef...  cost=0.001... ETH  latency=3000ms

Agent > [Gemini 基于服务结果生成的回复]
```

**幕后流程（Gateway v3）：**
1. SDK 调用 `callService()` → 发现服务 `text-analysis-v1`
2. SDK POST `http://localhost:3000/api/gateway/invoke` → Gateway 返回 402 挑战
3. SDK 在链上锁定 0.001 ETH（收款方 = Gateway 钱包）
4. SDK 再次 POST invoke（带 requestId）→ Gateway 调用 Provider → 存结果 → claim 领款 → 返回明文结果
5. SDK 拿到结果，报告 metrics

### 测试 3: 查看余额变化

```
You > /balance
```

余额应少了约 0.001 ETH。

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
> | `provider_result` | Provider 返回的 JSON 结果 |
> | `claim_tx_hash` | 非空（claim 交易 hash） |
> | `provider_http_status` | `200` |

### 方法 B: 前端查看

- **Provider 面板**（`/provider`）：Revenue Statistics 显示 Total Earned > 0
- **Services 页面**（`/services`）：服务列表可见

### 方法 C: 用 provider_revenue 视图

在 Supabase SQL Editor 执行：
```sql
SELECT * FROM provider_revenue;
```

预期：
```
service_id        | completed_calls | failed_calls | total_revenue_wei
text-analysis-v1  | 1               | 0            | 1000000000000000
```

---

## 数据流总结（v3 — Gateway 架构）

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
         │ ② 链上锁定 escrow │        │
         │                  │        │
         └──────────────────┴────────┘
                     ▲
                     │
              ┌──────┴──────┐
              │  Hardhat    │
              │  (本地链)   │
              │  :8545      │
              └─────────────┘
```

**vs 旧架构的区别：**
- Agent 不再直接调用 Provider，而是通过 Gateway
- Provider 不再需要钱包/私钥/链上操作
- Gateway 统一处理 escrow claim 和故障恢复

---

## Hardhat 账户分配

| 账户 | 地址 | 用途 |
|------|------|------|
| #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Deployer（合约部署） |
| #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Provider（已不需要，仅兼容旧配置） |
| #3 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | **Gateway**（escrow 收款方 + claim 签名） |
| #4+ | 自行分配 | Agent（SDK 钱包，锁定 escrow） |

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Agent 报 `Missing required env vars` | `.env` 缺字段 | 检查 Step 4 |
| `fetch failed` / `ECONNREFUSED` | Hardhat 或 Provider 没启动 | 检查终端 1、2 |
| Discovery 返回空列表 | 没注册服务 | 完成 Step 2 |
| Discovery 401 | API Key 无效 | 重新在前端 Agent 面板生成 |
| Gateway 返回 401 | API Key 无效或未传 | 检查 `NEUROSTREAM_API_KEY` |
| Gateway 返回 404 Service not found | 服务未注册 | 完成 Step 2 |
| Gateway 返回 402 Escrow not locked | Agent 锁定交易未确认 | 检查 Hardhat 节点是否运行 |
| `gateway_challenges` status 卡在 `CREATED` | Agent 没有完成 escrow 锁定 | 15 分钟后自动变为 `FAILED` |
| `gateway_challenges` status 卡在 `RESULT_STORED` | claim 交易失败 | Gateway 恢复任务每 30s 自动重试 |
| payments 表没数据 | Indexer 没运行 | 确认终端 3 有 `[indexer] Starting` |
| call_logs 表没数据 | API Key 无效（上报静默失败） | 更新 `.env` 里的 API Key |
| Gemini 403 referer blocked | API Key 有 HTTP Referrer 限制 | Google Cloud Console → 应用限制改为"无" |
| Gemini 不调用服务 | Prompt 不够明确 | 试："使用 text-analysis 服务处理: xxx" |
| 前端 Provider 看不到服务 | recipient 不匹配钱包地址 | 用同一账号登录注册 |

---

## 快速重置

```bash
# 清空数据库重来
pnpm -w run db:reset

# 重启所有终端
# 重新走 Step 2 → Step 6
```
