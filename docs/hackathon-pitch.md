# NeuroStream — AI Agent 的淘宝担保交易

## 问题

AI agent 调用付费服务时，有一个没人解决的根本问题：**付了钱，拿不到结果怎么办？**

现有的支付方案（x402、Stripe）都是"先付后拿"模式 — 付了钱，祈祷服务能返回结果。如果服务宕机、返回垃圾数据、或者恶意不响应，agent 的钱就丢了。没有退款机制，没有追回渠道。

对 $0.01 的微调用，丢了无所谓。但对 $2、$10、$100 的专业服务调用，一次失败就是真实的财务损失。

## 方案

NeuroStream 用区块链上的 **HTLC Escrow（哈希时间锁定合约）** 强制绑定"资金释放"和"内容交付"：

1. **锁定** — Agent 把钱锁在 Escrow 合约里，不直接发给 Provider
2. **交付** — Provider 只有实际交付结果才能解锁拿钱（通过哈希锁 reveal）
3. **退款** — 如果 Provider 超时不交付，Agent 自动拿回全部退款

就像淘宝担保交易：买家付款 → 钱暂存在平台 → 确认收货后才打给卖家 → 不确认则自动退款。

## 差异化

| | x402 (Coinbase) | Nevermined | **NeuroStream** |
|---|---|---|---|
| 交付保障 | 无（付后不管） | 无（付后不管） | **HTLC Escrow 保证** |
| 退款机制 | 无 | 无 | **超时自动退款** |
| 链上凭证 | 部分 | 部分 | **完整 Escrow 事件** |
| 成本发现 | 事后才知道价格 | 事后计费 | **Tool 描述含价格** |
| 协议入口 | HTTP only | HTTP + MCP | **MCP Server (原生)** |

**一句话：x402 管支付，NeuroStream 管交付保障。我们是 x402 缺的那一块。**

## Demo

通过 MCP 接口演示完整流程：

1. `discover_services` — 发现可用 AI 服务（免费，零成本浏览）
2. `pay_and_invoke` — 付费调用 $2 USDC/次的专业文本分析服务
   - Escrow 自动锁定 $2
   - Provider 返回分析结果
   - Escrow 自动释放资金给 Provider
3. 如果 Provider 不响应 → 1小时后自动退款

任何 MCP 兼容的 agent（Claude Desktop、Cursor、VS Code）都能直接发现和调用我们的服务。

## 技术

- **Escrow 合约**: Solidity 0.8.24, ERC20 (USDC), HTLC + 平台分账
- **9 状态机**: CREATED → ESCROW_LOCKED → PROVIDER_CALLED → RESULT_STORED → CLAIMED → COMPLETED，带 REFUNDABLE 分支
- **崩溃恢复**: 每30秒扫描卡住请求，自动推进或退款
- **MCP Server**: discover_services + pay_and_invoke + check_status 三个 tool
- **链**: Monad testnet (并行 EVM)