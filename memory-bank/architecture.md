# NeuroStream 架构设计

## 1. 系统概览
NeuroStream 采用分层结构，实现 Agent 支付、合约结算与数据索引的解耦。

## 2. 核心架构图 (Architecture Diagram)

```mermaid
graph TD
    subgraph "Agent Runtime"
        Agent[Agent Entity]
        SDK[NeuroStream SDK]
    end

    subgraph "Monad Blockchain (Execution)"
        Escrow["Escrow Contract (Solidity)"]
        Monad["Monad Testnet"]
    end

    subgraph "Index Layer"
        Envio["Envio HyperIndex (Rust)"]
        GraphQL["GraphQL Interface"]
    end

    subgraph "Backend Infrastructure (Supabase)"
        Auth["Supabase Auth"]
        DB["PostgreSQL (Agent Hub)"]
        Edge["Edge Functions (Router)"]
    end

    subgraph "DApp Frontend"
        NextJS["Next.js Application"]
    end

    %% Interactions
    Agent --> SDK
    SDK -->|Payment Challenge| Escrow
    SDK -->|Invoke| Edge
    Escrow -->|Events| Envio
    Envio -->|Indexed Data| GraphQL
    GraphQL -->|Data Fetch| NextJS
    Edge -->|Verify Receipt| GraphQL
    Edge -->|Store Metadata| DB
    NextJS -->|User Management| Auth
```

## 3. 组件职责

### 3.1 Escrow Contract (Monad)
*   负责资金锁定 (Lock) 与释放 (Claim)。
*   通过 `Hashlock` 确保交付后再打款。
*   提供超时自动退款机制。

### 3.2 Envio Indexer (Index Layer)
*   极速同步链上 `PaymentLocked` 和 `PaymentReleased` 事件。
*   提供低延迟的数据查询 API，供 Backend 和 Frontend 校验。

### 3.3 Supabase (Backend Layer)
*   **Edge Functions**: 作为服务的中央网关，验证链上 Receipt 的真实性，并转发请求至 Provider。
*   **PostgreSQL**: 存储 Provider 的评分、质量指标（从 Envio 同步或手动聚合）。

### 3.4 Next.js (Frontend Layer)
*   Provider 的管理面板：发布 Service Manifest。
*   Agent 所有者的控制台：监控支付历史与额度。

## 4. 关键流程：合约与索引的闭环

1.  **支付阶段**: Agent 在 Monad 链上调用 `Escrow.open()`。
2.  **索引阶段**: Envio HyperIndex 数秒内捕获事件并生成记录。
3.  **调用阶段**: Supabase Edge Function 查询 GraphQL 接口，确认资金已就位，随即放行请求。
4.  **结算阶段**: Provider 完成交付并调用 `Escrow.claim()`。
