# NeuroStream MVP 实施计划

## 项目概述
- **目标**：完成 Agent-native 付费与结算协议层的完整端到端演示
- **核心流程**：Agent → Escrow Lock → Provider (ciphertext) → Claim → Decrypt
- **开发范式**：TDD（Test-Driven Development）— 先写测试，再写实现
- **配置管理**：所有环境变量通过 `.env` / `.env.local` 管理，代码中通过 `process.env` 引用

## 技术选型确认
| 组件 | 技术 | 备注 |
|------|------|------|
| 链 | Monad Testnet | 需配置 RPC/Faucet |
| 合约 | Hardhat + Solidity | Escrow.sol |
| 索引 | viem + Supabase 轮询索引器 | 索引链上事件至 PostgreSQL |
| 后端 | Supabase | Edge Functions + PostgreSQL |
| 前端 | Next.js + Wagmi + Viem + shadcn/ui | 3个页面 |
| 身份/钱包 | Privy | Provider email 登录 + 嵌入式钱包 |
| SDK | TypeScript | npm 包 |
| 加密 | AES-256-GCM + keccak256 | hashLock 验证 |
| Provider | 简单 API | 如字符串长度服务 |

## 核心流程（闭环设计）

```
1. Agent → Provider: invoke(serviceId)
2. Provider → Agent: 402 + price + hashLock H
3. Agent → Escrow: open(requestId, provider, amount, H, deadline)
4. Agent → Provider: invoke(serviceId, params, requestId)
5. Provider → Agent: ciphertext C（不返回 preimage）
6. Provider → Escrow: claim(requestId, preimage k) ← Provider 通过 Privy 嵌入式钱包自动签名
7. Escrow → Provider: 释放资金 + 事件公开 preimage
8. Agent 从链上事件获取 preimage k → decrypt(C, k) → 明文
```

**闭环保证**：preimage 只有 Provider claim 后才在链上公开。Agent 必须等 Provider claim 才能解密。

## 用户角色与钱包功能

### 统一用户体系
- **所有用户统一使用 Privy 登录**（email/Google/钱包）
- 同一个用户可以**同时是** Provider 和 Agent 开发者
- 在不同面板（Provider / Agent）执行不同操作

### 作为 Agent 开发者
- **登录**：Privy 登录 → 获得嵌入式钱包
- **充值**：向 Privy 钱包充值 ETH（用于调用服务 + gas）
- **导出私钥**：从 DApp 导出 Privy 钱包私钥
- **开发 Agent**：在本地用 OpenAI SDK / Claude SDK 等开发 AI 程序
- **集成 SDK**：将 NeuroStream SDK 集成到 Agent 代码，配置导出的私钥
- **运行 Agent**：Agent 运行时 SDK 自动发现/付费/调用服务
- **查看历史**：在 DApp 查看调用记录、余额、账单

### 作为 Provider
- **登录**：Privy 登录（同一账户）
- **充值 Gas**：向 Privy 钱包充值少量 ETH（用于 claim gas）
- **注册服务**：填写服务信息，关联 Privy 钱包地址
- **收取服务费**：调用 claim() → 服务费到账（全额，无平台手续费）
- **提现**：将 Privy 钱包余额转出到外部钱包

### Agent 本地开发流程
```
1. 开发者在 DApp 登录 → 获得 Privy 钱包 → 充值 → 导出私钥
2. 开发者在本地开发 Agent 程序（使用任意 AI SDK）
3. 开发者集成 NeuroStream SDK，配置私钥到 .env
4. Agent 运行时，SDK 自动：
   ├── 发现服务（调用 /services API，按 quality_score 排序）
   ├── 付费（Escrow.open()，使用私钥签名）
   ├── 获取 ciphertext（等待 Provider claim）
   ├── 从链上事件获取 preimage
   └── 解密得到结果
5. 开发者在 DApp 上查看 Agent 的调用记录和余额
```

### 费用结构
| 费用 | 由谁支付 |
|------|----------|
| 服务费 | Agent 开发者（通过 SDK 签名） |
| open() gas | Agent 开发者 |
| claim() gas | Provider（需自行充值 gas 到 Privy 钱包）|
| 平台手续费 | **无** |

## 开发范式：TDD

每个功能模块严格按照以下循环开发：

```
1. RED   — 编写失败的测试（定义预期行为）
2. GREEN — 编写最少代码使测试通过
3. REFACTOR — 重构代码，保持测试通过
4. COMMIT — 提交
```

**原则**：
- 不写任何没有测试覆盖的生产代码
- 测试先于实现，测试定义接口和行为
- 每个 RED→GREEN→REFACTOR 循环后 commit

## 环境变量管理

所有配置统一在项目根目录和各 package 的 `.env` / `.env.local` 文件中定义。
开发时创建 `.env.example` 模板，用户自行填入实际值。

### 根目录 `.env.example`
```env
# Monad Testnet
MONAD_RPC_URL=
DEPLOYER_PRIVATE_KEY=
ESCROW_CONTRACT_ADDRESS=

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# Provider Service
PROVIDER_PORT=3001

# Privy
PRIVY_APP_ID=
PRIVY_APP_SECRET=
```

### `apps/frontend/.env.local`
```env
NEXT_PUBLIC_MONAD_RPC_URL=
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_PRIVY_APP_ID=
```

---

## 阶段划分（按优先级）

### 阶段 0：Git 重置与项目清理
**目标**：删除当前 git 历史，干净起步

- [x] **将本计划复制到 `memory-bank/implementation-plan.md`**
- [x] 删除 `.git` 目录：`rm -rf .git`
- [ ] 清理不需要的旧文件（保留 memory-bank/ 和 CLAUDE.md）
- [ ] 重新 `git init`
- [ ] 创建 `.gitignore`（node_modules、.env、.env.local、dist、.next、artifacts、cache、coverage 等）
- [ ] 创建 `.env.example` 模板（列出所有需要的环境变量，值为空）
- [ ] 初始提交

**验证**：`git log` 只有一条初始提交

**Commit**: `chore: initial project setup with planning docs and env template`

---

### 阶段 1：基础设施搭建
**目标**：Monorepo 初始化 + 开发环境配置

- [ ] 创建 Turborepo 项目结构
- [ ] 配置 packages/contracts、packages/sdk、apps/frontend、apps/provider
- [ ] 配置 TypeScript、ESLint、Prettier
- [ ] 各 package 的 `.env.example` 模板

**验证**：`pnpm install` 成功，各 package 可独立运行

**Commit**: `feat: initialize monorepo with turborepo structure`

---

### 阶段 2：Escrow 智能合约（TDD）
**目标**：完成 Escrow 合约开发与部署

#### TDD 循环 1：open() 函数
- [ ] **RED**: 编写 `open()` 测试 — 验证锁定资金、事件触发、参数校验
- [ ] **GREEN**: 实现 `open()` 函数使测试通过
- [ ] **REFACTOR**: 优化代码
- [ ] **Commit**: `feat(contracts): add Escrow.open() with payment locking`

#### TDD 循环 2：claim() 函数
- [ ] **RED**: 编写 `claim()` 测试 — 验证 hashLock 匹配、资金释放、事件触发
- [ ] **GREEN**: 实现 `claim()` 函数
- [ ] **REFACTOR**: 优化
- [ ] **Commit**: `feat(contracts): add Escrow.claim() with hashlock verification`

#### TDD 循环 3：refund() 函数
- [ ] **RED**: 编写 `refund()` 测试 — 验证超时退款、deadline 校验
- [ ] **GREEN**: 实现 `refund()` 函数
- [ ] **REFACTOR**: 优化
- [ ] **Commit**: `feat(contracts): add Escrow.refund() with deadline enforcement`

#### TDD 循环 4：边界条件
- [ ] **RED**: 编写边界测试 — 重复 requestId、非法 preimage、已 claim 后再 refund
- [ ] **GREEN**: 添加防护逻辑
- [ ] **Commit**: `test(contracts): add edge case tests for Escrow`

#### 部署
- [ ] 部署脚本（从 `.env` 读取 RPC_URL 和 DEPLOYER_PRIVATE_KEY）
- [ ] **Commit**: `deploy(contracts): add deployment script for Monad testnet`

**关键文件**：
- `packages/contracts/contracts/Escrow.sol`
- `packages/contracts/test/Escrow.test.ts`
- `packages/contracts/hardhat.config.ts`（从 `.env` 读取配置）

---

### 阶段 3：TypeScript SDK（TDD）
**目标**：Agent 开发者可集成到本地 AI 程序的 SDK

**SDK 使用方式**：
```typescript
import { NeuroStream } from '@neurostream/sdk';

const client = new NeuroStream({
  privateKey: process.env.NEUROSTREAM_PRIVATE_KEY, // 从 DApp 导出的私钥
  rpcUrl: process.env.MONAD_RPC_URL,
  escrowAddress: process.env.ESCROW_CONTRACT_ADDRESS,
});

// 发现服务
const services = await client.discoverServices({ type: 'summarize' });

// 调用服务（自动付费 + 等待结果）
const result = await client.invokeService(services[0].id, {
  text: 'Hello world',
});
```

#### TDD 循环 1：加密工具
- [ ] **RED**: 编写 crypto 测试 — generateKey、computeHashLock、encrypt/decrypt 往返测试
- [ ] **GREEN**: 实现 `crypto.ts`（AES-256-GCM + keccak256）
- [ ] **Commit**: `feat(sdk): add AES-256-GCM crypto utilities with tests`

#### TDD 循环 2：EscrowClient
- [ ] **RED**: 编写 EscrowClient 测试（使用 mock provider/contract）
- [ ] **GREEN**: 实现 EscrowClient — open/claim/refund/getPayment（使用私钥签名）
- [ ] **Commit**: `feat(sdk): add EscrowClient with contract interaction`

#### TDD 循环 3：服务发现
- [ ] **RED**: 编写 discoverServices 测试
- [ ] **GREEN**: 实现 `discoverServices()` — 调用 Supabase API，按 quality_score 排序
- [ ] **Commit**: `feat(sdk): add service discovery with quality ranking`

#### TDD 循环 4：invokeService 完整流程
- [ ] **RED**: 编写完整调用流程测试
- [ ] **GREEN**: 实现 `invokeService()` — 串联：
  1. 获取 402 challenge
  2. Escrow.open()（签名）
  3. 获取 ciphertext
  4. 监听 PaymentReleased 事件
  5. 从事件获取 preimage
  6. 解密返回结果
- [ ] **Commit**: `feat(sdk): add invokeService flow orchestration`

#### TDD 循环 5：质量指标上报
- [ ] **RED**: 编写测试 — 调用完成后自动上报 success/latency/schemaMatch
- [ ] **GREEN**: 实现 `reportMetrics()` — 上报到 Supabase
- [ ] **Commit**: `feat(sdk): add automatic quality metrics reporting`

**关键文件**：
- `packages/sdk/src/escrow.ts` — 合约交互
- `packages/sdk/src/crypto.ts` — 加密工具
- `packages/sdk/src/discovery.ts` — 服务发现
- `packages/sdk/src/metrics.ts` — 质量指标上报
- `packages/sdk/src/index.ts` — 主入口
- `packages/sdk/test/` — 所有测试文件

---

### 阶段 4：Provider 服务（TDD）
**目标**：实现 Provider API 服务

**Provider 流程说明（Privy 闭环）**：
1. **注册**：Provider 在 DApp 前端用 Privy（email）登录 → Privy 自动创建嵌入式钱包 → 填写服务信息 → 提交到 Supabase
2. **API 服务**：独立后端服务，处理 Agent 的调用请求（返回 402 / ciphertext）
3. **Claim**：Provider API 服务调用 Privy Server SDK 执行 claim → Privy 嵌入式钱包自动签名 → 链上释放资金 + 公开 preimage

#### TDD 循环 1：402 Payment Challenge
- [ ] **RED**: 编写测试 — 调用无付款返回 402 + challenge（包含 hashLock）
- [ ] **GREEN**: 实现 402 响应逻辑（生成 key、计算 hashLock、缓存 key 用于后续）
- [ ] **Commit**: `feat(provider): add 402 payment challenge response`

#### TDD 循环 2：加密交付
- [ ] **RED**: 编写测试 — 已付款（链上验证 requestId）时返回 ciphertext（不返回 preimage）
- [ ] **GREEN**: 实现加密返回逻辑
- [ ] **Commit**: `feat(provider): add encrypted content delivery`

#### TDD 循环 3：自动 Claim（Privy Server SDK）
- [ ] **RED**: 编写测试 — Provider 自动调用 claim，通过 Privy 嵌入式钱包签名
- [ ] **GREEN**: 集成 Privy Server SDK，实现自动 claim
- [ ] **Commit**: `feat(provider): add auto-claim with Privy embedded wallet`

**关键文件**：
- `apps/provider/src/routes/invoke.ts`
- `apps/provider/src/services/string-length.ts`
- `apps/provider/test/` — 所有测试文件

---

### 阶段 5：viem + Supabase 索引器
**目标**：索引链上事件至 Supabase PostgreSQL

- [x] `packages/indexer/` 重写为 viem + Supabase 轮询索引器
- [x] Supabase migration: `payments` + `indexer_state` 表
- [x] `src/indexer.ts` — 核心轮询逻辑
- [x] `test/indexer.test.ts` — 7 个单元测试
- [x] 清除所有 ENVIO 环境变量引用

**验证**：触发合约事件后，Supabase `payments` 表可查询到数据

**关键文件**：
- `apps/backend/supabase/migrations/002_payments.sql`
- `packages/indexer/src/indexer.ts`
- `packages/indexer/src/abi.ts`
- `packages/indexer/test/indexer.test.ts`

---

### 阶段 6：Supabase 后端 + 质量评分系统
**目标**：服务注册、质量指标存储与计算

#### 6.1 数据库 Schema
- [ ] `providers` 表：id, wallet_address, name, email, created_at
- [ ] `services` 表：id, provider_id, service_id, endpoint, pricing, schema, status
- [ ] `call_logs` 表：id, service_id, request_id, agent_address, success, latency_ms, schema_match, created_at
- [ ] `metrics` 表（聚合视图）：service_id, success_rate, avg_latency, schema_match_rate, quality_score, total_calls, last_updated

#### 6.2 质量指标计算逻辑
根据 PRD 定义的指标：
- **success_rate** = 成功调用数 / 总调用数
- **avg_latency** = 平均响应时间（ms）
- **schema_match_rate** = schema 匹配调用数 / 总调用数
- **quality_score** = 加权综合分（如：0.4×success_rate + 0.3×(1-normalized_latency) + 0.3×schema_match_rate）

#### 6.3 Edge Functions
- [ ] `GET /services` — 服务发现（按 quality_score 排序）
- [ ] `GET /services/:id` — 服务详情 + 完整指标
- [ ] `POST /providers` — Provider 注册
- [ ] `POST /metrics/report` — Agent/Provider 上报调用结果（用于计算指标）

#### 6.4 指标更新机制
- [ ] 每次调用完成后，Agent SDK 自动上报 call_log
- [ ] Supabase 定时任务或触发器计算聚合 metrics

**验证**：多次调用后，metrics 表正确反映 success_rate、avg_latency、quality_score

**关键文件**：
- `apps/backend/supabase/migrations/001_init.sql`
- `apps/backend/supabase/functions/services/index.ts`
- `apps/backend/supabase/functions/metrics/index.ts`

**Commits**:
- `feat(backend): add Supabase database schema with quality metrics tables`
- `feat(backend): add service discovery Edge Functions with quality ranking`
- `feat(backend): add metrics reporting and aggregation`

---

### 阶段 7：Next.js 前端
**目标**：统一用户体系 + 双角色面板

#### 7.1 项目初始化
- [ ] Next.js + shadcn/ui + Privy（统一登录）
- [ ] 配置从 `.env.local` 读取

#### 7.2 统一登录 + 导航
- [ ] Privy 登录组件（email/Google/钱包）
- [ ] 登录后显示 Privy 钱包地址 + 余额
- [ ] 顶部导航：服务发现 | Agent 面板 | Provider 面板
- [ ] 同一用户可切换不同面板

#### 7.3 服务发现页面 `/services`
- [ ] 服务列表（从 Supabase 获取，按 quality_score 排序）
- [ ] 搜索/筛选
- [ ] 显示质量指标卡片：
  - success_rate（成功率）— 显示百分比
  - avg_latency（平均延迟）— 显示 ms
  - schema_match_rate（schema 匹配率）— 显示百分比
  - quality_score（综合评分）— 显示 0-100 分
  - total_calls（总调用次数）— 显示可信度参考

#### 7.4 Agent 开发者面板 `/agent`
- [ ] **钱包信息**：Privy 钱包地址 + 余额
- [ ] **充值提示**：显示钱包地址，引导充值 ETH
- [ ] **导出私钥**：按钮导出 Privy 钱包私钥（用于配置 SDK）
- [ ] **SDK 使用指南**：简要说明如何集成 SDK
- [ ] **调用历史**：显示该钱包的所有服务调用记录
- [ ] **费用统计**：累计消费、本月消费等

#### 7.5 Provider 面板 `/provider`
- [ ] **钱包信息**：Privy 钱包地址 + 余额
- [ ] **充值 Gas 提示**：引导 Provider 充值少量 ETH（用于 claim）
- [ ] **注册新服务**：填写服务信息（endpoint, pricing, schema）
- [ ] **我的服务列表**：显示已注册的服务
- [ ] **待 claim 列表**：显示待领取的支付，一键 claim
- [ ] **收入统计**：累计收入、本月收入
- [ ] **提现功能**：将余额转出到外部地址

**验证**：
- Agent：连接钱包 → 发现服务 → 调用 → 等待 claim → 从事件获取 preimage → 解密
- Provider：email 登录 → 注册服务 → 一键 claim → 收入到账

**关键文件**：
- `apps/frontend/src/app/services/page.tsx`
- `apps/frontend/src/app/agent/page.tsx`
- `apps/frontend/src/app/provider/page.tsx`
- `apps/frontend/src/lib/privy.ts` — Privy 配置

**Commits**:
- `feat(frontend): initialize Next.js with Wagmi, Privy and shadcn/ui`
- `feat(frontend): add service discovery page`
- `feat(frontend): add Agent console with event listener for preimage`
- `feat(frontend): add Provider dashboard with Privy email login and auto-claim`

---

### 阶段 8：端到端集成测试
**目标**：完整流程验证

- [ ] Agent 调用服务完整流程 E2E 测试
- [ ] Provider claim 完整流程 E2E 测试
- [ ] Timeout refund 流程 E2E 测试
- [ ] **质量指标验证**：多次调用后检查 metrics 表正确更新
- [ ] Demo 准备：演示钱包、预注册服务、关键流程截图

**验证标准（来自 PRD）**：
| 验收点 | 验证方式 |
|--------|----------|
| 402 Challenge 输出 | 402 + price + hashLock |
| Escrow Lock | `PaymentLocked` event |
| Provider ciphertext | ciphertext 可被 Agent 获取 |
| Provider claim | `PaymentReleased` event + preimage 公开 |
| Agent 成功解密 | 从事件获取 preimage → 明文输出可验证 |
| 超时 refund | `PaymentRefunded` event |
| **质量指标更新** | metrics 表反映 success_rate, avg_latency, quality_score |
| **服务排序** | /services 按 quality_score 降序排列 |

**Commit**: `test: add end-to-end integration tests`

---

### 阶段 9：Payment Gateway + Agent 简化（v3）
**目标**：引入 Payment Gateway 中介，简化 Provider 和 Agent 集成

#### 9.1 数据库迁移
- [x] `gateway_challenges` 表 — 9 状态、per-state 时间戳、结果存储、claim tx 追踪
- [x] 索引 — status、agent、service、deadline、recovery 复合索引
- [x] `provider_revenue` 聚合视图
- [x] 更新 `000_reset.sql` 清理脚本

#### 9.2 Gateway 状态机
- [x] `state-machine.ts` — 核心逻辑（~400 行）
- [x] 9 状态：CREATED → ESCROW_LOCKED → PROVIDER_CALLED → RESULT_STORED → CLAIMED → COMPLETED（+ FAILED/REFUNDABLE/REFUNDED）
- [x] 乐观锁：`WHERE status = expected_status`
- [x] 写前执行原则（先 DB 再外部操作）
- [x] API Key 验证（查询 Supabase `api_keys` 表）
- [x] 链上 Escrow 验证 + claim 执行

#### 9.3 Gateway API Route
- [x] `POST /api/gateway/invoke` — 无 requestId → 402 挑战；有 requestId → 完整流程
- [x] `GET /api/gateway/status` — 状态查询（polling fallback）
- [x] 恢复任务 — 每 30s 自动处理卡住请求

#### 9.4 SDK 重写
- [x] `gatewayUrl` 配置项
- [x] `callService()` 自动路由（Gateway / Legacy）
- [x] `invokeViaGateway()` — Gateway 流程编排
- [x] `pollGatewayStatus()` — 状态轮询 fallback
- [x] 5 个 Gateway 单元测试

#### 9.5 Provider 简化
- [x] 移除所有钱包/加密/claim 逻辑
- [x] 路由简化：`POST / { text } → { result }`（200 行 → 19 行）
- [x] 移除 viem、@noble/ciphers 依赖
- [x] 重写 6 个测试

#### 9.6 Agent 简化
- [x] 2 个工具 → 1 个工具 (`call_service`)
- [x] Gemini 系统指令精简
- [x] `neurostream.ts` 使用 `client.callService()`

#### 9.7 配置更新
- [x] `.env.example` 新增 Gateway 变量
- [x] `turbo.json` globalPassThroughEnv 更新
- [x] Agent `.env.example` 新增 `NEUROSTREAM_GATEWAY_URL`
- [x] Provider `.env.example` 精简

**验证**：全流程测试通过，62 测试全部通过

**Commit**: `f88cf68 feat: add Payment Gateway for simplified Provider/Agent integration`

---

## Git 提交规范

### Commit Message 格式
```
<type>(<scope>): <description>
```

### Type: `feat` / `fix` / `test` / `docs` / `chore` / `refactor` / `deploy`
### Scope: `contracts` / `sdk` / `frontend` / `provider` / `indexer` / `backend`

### TDD Commit 节奏
每个 TDD 循环产出 1-2 个 commit：
- 测试 + 实现一起提交（GREEN 后 commit）
- 重构单独提交（REFACTOR 后 commit，如有必要）

---

## 执行顺序

1. **阶段 0**：Git 重置
2. **阶段 1**：基础设施搭建
3. **阶段 2**：Escrow 合约（TDD）
4. **阶段 3**：SDK（TDD，依赖合约 ABI）
5. **阶段 4**：Provider（TDD，可与阶段 3 部分并行）
6. **阶段 5**：viem + Supabase 索引器（依赖合约地址）
7. **阶段 6**：Supabase 后端
8. **阶段 7**：前端（依赖 SDK + 后端）
9. **阶段 8**：集成测试

---

## 关键风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Monad Testnet 不稳定 | 备选 Hardhat 本地网络进行开发和测试 |
| Envio 配置复杂 | 已替换为 viem + Supabase 轮询索引器，零新基础设施 |
| 加密实现出错 | 使用成熟的 crypto 库（如 @noble/ciphers） |

---

## 用户需要填入的 .env 值

### 项目根目录 `.env`
用户在开始前需要填入以下值：
- `MONAD_RPC_URL` — Monad Testnet RPC endpoint
- `DEPLOYER_PRIVATE_KEY` — 部署合约的钱包私钥（仅用于部署，部署后可删除）
- `SUPABASE_URL` — Supabase 项目 URL
- `SUPABASE_ANON_KEY` — Supabase 匿名 Key
- `SUPABASE_SERVICE_KEY` — Supabase 服务 Key
- `PRIVY_APP_ID` — Privy 应用 ID（在 privy.io 控制台创建）
- `PRIVY_APP_SECRET` — Privy 应用 Secret（Server SDK 用）
- `ESCROW_CONTRACT_ADDRESS` — 合约部署后填入

### Agent 开发者的 `.env`（本地 AI 程序）
Agent 开发者在本地 AI 程序中配置：
```env
NEUROSTREAM_PRIVATE_KEY=  # 从 DApp 导出的 Privy 钱包私钥
MONAD_RPC_URL=            # Monad Testnet RPC
ESCROW_CONTRACT_ADDRESS=  # Escrow 合约地址
SUPABASE_URL=             # 服务发现 API
```

**注意**：
- 所有用户都使用 Privy 登录，获得嵌入式钱包
- Agent 开发者导出私钥用于本地 SDK
- Provider 的 claim 操作在 DApp 前端完成（Privy 自动签名）
