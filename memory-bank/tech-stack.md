# NeuroStream 技术栈方案

## 1. 核心目标
NeuroStream 作为一个 Agent‑native 的结算协议，其技术栈选型优先考虑 **极致性能 (Monad)**、**安全稳健 (Hardhat/Solidity)** 和 **轻量索引 (viem + Supabase)**，同时利用 **Supabase** 降低后端运维复杂度。

## 2. 技术栈详情

### 2.1 基础设施与公链
*   **目标链**: [Monad Testnet](https://www.monad.xyz/)
    *   **理由**: 具备 10,000+ TPS 和 1 秒确定性，是 Agent 高频交互的理想选择。
*   **本地合约开发**: Hardhat
    *   **理由**: 行业标准的 Solidity 开发环境，支持灵活的测试和部署脚本。
*   **Indexer (索引器)**: viem + Supabase 轮询索引器
    *   **理由**: 使用 viem `getLogs` 轮询链上事件，直接写入 Supabase PostgreSQL，零新基础设施依赖。

### 2.2 后端基础设施 (Supabase)
*   **数据库**: PostgreSQL (Supabase DB)
    *   **理由**: 强一致性关系数据库，存储 Agent 元数据、服务摘要和用户偏好。
*   **后端逻辑**: Supabase Edge Functions (Deno)
    *   **理由**: 无服务器架构，支持地理位置分布，降低 Agent 调用的网络延迟。
*   **身份认证**: Supabase Auth
    *   **理由**: 快速集成，支持多平台 OAuth。

### 2.3 前端与 DApp (Next.js)
*   **框架**: Next.js (App Router)
    *   **理由**: 支持服务端渲染 (SSR) 和边缘运行时，极致的加载速度。
*   **Web3 客户端**: Wagmi + Viem
    *   **理由**: 现代、类型安全、体积小、性能高。
*   **UI 组件**: shadcn/ui + Tailwind CSS
    *   **理由**: 兼顾审美与性能，高度可定制。

## 3. 选型取舍 (Design Decisions)

| 决策维度 | 选型 | 排除原因 |
| :--- | :--- | :--- |
| **Indexer** | **viem + Supabase** | Envio 虽然性能优秀，但需要 Docker（PostgreSQL + Hasura），对 hackathon 项目过于复杂。Ponder 虽然 DX 更好，但增加了额外基础设施。viem 轮询 + Supabase 复用现有数据库，零新依赖。 |
| **公链** | **Monad** | 传统 L2 (Base/Arbitrum) 性能尚可，但 Monad 的并行执行更适合 Agent 大规模爆发场景。 |
| **后端** | **Supabase** | 自建 Fastify 服务器虽灵活，但 Supabase 的集成度能显著缩短 hackathon 开发周期。 |

## 4. 安全防护
*   **合约安全**: 严格遵循 Escrow + Hashlock 模式。
*   **敏感信息**: 使用 Supabase Vault 管理 Provider API Keys 和敏感元数据。
