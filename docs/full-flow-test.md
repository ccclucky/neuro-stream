# NeuroStream 全流程测试指南

从零开始完整测试 Agent → Provider → Escrow → Indexer 全链路。
所有数据通过前端 UI 操作生成，不手动写入数据库。

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

确认输出的合约地址与 `apps/provider/.env` 的 `ESCROW_CONTRACT_ADDRESS` 一致，然后：

```bash
cd ../../apps/provider && pnpm dev
```

### 终端 3 — Indexer + Frontend

```bash
# 项目根目录
pnpm dev
```

确认日志中有：
```
[indexer] Starting — escrow=0x5FbDB2315678afecb367f032d93F642f64180aa3, poll=3000ms
```

Frontend 在 `http://localhost:3000`。

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

5. 点击 **Register Service**，前端会弹出钱包签名请求（签名内容为 `NeuroStream: Register service <serviceId> at <timestamp>`），确认签名
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
NEUROSTREAM_API_KEY=ns_live_<你复制的 key>
NEUROSTREAM_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
NEUROSTREAM_API_URL=https://uppsdjgmgfwbknbzvhby.supabase.co/functions/v1
MONAD_RPC_URL=http://127.0.0.1:8545
ESCROW_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
GEMINI_API_KEY=<你的 Gemini API Key>
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

  Escrow: 0x5FbDB2315678afecb367f032d93F642f64180aa3
  Agent:  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  Balance: 9999.99... ETH

You >
```

---

## Step 6: 测试调用

### 测试 1: 闲聊（不触发付费）

```
You > hello
```

预期：Agent 直接回复，没有 "Discovering services" 或 "Payment" 日志。不花钱。

### 测试 2: 触发服务调用

```
You > 请帮我处理一下这段文字: Hello World
```

预期输出：
```
──────────────────────────────────────────────────────────
  Discovering services (keyword: ...)...
  Calling NeuroStream (on-chain escrow payment)...

  ⚡ Payment  id=0xabcdef...  cost=0.001... ETH  latency=3000ms

Agent > [Gemini 基于服务结果生成的回复]
```

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
| `payments` | 至少 1 条，status = `Released` |
| `call_logs` | 至少 1 条，success = `true` |
| `metrics` | 1 条，total_calls >= 1 |

### 方法 B: 前端查看

- **Provider 面板**（`/provider`）：Revenue Statistics 显示 Total Earned > 0
- **Services 页面**（`/services`）：服务列表可见

---

## 数据流总结

```
                           ┌──────────────┐
                           │   Frontend   │
                           │  (Next.js)   │
                           └──┬───────┬───┘
                     注册服务 │       │ 生成 API Key
                              ▼       ▼
                        ┌─────────────────┐
                        │    Supabase     │
                        │  (services /    │
                        │   api_keys)     │
                        └────────▲────────┘
                                 │
              发现服务 / 上报指标  │
         ┌───────────────────────┤
         │                       │
    ┌────┴─────┐          ┌──────┴──────┐
    │  Agent   │          │   Indexer   │
    │  (CLI)   │          │  (viem →    │
    │          │          │  Supabase)  │
    └────┬─────┘          └──────▲──────┘
         │                       │
         │  invoke + 链上付款     │  监听链上事件
         │                       │
    ┌────▼─────┐          ┌──────┴──────┐
    │ Provider │          │  Hardhat    │
    │ (Express)│◄────────►│  (本地链)   │
    │  :3001   │  claim   │  :8545      │
    └──────────┘          └─────────────┘
```

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Agent 报 `Missing required env vars` | `.env` 缺字段 | 检查 Step 4 |
| `fetch failed` / `ECONNREFUSED` | Hardhat 或 Provider 没启动 | 检查终端 1、2 |
| Discovery 返回空列表 | 没注册服务 | 完成 Step 2 |
| Discovery 401 | API Key 无效 | 重新在前端 Agent 面板生成 |
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
