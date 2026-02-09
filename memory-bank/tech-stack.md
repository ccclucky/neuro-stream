# NeuroStream 技术栈方案

## 1. 核心目标
NeuroStream 作为一个 Agent-native 的结算协议，其技术栈选型优先考虑 **极致性能 (Monad)**、**安全稳健 (Hardhat/Solidity)**、**轻量索引 (viem + Supabase)** 和 **简化接入 (Payment Gateway)**，同时利用 **Supabase** 降低后端运维复杂度。

## 2. 技术栈详情

### 2.1 基础设施与公链
*   **目标链**: [Monad Testnet](https://www.monad.xyz/)
    *   **理由**: 具备 10,000+ TPS 和 1 秒确定性，是 Agent 高频交互的理想选择。
*   **本地合约开发**: Hardhat
    *   **理由**: 行业标准的 Solidity 开发环境，支持灵活的测试和部署脚本。
*   **Indexer (索引器)**: viem + Supabase 轮询索引器
    *   **理由**: 使用 viem `getLogs` 轮询链上事件，直接写入 Supabase PostgreSQL，零新基础设施依赖。

### 2.2 Payment Gateway（v3 新增）
*   **技术**: Next.js API Route（运行在 `apps/frontend/` 内）
    *   **理由**: 复用现有 Next.js 应用，无需新增独立服务。
*   **状态机**: 9 状态驱动，乐观锁保证一致性
    *   **理由**: CAP 选择 CP（一致性 + 分区容忍），"写前执行"原则确保崩溃可恢复。
*   **恢复任务**: setInterval 每 30s 扫描卡住请求
    *   **理由**: 轻量级方案，无需外部消息队列或 cron 服务。
*   **Gateway 钱包**: 独立私钥，用于链上 `claim()` 交易
    *   **理由**: Gateway 作为可信中介，需要自己的签名能力执行领款。

### 2.3 后端基础设施 (Supabase)
*   **数据库**: PostgreSQL (Supabase DB)
    *   **理由**: 强一致性关系数据库，存储 Agent 元数据、服务摘要、API Key 和 Gateway 挑战状态。
*   **后端逻辑**: Supabase Edge Functions (Deno)
    *   **理由**: 无服务器架构，支持地理位置分布，降低 Agent 调用的网络延迟。
*   **身份认证**: Supabase Auth
    *   **理由**: 快速集成，支持多平台 OAuth。
*   **关键表**: `providers`, `services`, `api_keys`, `gateway_challenges`, `payments`, `call_logs`, `metrics`

### 2.4 前端与 DApp (Next.js)
*   **框架**: Next.js (App Router)
    *   **理由**: 支持服务端渲染 (SSR) 和边缘运行时，极致的加载速度。**同时承载 Payment Gateway API Route。**
*   **Web3 客户端**: Wagmi + Viem
    *   **理由**: 现代、类型安全、体积小、性能高。
*   **UI 组件**: shadcn/ui + Tailwind CSS
    *   **理由**: 兼顾审美与性能，高度可定制。

### 2.5 SDK (TypeScript)
*   **核心库**: Viem（钱包/合约交互）
*   **v3 Gateway 模式**: `gatewayUrl` 配置后自动走 Gateway 流程
*   **Legacy 模式**: 直连 Provider（需 Provider 实现完整 402 + 加密 + claim）
*   **单一入口**: `callService({ keyword/serviceId, params })`

### 2.6 Provider (Express)
*   **v3 极简化**: 纯 HTTP API，无需钱包/私钥/区块链依赖
*   **接口**: `POST / { text } → { result }`
*   **依赖**: 仅 Express，不依赖 viem 或加密库

## 3. 选型取舍 (Design Decisions)

| 决策维度 | 选型 | 排除原因 |
| :--- | :--- | :--- |
| **Payment 模型** | **Gateway 中介** | 直连模型要求 Provider 实现钱包/加密/claim 逻辑，门槛过高。Gateway 类似支付宝/PayPal，平台担保交付。 |
| **Gateway 部署** | **Next.js API Route** | 独立微服务增加运维复杂度。复用 Next.js 零新基础设施。 |
| **CAP 选择** | **CP（一致性优先）** | 支付场景不容许状态不一致。宁可请求失败，不可状态丢失。 |
| **恢复机制** | **setInterval 30s** | 消息队列（Redis/RabbitMQ）过重。简单定时器足够 hackathon 场景。 |
| **Indexer** | **viem + Supabase** | Envio 需 Docker（PostgreSQL + Hasura），过于复杂。Ponder 增加额外基础设施。 |
| **公链** | **Monad** | 传统 L2 (Base/Arbitrum) 性能尚可，但 Monad 的并行执行更适合 Agent 大规模爆发场景。 |
| **后端** | **Supabase** | 自建 Fastify 服务器虽灵活，但 Supabase 的集成度能显著缩短 hackathon 开发周期。 |

## 4. 安全防护
*   **合约安全**: 严格遵循 Escrow + Hashlock 模式。
*   **API Key 验证**: Gateway 验证 `x-api-key` Header，查询 Supabase `api_keys` 表。
*   **乐观锁**: 状态机使用 `WHERE status = expected_status` 防止并发竞争。
*   **写前执行**: 先持久化 DB 状态再执行链上操作，确保崩溃后可恢复。
*   **超时保护**: Escrow deadline 保证 Agent 资金不会永久锁定。
*   **敏感信息**: 使用 Supabase Vault 管理 Provider API Keys 和敏感元数据。

## 5. Hardhat 账户分配（本地开发）

| 账户 | 角色 | 用途 |
|------|------|------|
| Account #0 | Deployer | 部署合约 |
| Account #1 | Provider | Provider 钱包（v3 中不直接使用） |
| Account #2 | Agent | Agent 钱包，SDK 签名 |
| Account #3 | **Gateway** | Gateway 钱包，执行 claim() |
