# NeuroStream 架构设计

## 1. 系统概览
NeuroStream 采用分层结构，通过 **Payment Gateway** 解耦 Agent 与 Provider 的支付逻辑，实现链上结算与服务调用的分离。

## 2. 核心架构图（v3 — Gateway 架构）

```mermaid
graph TD
    subgraph "Agent Runtime"
        Agent[Agent Entity]
        SDK[NeuroStream SDK]
    end

    subgraph "Payment Gateway (Next.js API Route)"
        GW["Gateway API<br/>/api/gateway/invoke<br/>/api/gateway/status"]
        SM["State Machine<br/>9 states, recovery task"]
    end

    subgraph "Monad Blockchain (Execution)"
        Escrow["Escrow Contract (Solidity)"]
        Monad["Monad Testnet"]
    end

    subgraph "Index Layer"
        Indexer["viem Poller → Supabase"]
    end

    subgraph "Backend Infrastructure (Supabase)"
        Auth["Supabase Auth"]
        DB["PostgreSQL<br/>(services, api_keys,<br/>gateway_challenges,<br/>payments, metrics)"]
        Edge["Edge Functions (Router)"]
    end

    subgraph "DApp Frontend"
        NextJS["Next.js Application"]
    end

    subgraph "Provider"
        ProvAPI["Provider HTTP API<br/>(纯 HTTP，无需钱包)"]
    end

    %% Interactions
    Agent --> SDK
    SDK -->|1. POST /invoke| GW
    SDK -->|3. Escrow.open()| Escrow
    SDK -->|4. POST /invoke + requestId| GW
    GW -->|5. 转发 HTTP 请求| ProvAPI
    GW -->|7. 持久化结果| DB
    GW -->|8. claim()| Escrow
    GW --> SM
    Escrow -->|Events| Indexer
    Indexer -->|Indexed Data| DB
    DB -->|Data Fetch| NextJS
    Edge -->|Verify API Key| DB
    Edge -->|Store Metadata| DB
    NextJS -->|User Management| Auth
```

## 3. 组件职责

### 3.1 Payment Gateway（核心新增 — v3）
*   **位置**：`apps/frontend/src/app/api/gateway/`（Next.js API Route）
*   **状态机**：9 个状态驱动完整支付流程
    ```
    CREATED → ESCROW_LOCKED → PROVIDER_CALLED → RESULT_STORED → CLAIMED → COMPLETED
        ↓           ↓               ↓                ↓              ↓
      FAILED    REFUNDABLE      REFUNDABLE       REFUNDABLE     COMPLETED
    ```
*   **核心职责**：
    1. 生成 preimage/hashLock，创建付费挑战（402 响应）
    2. 验证 Agent 的链上 Escrow 锁定
    3. 转发请求到 Provider（普通 HTTP）
    4. 持久化结果到 `gateway_challenges` 表
    5. 使用 Gateway 钱包执行链上 `claim()`
    6. 返回明文结果给 Agent
*   **恢复任务**：每 30 秒扫描卡住的请求，自动推进到下一步
*   **CAP 选择**：CP（一致性 + 分区容忍优先于可用性）
*   **写前执行原则**：先写 DB 再执行链上/外部操作，确保崩溃后可恢复

### 3.2 Escrow Contract (Monad)
*   **ERC20 代币支付**（v4）：使用 `IERC20 paymentToken`（构造函数参数，immutable），不再使用原生 ETH。
*   部署时指定支付代币地址（本地用 MockERC20/6 decimals，主网用 USDC）。
*   **平台抽成**（v5）：构造函数接收 `platform` 地址和 `feeBps`（基点，200=2%，最高 5000=50%）。`claim()` 自动分账：fee 转给 platform，剩余转给 provider。`PlatformFeeCollected` 事件记录每笔抽成。
*   Agent 需先 `approve(escrow, amount)` 再调用 `open()`，合约通过 `safeTransferFrom` 拉取代币。
*   `claim()` 不限制 `msg.sender` — 任何持有有效 preimage 的地址均可调用（标准 HTLC 做法）。资金始终发到 `payment.provider`（Provider 嵌入式钱包），而非 `msg.sender`。Gateway 使用自己的钱包调用 claim()，Provider 直接在链上收到款项。
*   `claim()` 通过 `safeTransfer` 分账（fee → platform, remainder → provider），`refund()` 全额退还 agent。
*   通过 `Hashlock` 确保交付后再打款。
*   提供超时自动退款机制。
*   **Gas 策略（统一规则）**：

| 角色 | 操作 | Gas 谁付 | 逻辑 |
|------|------|---------|------|
| Agent | approve() + open() | Agent | Agent 发起服务请求，自己的交易 |
| Agent | withdraw USDC/MON | Agent | 自己取钱 |
| Provider | withdraw USDC/MON | Provider | 自己取钱 |
| Gateway | claim() | 平台 | 平台的收款操作，经营成本 |

**原则**：谁的操作谁付 gas，谁受益谁承担。

*   **环境变量**：`PAYMENT_TOKEN_ADDRESS`、`PAYMENT_TOKEN_DECIMALS`、`PLATFORM_ADDRESS`、`PLATFORM_FEE_BPS`。

### 3.3 NeuroStream SDK
*   **v3 Gateway 模式**（推荐）：`gatewayUrl` 配置后，自动走 Gateway 流程
    1. POST /invoke → 402 挑战
    2. ERC20 approve() → Escrow.open()（Agent 锁定代币到 Gateway 地址）
    3. POST /invoke + requestId → Gateway 调用 Provider → 返回结果
*   **配置**：需要 `tokenAddress`（或 `PAYMENT_TOKEN_ADDRESS` 环境变量）
*   **Legacy 模式**：不设 `gatewayUrl`，直连 Provider（需 Provider 实现 402 + 加密 + claim）
*   单一入口：`callService({ keyword/serviceId, params })` 自动路由

### 3.4 Provider
*   **v3 极简化**：纯 HTTP API，无需钱包/私钥/区块链集成
*   只需实现 `POST / { text } → { result }` 格式接口
*   所有加密/支付/claim 逻辑由 Gateway 处理

### 3.5 viem + Supabase Indexer (Index Layer)
*   使用 viem `getLogs` 轮询链上 `PaymentLocked`、`PaymentReleased`、`PaymentRefunded` 和 `PlatformFeeCollected` 事件。
*   将事件数据写入 Supabase PostgreSQL `payments` 表。
*   `indexer_state` 表存储区块游标，支持崩溃恢复。
*   轮询间隔可配置（默认 3 秒）。

### 3.6 Supabase (Backend Layer)
*   **Edge Functions**: API Key 验证、服务发现、指标上报。
*   **PostgreSQL**: 存储 Provider 信息、服务注册、质量指标、链上支付数据、Gateway 挑战状态。
*   **关键表**：
    - `providers` — Provider 信息
    - `services` — 服务注册
    - `api_keys` — Agent API Key
    - `gateway_challenges` — Gateway 状态机（v3 新增）
    - `payments` — 链上支付事件索引
    - `call_logs` + `metrics` — 质量指标

### 3.7 Next.js (Frontend Layer)
*   Provider 的管理面板：发布 Service Manifest。
*   Agent 所有者的控制台：监控支付历史与额度。
*   **同时承载 Payment Gateway API Route**（`/api/gateway/*`）。

## 4. 关键流程：v3 Gateway 闭环

1.  **挑战阶段**: Agent SDK POST /invoke → Gateway 返回 402 + { requestId, hashLock, amount, recipient(=Provider 钱包), deadline }
2.  **锁定阶段**: Agent 先调用 `token.approve(escrow, amount)`，再调用 `Escrow.open(requestId, providerWallet, amount, hashLock, deadline)`
3.  **调用阶段**: Agent SDK POST /invoke + requestId → Gateway 验证 Escrow（provider 地址 == provider_wallet）→ 转发到 Provider → 拿到结果
4.  **持久化阶段**: Gateway 将 Provider 结果写入 `gateway_challenges.provider_result`
5.  **结算阶段**: Gateway 调用 `Escrow.claim(requestId, preimage)`（Gateway 钱包付 gas），资金直接到 Provider 嵌入式钱包（98% provider + 2% platform）
6.  **完成阶段**: Gateway 返回 `{ result, requestId }` 给 Agent
7.  **恢复阶段**: 每 30s 恢复任务扫描 ESCROW_LOCKED / RESULT_STORED 状态的卡住请求，自动推进

## 5. 不变量保证

| 不变量 | 描述 | 机制 |
|--------|------|------|
| **G1 (Agent)** | 锁定资金 → 必须得到结果 OR 能退款 | Escrow deadline + refund() |
| **G2 (Provider)** | 结果已持久化 → 最终一定被支付 | DB 先写 + 恢复任务重试 claim |
| **INV-1** | 状态只能单调前进 | 乐观锁 `WHERE status = expected` |
| **INV-2** | 先写 DB 再执行外部操作 | 写前执行原则 |

## 6. 数据库架构（gateway_challenges 表）

```sql
CREATE TABLE gateway_challenges (
  request_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'CREATED',
  -- 参与方
  agent_address TEXT NOT NULL,
  service_id TEXT NOT NULL,
  provider_url TEXT NOT NULL,
  provider_wallet TEXT,  -- Provider 嵌入式钱包地址（claim 资金直接到此地址）
  -- 密码学
  preimage TEXT NOT NULL,
  hash_lock TEXT NOT NULL,
  -- 支付
  amount TEXT NOT NULL,
  recipient TEXT NOT NULL,
  deadline BIGINT NOT NULL,
  -- 结果 & 链上
  provider_result TEXT,
  claim_tx_hash TEXT,
  -- 错误追踪
  last_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  -- 时间戳
  created_at, escrow_locked_at, provider_called_at,
  result_stored_at, claimed_at, completed_at
);
```
