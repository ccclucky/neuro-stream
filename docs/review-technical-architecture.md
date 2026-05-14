# NeuroStream v5 技术架构评审报告

> 评审人：Software Architect Agent
> 日期：2026-05-14
> 对象：NeuroStream v5 重设计提案（MCP Server + x402 Escrow Backend + Escrow on Monad + Supabase）
> 目标读者：非技术背景创始人，重点解释成本、时间、风险、复杂度

---

## 摘要（给创始人的一句话）

v5 重设计的核心问题是：**你在试图把两个独立协议（MCP 和 x402）缝合在一起，来解决一个你自己已经有解决方案的问题**。当前 Gateway + HTLC Escrow 架构已经实现了"付费后一定能拿到结果或退款"的产品核心承诺。MCP 是分发渠道（让更多 Agent 发现你），x402 是 HTTP 支付协议（让 HTTP API 能收费），两者都不是你当前缺失的能力。你应该把 MCP 作为**新增分发层**叠加在现有 Gateway 上，而不是重写核心支付逻辑去适配 x402。

---

## 1. MCP Server 实现可行性

### 1.1 单体 MCP Server 能否同时处理 discovery + payment + invocation？

**技术上可以，但架构上不应该。**

MCP 工具（tool）是 LLM 调用的原子操作。一个 MCP Server 注册 3 个 tool（`discover_services`, `pay_and_invoke`, `check_status`）完全可行。但问题是：

- `discover_services` 是**只读查询**，零成本，LLM 可以自由调用
- `pay_and_invoke` 是**写操作 + 链上交易**，每次调用花真钱
- LLM 不理解"这个 tool 会花 0.01 USDC"——它只看到 tool description

如果把它们放同一个 Server，LLM 可能在探索阶段就误触 `pay_and_invoke`，或者在用户只想浏览服务时就触发支付。**这不是技术问题，是产品问题**——你的用户（Agent 开发者）会因为 LLM 的误操作而丢钱。

**正确的分解**：
- MCP Server 1：Discovery（只读，安全，LLM 可以随便调）
- MCP Server 2：Payment + Invocation（需要用户显式确认，tool description 里写明"此操作会花费 X USDC，请确认后再调用"）

这跟当前 SDK 的设计逻辑一致：`discoverServices()` 是免费的，`callService()` 是付费的。

### 1.2 MCP tool annotations 能否承载 costHint？

**不能直接做，但有两个可行方案。**

MCP 规范（2025-03-26 版本，TypeScript SDK 1.29.0）定义了 tool annotations，包含以下字段：

```typescript
annotations: {
  destructiveHint?: boolean;   // 是否会破坏数据
  idempotentHint?: boolean;    // 重试是否安全
  openWorldHint?: boolean;     // 是否与外部系统交互
  readOnlyHint?: boolean;      // 是否只读
  title?: string;              // 工具标题（人类可读）
}
```

没有 `costHint` 字段。annotations 是**语义提示**，告诉 LLM 这个 tool 的行为特征，不是元数据容器。

**方案 A（推荐）：在 tool description 文本里写价格**

```typescript
server.tool("pay_and_invoke", {
  description: "付费调用 AI 服务。此操作会在 Monad 链上锁定 USDC 并调用 Provider，"
    + "完成后自动结算。费用：0.01 USDC/次。请在确认需要调用后再使用此工具。",
  inputSchema: { ... }
});
```

这是最简单、最可靠的方式。LLM 会把 description 当作上下文理解。缺点是价格变化时需要更新 description，但这跟现实业务一致——价格变动需要通知用户。

**方案 B：用 `_meta` 字段传自定义元数据**

MCP 工具定义有 `_meta: { [key: string]: unknown }` 字段，可以塞 `costHint`。但这不是标准——LLM 客户端（Claude Desktop、Cursor 等）不会读取 `_meta` 并把它展示给 LLM。`_meta` 的设计目的是给 MCP 客户端（中间件）看的，不是给 LLM 看的。

**结论：costHint 不是"标准扩展"也不是"hack"——它是需要在 tool description 里表达的业务信息。方案 A 是正确做法。**

### 1.3 MCP stdio transport 下如何处理支付信号？

**这是 v5 提案最大的技术难点。**

当前 Gateway 流程依赖 HTTP 402 状态码作为支付信号：
1. Agent POST /invoke → 402 + challenge
2. Agent 锁定 Escrow
3. Agent POST /invoke + requestId → 200 + result

MCP stdio transport 是进程间 JSON-RPC 通信（stdin/stdout），**没有 HTTP 状态码**。你不能发 "402 Payment Required" 给 MCP 客户端——MCP 协议只有正常响应和错误响应。

**可行方案**：

1. **tool 返回结构化错误信息**：`pay_and_invoke` 在首次调用时返回一个包含支付信息的结构化结果（不是 MCP error），让 Agent SDK（调用 MCP 的那层）识别并执行链上操作，然后再次调用同一个 tool 并带上 paymentProof。

   ```
   第一次调用：pay_and_invoke({ serviceId: "text-analysis-v1", params: {...} })
   返回：{ needsPayment: true, requestId: "0x...", hashLock: "0x...", amount: "10000", recipient: "0x...", deadline: 3600 }

   Agent SDK 执行：approve() + escrow.open()

   第二次调用：pay_and_invoke({ serviceId: "text-analysis-v1", params: {...}, paymentProof: { requestId: "0x..." } })
   返回：{ result: "分析结果...", requestId: "0x..." }
   ```

2. **Streamable HTTP transport**：MCP SDK 1.29.0 支持 Streamable HTTP transport（替代旧的 SSE transport）。用 HTTP transport 就可以用 HTTP 402 了——但这意味着 MCP Server 不再是本地进程，而是远程 HTTP 服务，部署架构完全不同。

**商业影响**：方案 1 需要你写一个"Agent SDK 适配层"来编排两步调用。方案 2 需要你部署一个远程 MCP Server。方案 1 的开发量约 3-5 天，方案 2 约 1-2 天但需要额外基础设施。

### 1.4 应该用哪个 MCP SDK？

**TypeScript MCP SDK（`@modelcontextprotocol/sdk`）v1.29.0，这是官方维护的 SDK。**

安装：
```bash
pnpm add @modelcontextprotocol/sdk
```

关键类：
- `McpServer` — 注册 tool/resource/prompt
- `StdioServerTransport` — 本地进程通信
- `StreamableHTTPServerTransport` — 远程 HTTP 服务（推荐用于生产）

代码示例：
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({ name: 'neurostream-discovery', version: '1.0.0' });

server.tool("discover_services", { keyword: z.string() }, async ({ keyword }) => {
  // 调用现有 DiscoveryClient
  const services = await discovery.discoverServices({ keyword });
  return { content: [{ type: "text", text: JSON.stringify(services) }] };
});
```

SDK 成熟度：2025-03-26 规范版本，Anthropic 官方维护，npm 周下载量 >10 万，可用于生产。

---

## 2. x402 Escrow Facilitator 设计

### 2.1 x402 facilitator + escrow 的实际流程

**关键发现：x402 不使用 escrow。它是直接转账。**

x402 的 `exact` EVM scheme 有三种支付方式（优先级：EIP-3009 > Permit2 > ERC-7710）：

1. **EIP-3009**：Client 签名 `transferWithAuthorization`，Facilitator 拿签名上链执行 `transferFrom`。钱**直接**从 Client 钱包转到 `payTo` 地址。没有中间锁定。

2. **Permit2**：Client 签名 `permitWitnessTransferFrom`，`x402ExactPermit2Proxy` 合约（CREATE2 部署，地址 `0x402085c248EeA27D92E8b30b2C58ed07f9E20001`）验证 witness 后执行转账。仍然是**直接转账**。

3. **ERC-7710**：Delegation Manager + 模拟验证。

**x402 的 verify → settle 流程**：
- `/verify`：Facilitator 验证 Client 签名的有效性（off-chain），确认 Client 确实授权了这笔转账
- `/settle`：Facilitator 把签名提交上链，执行 ERC20 转账

**跟你的 HTLC Escrow 的根本区别**：

| 维度 | x402 exact | NeuroStream HTLC Escrow |
|------|-----------|------------------------|
| 资金流向 | 直接 Client → payTo | Client → Escrow 锁定 → claim/refund |
| 交付保证 | **无**（verify 只验证签名有效，不验证内容交付） | **有**（hashLock + deadline：交付后才释放，超时可退款） |
| Facilitator 职责 | 验证签名 + 执行转账 | 你当前没有 facilitator，Gateway 承担类似角色 |
| 失败恢复 | 签名过期 → 重签 | refund() 退款 |

**商业翻译**：x402 是"先付后拿"模式（像在便利店买东西），NeuroStream 是"先锁后验"模式（像淘宝担保交易）。x402 没有交付保证——如果你用了 x402 的 exact scheme，你就失去了你产品最核心的差异化能力。

### 2.2 现有 Escrow.sol 能否作为 x402 的 settlement layer？

**不能直接兼容。原因是结构性的。**

x402 EVM exact scheme 的 settle 需要执行以下操作之一：
- `token.transferWithAuthorization(...)`（EIP-3009）
- `permit2.permitWitnessTransferFrom(...)`（Permit2）
- Delegation Manager 的 execute 操作（ERC-7710）

这些操作都是**直接转账**，不是"锁定 → claim"模式。你的 Escrow.sol 的 `open()` 和 `claim()` 调用签名和 x402 的 `PaymentPayload` 结构完全不同。

要兼容 x402，你需要：
1. 写一个新的 x402 scheme（比如叫 `escrow`），定义新的 `PaymentPayload` 格式包含 `requestId + hashLock + deadline`
2. Facilitator 的 `/verify` 需要验证链上 Escrow 是否已锁定
3. Facilitator 的 `/settle` 需要调用 `Escrow.claim()`（而不是 ERC20 transfer）

**这是可行的——但这是对 x402 协议的扩展，不是使用 x402。** x402 协议支持自定义 scheme，但客户端和 Facilitator 都需要显式支持 `(scheme, network)` 组合。这意味着你需要说服 Agent 的 MCP 客户端（Claude Desktop、Cursor 等）支持你的自定义 escrow scheme——这是极难的生态推广工作。

### 2.3 x402 /verify 和 /settle 与 Escrow claim/refund 的关系

如果你真的要做一个 x402 Escrow Facilitator，流程会是：

```
/verify(PaymentPayload, PaymentRequirements):
  1. 解析 Payload 获取 requestId
  2. 读取链上 Escrow.getPayment(requestId)
  3. 验证 status == Locked(1)
  4. 验证 amount == requirements.amount
  5. 验证 provider == payTo 地址
  6. 返回 { isValid: true } 或 { isValid: false, invalidReason: "..." }

/settle(PaymentPayload, PaymentRequirements):
  1. 调用 Escrow.claim(requestId, preimage)
  2. 等待交易确认
  3. 返回 { success: true, transaction: txHash, network: "eip155:10143" }
```

但问题是：**preimage 从哪来？**

当前流程中，preimage 是 Gateway 生成的，在 `gateway_challenges` 表里存着。在 x402 流程中，Facilitator 的 `/settle` 需要拿到 preimage 才能 claim。这意味着要么：
- Facilitator 自己生成 preimage（你当前 Gateway 的做法）
- Provider 提供 preimage（Legacy 直连模式的做法）

如果 Facilitator 生成 preimage，那 Facilitator 就变成了你当前的 Gateway——只是换了个名字和 HTTP header 格式。

### 2.4 Monad 是否支持 x402 EVM scheme？

**EVM 兼容性没问题，但生态支持有差距。**

Monad 是 EVM 等效链（chain ID 10143）。x402 的 EVM exact scheme 只依赖标准 ERC20 + EIP-3009/Permit2，这些在 Monad 上都能运行。

但关键问题是：

1. **Permit2 合约**：x402 的 `x402ExactPermit2Proxy` 使用 CREATE2 部署到固定地址 `0x402085c248EeA27D92E8b30b2C58ed07f9E20001`。这个地址在 Ethereum、Base、Arbitrum 等主流链上都已经部署。Monad 上是否已经部署？**大概率没有**——x402 是 Coinbase 的项目，优先支持 Base 链，Monad 是第三方链。

2. **EIP-3009 支持**：你的 MockERC20 不支持 `transferWithAuthorization`。需要换成支持 EIP-3009 的 token（比如 USDC 本身就支持）。

3. **x402 Bazaar 扩展的 MCP 支持**：x402 已经有一个 `bazaar` 扩展包含 MCP 集成（`@x402/extensions` 包里的 `bazaar/mcp/` 模块）。但这个模块目前只做 discovery（服务发现），不做支付+调用编排。

**商业翻译**：在 Monad 上用 x402 需要你自己部署 Permit2 合约 + x402ExactPermit2Proxy 合约 + 换支付 token。这不是"开箱即用"，而是"自己搭建整个基础设施"。在 Base 链上这一切都是现成的。

---

## 3. 状态机适配

### 3.1 当前 9 状态 → 新状态的映射

当前状态机（`state-machine.ts` 567 行）：

```
CREATED → ESCROW_LOCKED → PROVIDER_CALLED → RESULT_STORED → CLAIMED → COMPLETED
    ↓          ↓               ↓                ↓
  FAILED    REFUNDABLE      REFUNDABLE       REFUNDABLE
                                           REFUNDED ← REFUNDABLE
```

v5 提案的新状态：

```
CREATED → ESCROW_OPENED → INVOKED → RESULT_STORED → SETTLED → COMPLETED
```

**映射关系**：

| 当前状态 | v5 新状态 | 变化说明 |
|---------|----------|---------|
| CREATED | CREATED | 无变化 |
| ESCROW_LOCKED | ESCROW_OPENED | 仅名称变化（Locked → Opened），逻辑相同 |
| PROVIDER_CALLED | INVOKED | 合并了"标记调用开始"和"执行调用"，减少中间状态 |
| RESULT_STORED | RESULT_STORED | 无变化 |
| CLAIMED | SETTLED | 语义变化：链上 claim 变成"结算"概念 |
| COMPLETED | COMPLETED | 无变化 |
| FAILED | 保留 | 未在 v5 提案中提及，但必须有 |
| REFUNDABLE | 需要保留 | v5 未提及退款路径——这是严重遗漏 |
| REFUNDED | 需要保留 | 同上 |

**问题**：v5 提案删除了 REFUNDABLE 和 REFUNDED 状态，但没有提供替代的退款机制。x402 的 exact scheme 没有退款能力（直接转账不可逆）。如果用 HTLC Escrow，退款路径必须保留。

**建议**：保持 9 状态不变，只做名称微调（ESCROW_LOCKED → ESCROW_OPENED, CLAIMED → SETTLED）。删除 REFUNDABLE/REFUNDED 会导致资金安全问题。

### 3.2 MCP 模式下的新故障模式

HTTP 模式下不存在但 MCP 模式下存在的故障：

| 新故障模式 | 描述 | 严重度 |
|-----------|------|--------|
| **MCP 连接断开** | Agent 的 MCP 客户端进程崩溃或网络中断，当前 tool 调用丢失 | 高 |
| **LLM 误触付费 tool** | LLM 在不需要时调用 `pay_and_invoke`，花真钱 | 高（商业风险） |
| **tool 调用超时** | MCP stdio 没有 HTTP timeout，Agent 可能一直等待 | 中 |
| **MCP 客户端不支持二次调用** | 部分 MCP 客户端可能不支持同一 tool 的两步调用模式 | 中 |
| **并发 tool 调用** | LLM 可能并发调用多个付费 tool，导致多个 Escrow 同时锁定 | 中 |

**商业影响**：LLM 误触付费 tool 是最严重的风险。每一次误触 = 0.01 USDC 锁定 + 1 小时等待退款。如果 Agent 误触 10 次，就是 0.10 USDC 锁定 1 小时。对于生产环境，这需要**tool 前置确认机制**——MCP 客户端需要在调用付费 tool 前询问用户确认。

### 3.3 MCP 连接断开时的恢复

当前恢复机制：`setInterval` 每 30 秒扫描 `gateway_challenges` 表，推进卡住的请求。

MCP 模式下，恢复机制**仍然有效**——因为状态是写在 Supabase 里的，不是写在 MCP 连接里的。MCP 连接断了不影响 DB 状态。

但有一个新问题：**Agent 如何知道恢复结果？**

HTTP 模式下，Agent 可以 poll `/api/gateway/status`。MCP 模式下，Agent 重新连接 MCP Server 后，需要调用 `check_status` tool 来查询之前断开的请求状态。

**建议**：保留现有恢复任务，新增 `check_status` tool 作为查询接口。

### 3.4 乐观锁是否仍然适用？

**适用。** 乐观锁（`WHERE status = expected`）是在 Supabase PostgreSQL 层面做的，跟 MCP 还是 HTTP 没有关系。只要状态转换仍然在 DB 里执行，乐观锁就是正确的并发控制机制。

唯一需要注意的是：MCP tool 调用可能比 HTTP 请求更并发（LLM 可以同时调用多个 tool）。这要求乐观锁的 `fromStatus` 必须精确匹配当前 DB 状态——当前的实现已经做到了。

---

## 4. 技术风险

### 4.1 MCP 规范变化风险

**风险等级：中等**

当前 MCP 规范版本是 2025-03-26。SDK 版本 1.29.0。 Anthropic 是 MCP 的主要推动者，规范正在快速迭代。

可能的破坏性变化：
- Tool annotations 增加/删除字段（影响你的 costHint 方案）
- Transport 协议变化（stdio → Streamable HTTP 迁移）
- 新的 capability negotiation 机制（需要更新 Server 声明）

**缓解措施**：
- 使用 `McpServer` 高级 API（而不是底层 `Server` 类），高级 API 会自动处理协议细节
- 把 MCP 相关代码隔离在独立包里（`packages/mcp-server`），不与核心支付逻辑耦合
- 关注 MCP 规范更新，每季度评估一次

**商业翻译**：如果 MCP 大改，你需要 2-3 天适配。这不是"重构整个系统"级别的风险。

### 4.2 x402 规范变化风险

**风险等级：高**

x402 是 Coinbase 的新项目（GitHub 75 stars，2026-05-12 最后更新）。仍在快速演进：
- `bazaar` MCP 扩展刚出现（可能未来版本会做支付+调用编排）
- EVM scheme 可能增加 `upto` scheme（按用量计费）
- 未来可能增加 escrow scheme（正好是你想做的）

**如果你的 v5 实现基于 x402 自定义 escrow scheme，而 x402 v2 官方加了 escrow scheme，你的自定义 scheme 就变成重复劳动。**

**商业翻译**：现在花 3 周做 x402 escrow facilitator，半年后 x402 可能自己就有了。这不是技术风险，是**机会成本**。

### 4.3 Monad 部署/稳定性风险

**风险等级：中等**

Monad Testnet（chain ID 10143）：
- 2024 年底开始测试网
- 尚未主网上线
- RPC URL：`https://testnet-rpc.monad.xyz/`
- 未见重大宕机报告，但测试网稳定性无法保证

你的 Escrow.sol 在 Monad 上的部署已经验证过（当前 v3/v4 版本就是 Monad testnet）。合约本身没问题。

风险点：
- Monad 主网上线时间未定——你的产品可能在测试网上跑很久
- Monad 生态工具（区块浏览器、水龙头、SDK）不如 Base/以太坊成熟
- Gas 费模型：Monad 使用 MON 作为 gas token，测试网免费，主网费用未知

### 4.4 Monad 上的 Gas 成本

Escrow 操作的 Gas 估算（基于 EVM 标准）：

| 操作 | 预估 Gas | 说明 |
|------|---------|------|
| `approve()` | ~46,000 | ERC20 approve，一次性（后续可复用 allowance） |
| `open()` | ~80,000-100,000 | 存储 Payment struct + safeTransferFrom |
| `claim()` | ~60,000-80,000 | 状态更新 + 2笔 safeTransfer（fee + provider） |
| `refund()` | ~40,000-60,000 | 状态更新 + 1笔 safeTransfer |

Monad 声称并行 EVM 执行，可能降低 Gas。但测试网上 Gas 是免费的（MON 测试币无限获取）。主网 Gas 价格取决于 Monad 的 Gas 定价机制——目前没有公开信息。

**商业翻译**：每次 Agent 调用服务，链上操作需要 approve(~46K gas) + open(~100K gas) = ~146K gas。如果 MON 价格 = $0.01，gas price = 1 gwei，那每次调用的 gas 成本 ≈ $0.0015。这比服务本身的价格（0.01 USDC）低很多，可以接受。

---

## 5. 实现时间估算

### 5.1 各组件开发时间

| 组件 | 预估时间 | 说明 |
|------|---------|------|
| MCP Discovery Server | 3-5 天 | 注册 discover_services tool，调用现有 DiscoveryClient |
| MCP Payment+Invoke Server | 5-8 天 | 两步调用编排（challenge → pay → invoke），处理 MCP stdio 下的支付信号 |
| x402 Escrow Facilitator | 10-15 天 | 自定义 scheme 实现（verify + settle），部署 Permit2 + Proxy 合约到 Monad，适配 x402 core 类型 |
| 状态机适配 | 2-3 天 | 名称微调 + 新增 MCP 相关的故障状态 |
| x402 → Escrow 桥接 | 5-7 天 | 将 x402 PaymentPayload 转换为 HTLC Escrow 参数，处理 preimage 生成/存储 |
| 测试 | 5-7 天 | MCP 集成测试、x402 协议测试、状态机回归测试、端到端测试 |
| 部署 | 2-3 天 | Monad 合约部署、MCP Server 部署、环境配置 |

**总计：32-50 天（约 5-7 周）**

### 5.2 最小可行版本（MVP）

**MVP 应该是：MCP Discovery Server + 现有 Gateway，不做 x402。**

理由：
1. MCP Discovery Server 可以立即让 Agent（通过 Claude Desktop、Cursor 等）发现你的服务——这是新用户获取渠道
2. 现有 Gateway + HTLC Escrow 已经完成支付闭环，不需要 x402
3. Agent 通过 MCP 发现服务后，用现有 SDK `callService()` 完成付费调用——两步分离，LLM 不会误触付费操作
4. x402 是未来扩展点，不是 MVP 必需品

MVP 开发时间：3-5 天（只做 MCP Discovery Server）。

### 5.3 阻塞依赖

| 依赖项 | 状态 | 影响 |
|--------|------|------|
| MCP TypeScript SDK 1.29.0 | 已发布，可用 | 无阻塞 |
| Monad Testnet | 运行中，可用 | 无阻塞（但主网未上线） |
| x402 spec 稳定性 | 活跃开发中 | 如果做 x402 facilitator → 需要跟进规范变化 |
| x402 Permit2 合约在 Monad | 未部署 | 需要自己部署（1-2 天额外工作） |
| MCP 客户端支持付费确认 | Claude Desktop 支持 elicitation（用户确认）| 部分客户端可能不支持 |

---

## 6. 架构决策

### 6.1 MCP Server 和 x402 Facilitator 是否在同一进程？

**不应该。**

理由：
- MCP Server 是**面向 LLM 的接口**（tool/resource/prompt），需要处理 JSON-RPC、capability negotiation
- x402 Facilitator 是**面向 HTTP 的接口**（/verify、/settle），需要处理 EIP-712 签名验证、链上交易
- 两者通信协议不同、生命周期不同、错误处理模式不同
- 合在一起意味着 MCP Server crash 会影响 Facilitator，反之亦然

**如果做 x402 Facilitator，应该作为独立 HTTP 服务部署**（Express/Fastify），跟 MCP Server 分离。

但更好的选择是：**不做 x402 Facilitator**，保持当前 Gateway API Route 的架构，只加 MCP Server 作为新接口层。

### 6.2 状态机留在 Next.js API Route 还是独立服务？

**留在 Next.js API Route（当前做法）是正确的。**

理由：
- 状态机逻辑（567 行）已经稳定运行
- Supabase 客户端 + Viem 链上交互 + 恢复任务都已经在 Next.js 进程里
- 拆出来需要额外部署一个 Node.js 服务（增加运维成本）
- 对 hackathon 项目来说，Next.js API Route 是最简单的部署方式（Vercel 一键部署）

如果未来流量增长（>1000 req/min），可以考虑把 Gateway 拆成独立 Express 服务。但当前没有这个需求。

### 6.3 MCP Server 运行在哪里？

**应该作为独立进程（`packages/mcp-server`），不在 Next.js 里。**

理由：
- MCP stdio transport 需要被 MCP 客户端（Claude Desktop 等）作为子进程启动
- MCP Streamable HTTP transport 需要独立 HTTP 服务器
- Next.js 不适合作为 MCP Server 容器——Next.js 是 Web 框架，不是 JSON-RPC 服务框架

部署方式：
- stdio 模式：`npx neurostream-mcp` 作为 MCP 客户端的子进程（本地开发用）
- HTTP 模式：独立 Express 服务器，部署到 Vercel / Railway / 云服务器

### 6.4 Provider 服务注册方式

**保持当前 Supabase services 表，不切换到 MCP resource discovery。**

理由：
- 当前注册方式：Provider 登录 → 前端注册 → Supabase services 表。这个流程已经可用
- MCP resource discovery 是给 MCP 客户端发现 MCP Server 提供的资源（documents、data），不是用来注册第三方 HTTP API 的
- 你的 service 注册需要 pricingAmount + recipient（钱包地址）+ endpoint——这些都是业务数据，不是 MCP resource 的概念

MCP Server 的 `discover_services` tool 应该**查询 Supabase services 表**，而不是依赖 MCP resource 机制。

---

## 7. 什么被丢弃 vs. 什么被保留

### 7.1 文件级评估

| 文件 | 行数 | 处置 | 说明 |
|------|------|------|------|
| `contracts/Escrow.sol` | 184 | **保留** | HTLC Escrow 是核心，不需要改 |
| `contracts/MockERC20.sol` | 26 | **保留** | 测试用 token |
| `contracts/test/Escrow.test.ts` | 525 | **保留** | 18 个测试全部保留 |
| `contracts/scripts/deploy.ts` | ? | **保留** | 部署逻辑不变 |
| `sdk/src/escrow.ts` | 244 | **保留** | EscrowClient 继续被 MCP 适配层使用 |
| `sdk/src/crypto.ts` | 64 | **保留** | AES-256-GCM + keccak256，加密模块仍然需要 |
| `sdk/src/abi.ts` | 248 | **保留** | ABI 定义不变 |
| `sdk/src/types.ts` | 92 | **保留+扩展** | 增加 MCP 相关类型 |
| `sdk/src/discovery.ts` | 104 | **保留** | DiscoveryClient 被 MCP Discovery Server 调用 |
| `sdk/src/metrics.ts` | 41 | **保留** | MetricsReporter 继续工作 |
| `sdk/src/client.ts` | 331 | **保留+重写部分** | `invokeViaGateway` 和 `invokeService` 需要 MCP 适配 |
| `sdk/src/index.ts` | 41 | **保留+扩展** | 导出 MCP 相关类 |
| `gateway/state-machine.ts` | 567 | **保留** | 9 状态机不变，MCP Server 调用其中函数 |
| `gateway/invoke/route.ts` | 257 | **保留** | HTTP Gateway 继续作为 Agent SDK 的入口 |
| `gateway/status/route.ts` | 79 | **保留** | 状态查询继续工作 |
| `frontend/*` | 3517 | **保留** | 前端页面不需要改 |
| `provider/src/app.ts` | 18 | **保留** | Provider HTTP API 不变 |
| `agent/src/*.ts` | 470 | **部分重写** | Agent 需要从 SDK 直接调用改为 MCP 客户端调用 |
| `indexer/src/*.ts` | 316 | **保留** | 链上事件索引不变 |
| `e2e/full-flow.test.ts` | 236 | **重写** | E2E 测试需要适配 MCP 流程 |
| `sdk/test/*.ts` | 334 | **保留+扩展** | 增加 MCP 相关测试 |

### 7.2 新增文件

| 新文件 | 预估行数 | 说明 |
|--------|---------|------|
| `packages/mcp-server/src/index.ts` | ~80 | MCP Server 入口，创建 McpServer + transport |
| `packages/mcp-server/src/tools/discovery.ts` | ~60 | discover_services tool 定义 |
| `packages/mcp-server/src/tools/payment.ts` | ~150 | pay_and_invoke tool 定义（两步调用编排） |
| `packages/mcp-server/src/tools/status.ts` | ~40 | check_status tool 定义 |
| `packages/mcp-server/src/adapter/gateway.ts` | ~100 | MCP → Gateway API 适配层 |
| `packages/mcp-server/src/adapter/escrow.ts` | ~80 | MCP → EscrowClient 适配层 |
| `packages/mcp-server/test/*.ts` | ~200 | MCP Server 测试 |
| `packages/mcp-server/package.json` | ~30 | 包定义 |

**新增代码量：~760 行**

### 7.3 重写/丢弃量

| 丢弃/重写 | 行数 | 说明 |
|-----------|------|------|
| `agent/src/neurostream.ts` | 70 | 从 SDK 直接调用改为 MCP 客户端调用 |
| `agent/src/index.ts` | 165 | Agent 交互逻辑重写 |
| `agent/src/ui.ts` | 62 | UI 改为 MCP 模式 |
| `e2e/full-flow.test.ts` | 236 | E2E 测试重写 |
| **如果做 x402 facilitator** | ~800-1000 | 新增整个 facilitator 包 |

**丢弃/重写量：~533 行（不含 x402）。含 x402：~1533 行。**

### 7.4 测试迁移计划

| 测试类别 | 当前数量 | 迁移策略 |
|---------|---------|---------|
| Escrow 合约测试 | 18 | 不迁移，保留原样 |
| SDK EscrowClient 测试 | ~8 | 不迁移，保留原样 |
| SDK crypto 测试 | ~6 | 不迁移，保留原样 |
| SDK discovery 测试 | ~2 | 不迁移，保留原样 |
| SDK gateway 测试 | ~4 | 保留 + 增加 MCP 调用路径测试 |
| SDK metrics 测试 | ~2 | 不迁移，保留原样 |
| Provider 测试 | 6 | 不迁移，保留原样 |
| Indexer 测试 | 7 | 不迁移，保留原样 |
| E2E 测试 | 1 | **重写**：改为 MCP 客户端 → MCP Server → Gateway → Provider 全链路 |
| MCP Server 测试 | 0 | **新增**：tool 定义测试、适配层测试 |

**新增测试量：~15-20 个。重写测试量：1 个。保留测试量：45 个。**

---

## 8. 替代技术方案

### 8.1 MCP Proxy 方案（包装现有 HTTP 服务）

**这是比 v5 提案更优的方案。**

方案描述：
- MCP Proxy Server 注册 3 个 tool
- `discover_services` → 调用 Supabase Edge Function `services`
- `pay_and_invoke` → 两步编排：先 POST Gateway /invoke → 拿 402 challenge → Agent SDK 执行 Escrow → 再 POST Gateway /invoke + requestId
- `check_status` → GET Gateway /status

**优势**：
1. **零重写**：现有 Gateway、Escrow、State Machine 全部保留
2. **3-5 天完成**：只需要写 MCP tool 定义 + 适配层
3. **MCP 和 HTTP 双入口**：Agent 可以通过 MCP 或 HTTP SDK 两种方式调用
4. **LLM 安全**：Discovery tool 是只读的，付费 tool 需要两步确认

**劣势**：
1. 两步调用编排需要 MCP 客户端支持中间步骤（不是所有客户端都支持）
2. Agent SDK 仍然需要钱包私钥来执行链上操作

**商业翻译**：这个方案是"在现有房子上加盖一层"，而不是"拆了房子重新盖"。成本是 3-5 天 vs 5-7 周，风险是零 vs 高。

### 8.2 直接 Escrow SDK 调用（不用 x402）

**这也是比 v5 提案更优的方案。**

方案描述：
- MCP Server 的 `pay_and_invoke` tool 内部直接调用现有 SDK 的 `NeuroStream.callService()`
- MCP Server 进程持有 Agent 的私钥（通过环境变量传入）
- 调用路径：MCP tool → SDK callService → Gateway HTTP → Provider → Escrow claim

**优势**：
1. **完全复用现有代码**：SDK client.ts 331 行全部复用
2. **2-3 天完成**：MCP tool 只需要调用 SDK 方法
3. **交付保证不变**：HTLC Escrow 机制完整保留

**劣势**：
1. MCP Server 进程需要持有私钥——安全性需要关注（环境变量传入，不硬编码）
2. MCP Server 是长期运行进程（不像 HTTP 请求生命周期），私钥泄露风险更高

**缓解措施**：
- 私钥通过 MCP 客户端配置传入（`NEUROSTREAM_PRIVATE_KEY` 环境变量）
- MCP Server 进程运行在用户本地机器上（不是远程服务器），私钥不离开用户设备
- 这是 MCP stdio transport 的标准安全模型

### 8.3 用 Base 代替 Monad

**从 x402 兼容性角度看，Base 更好。从产品角度看，要看你的目标用户。**

| 维度 | Monad | Base |
|------|-------|------|
| x402 生态支持 | 无（需自己部署所有合约） | 完整（Permit2、Proxy 已部署） |
| EVM 兼容性 | 等效 | 等效（L2 OP Stack） |
| Gas 成本 | 未知（主网未上线） | ~$0.001/transaction（L2 低 gas） |
| 链稳定性 | 测试网 | 主网稳定运行 |
| 社区规模 | 小 | 大（Coinbase 支持） |
| 独特性 | 高（并行 EVM，新链） | 低（跟很多项目一样在 Base 上） |

**商业翻译**：
- 如果你的产品卖点是"在 Monad 这条新链上的 HTLC Escrow 支付协议"——Monad 是你的差异化，别换
- 如果你的产品卖点是"Agent 自动付费调用服务"——Base 更好，因为 x402 在 Base 上零成本集成
- 如果你的产品卖点是"MCP 上的付费 tool 市场"——Base + x402 的生态优势最大

---

## 9. 最终建议

### 9.1 推荐：分步演进而非全面重写

| 步骤 | 时间 | 内容 | 依赖 |
|------|------|------|------|
| Phase 1 | 3-5 天 | MCP Discovery Server（只读，安全） | MCP SDK |
| Phase 2 | 5-8 天 | MCP Payment+Invoke Server（两步编排，直接调用现有 SDK/Gateway） | Phase 1 |
| Phase 3 | 2-3 天 | 状态机微调 + MCP 故障状态 | Phase 2 |
| Phase 4 | 可选，未来 | x402 Facilitator（如果 Coinbase 不自己加 escrow scheme） | Phase 2 稳定后 |

Phase 1+2+3 总计：10-16 天（约 2 周）。对比 v5 全量重写：5-7 周。

### 9.2 不推荐的做法

1. **不要现在做 x402 Escrow Facilitator**——x402 正在快速迭代，半年后可能官方支持 escrow。现在做是浪费 2-3 周时间。
2. **不要把 Gateway 从 Next.js API Route 拆出来**——当前架构稳定，拆出来增加运维复杂度，没有收益。
3. **不要删掉 REFUNDABLE/REFUNDED 状态**——退款路径是 HTLC Escrow 的核心保证，删掉会导致资金安全问题。
4. **不要把 MCP Server 放在 Next.js 里**——MCP Server 需要独立进程，Next.js 不是 MCP 容器。

### 9.3 如果一定要做 v5（x402 + MCP 全量重写）

最低风险路径：
1. 先完成 Phase 1-3（MCP + 现有 Gateway）
2. 在 Phase 3 稳定后，评估 x402 生态进展
3. 如果 x402 还没有 escrow scheme，再考虑做自定义 facilitator
4. facilitator 部署在 Base 链上（不是 Monad），利用现成的 Permit2 + Proxy 合约

但这条路径的总时间是 5-7 周，且 x402 facilitator 部分的 2-3 周可能因为 x402 规范变化而白费。

---

## 附录 A：关键数字汇总

| 指标 | 数值 |
|------|------|
| 当前代码总量（不含前端） | ~5,100 行 |
| 前端代码量 | ~3,517 行 |
| 可复用代码比例 | 60-70%（~3,500 行） |
| 需重写代码量 | ~533 行（不含 x402） |
| x402 facilitator 新增代码量 | ~800-1,000 行 |
| MCP Server 新增代码量 | ~760 行 |
| 当前测试总量 | 68 个 |
| 保留测试量 | 45 个 |
| 新增测试量 | 15-20 个 |
| Phase 1-3 总时间 | 10-16 天 |
| v5 全量重写时间 | 32-50 天 |
| MCP SDK 版本 | 1.29.0 |
| x402 GitHub stars | 75 |
| Monad chain ID | 10143 |