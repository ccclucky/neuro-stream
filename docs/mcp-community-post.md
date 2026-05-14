# MCP 支付层讨论 — NeuroStream 的 Escrow 交付保障实践

> 针对 Issue #2436 "MCP needs a standard payment layer" 的参考实现投稿

## 背景

我们团队正在开发 NeuroStream — 一个为 AI agent 提供 HTLC Escrow 交付保障的支付中间件。在实现过程中，我们发现了一些 MCP 支付层设计中的实际问题，希望分享我们的经验供社区参考。

## 我们解决的核心问题

**"付了钱拿不到结果怎么办？"**

现有支付方案（x402 exact scheme）是直接转账模式：Client → payTo。没有中间锁定，没有交付验证，没有退款机制。对于低价值微调用，"丢了就重试"是可以接受的。但对于 $1+ 的中高价值交易，"付后不管"是不可接受的 — 一次服务失败就是真实的财务损失。

## 我们的方案：HTLC Escrow

我们用 Hashlock + Timelock 合约强制绑定资金释放和内容交付：

```
Agent 锁定 USDC 到 Escrow (hashLock, deadline)
  → Provider 被调用
  → Provider 交付结果
  → Gateway 用 preimage 执行 claim() → Provider 收到款项
  → 如果 Provider 超时不交付 → Agent 执行 refund() → 全额退款
```

**关键保证**：
- Agent: 锁定资金 → 必须得到结果 OR 能退款
- Provider: 结果已持久化 → 最终一定被支付

## MCP 适配中的实际问题

### 1. stdio transport 没有 HTTP 402

MCP stdio transport 使用进程间 JSON-RPC（stdin/stdout），没有 HTTP 状态码。支付信号不能用 402。

**我们的做法**：MCP Server 内部完成全部编排（Gateway HTTP调用 + 链上操作），MCP 客户端只需要调用一个 tool (`pay_and_invoke`) 就得到结果。不需要两步模式。

**但这对 MCP spec 有影响**：如果 spec 定义支付错误码（如 `-32042`），需要考虑 stdio 和 HTTP 两种 transport 都能传达支付信息。

### 2. LLM 可能误触付费 tool

LLM 理解 tool 的方式是读 description。如果 description 里写"此操作花费 $2 USDC"，大部分 LLM 会谨慎使用。但如果 description 没写价格，LLM 可能误触。

**我们的做法**：在 tool description 里明确写价格和风险提示。

**建议 MCP spec**：ToolAnnotations 可以增加 `costHint` 字段（类型：`{ amount: string, currency: string, paymentModel: string }`），让 MCP 客户端在调用前就能向用户确认费用。

### 3. 成本发现（Cost Discovery）

当前 MCP 没有任何机制让 agent 在调用前知道服务价格。Agent 必须先调用才能发现要付多少钱，这对 agent 的预算规划很不利。

**我们的做法**：`discover_services` tool 返回每个服务的价格信息。Agent 可以先浏览价格再决定是否调用。

**建议 MCP spec**：在 ToolAnnotations 或 `_meta` 中增加价格元数据，让 agent 在 tool listing 阶段就能做预算规划。

### 4. 状态机恢复

支付流程涉及多个异步步骤（链上确认、Provider调用、claim）。如果中间任何一步失败或超时，必须有恢复机制。

**我们的做法**：9 状态机 + 乐观锁 + 30秒恢复任务。每一步先写 DB 再执行外部操作（写前执行原则），确保崩溃后可恢复。

**这在 MCP spec 中对应的**：A2A 有 `AUTH_REQUIRED` 中断状态（任务暂停直到认证提供），但没有 `PAYMENT_REQUIRED` 中断状态。如果 MCP 支付 spec 也定义类似的暂停状态，需要同时定义恢复机制。

## 我们的实现可供参考

- Escrow 合约 (Solidity): ERC20 HTLC + 平台分账 + 超时退款 — [GitHub](https://github.com/你的repo)
- 9 状态机: 乐观锁 + 写前执行 + 恢复任务 — 生产级设计
- MCP Server: discover_services + pay_and_invoke + check_status

## 总结建议

1. **支付不是简单的"付钱"** — 它需要交付保障、退款机制、状态恢复。x402 解决了"怎么付"，但没解决"付了怎么办"。
2. **ToolAnnotations 需要成本信息** — `costHint` 让 agent 在调用前就能做预算规划，这对 autonomous agent 很关键。
3. **stdio 和 HTTP transport 需要统一的支付信号** — 不能只依赖 HTTP 402，JSON-RPC 也要有支付表达的机制。
4. **支付状态恢复是必须的** — 没有恢复机制的支付流程在真实环境中不可用。

我们愿意继续贡献设计经验和实现代码。欢迎讨论。