# Platform Fee & Gasless UX Implementation Plan

> **For Claude:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add platform fee to the Escrow contract and remove all ETH requirements from the frontend wallet, so end-users only need USDC.

**Architecture:** The Escrow contract's `claim()` function will auto-split payments: a configurable percentage (basis points) goes to the platform address, the remainder to the provider (Gateway). The `PaymentReleased` event keeps emitting the original locked `payment.amount` for backward compatibility — a new `PlatformFeeCollected` event tracks fees separately. The frontend wallet page drops all ETH-related UI. Privy gas sponsorship (dashboard config) covers embedded wallet gas costs.

**Tech Stack:** Solidity 0.8.24, OpenZeppelin SafeERC20, Hardhat, ethers.js, TypeScript, Next.js, Privy

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/contracts/contracts/Escrow.sol` | Add `platform`, `feeBps`, split `claim()` payment |
| Modify | `packages/contracts/test/Escrow.test.ts` | Test fee splitting, edge cases, constructor validation |
| Modify | `packages/contracts/scripts/deploy.ts` | Pass `platform` + `feeBps` to constructor |
| Modify | `packages/sdk/src/abi.ts` | Add `platform()`, `feeBps()`, `PlatformFeeCollected` to ABI |
| Modify | `packages/indexer/src/abi.ts` | Add `PlatformFeeCollected` event to indexer ABI |
| Modify | `apps/frontend/src/app/wallet/page.tsx` | Remove ETH deposit tab, ETH balance, simplify to USDC-only |
| Modify | `apps/frontend/src/app/agent/page.tsx` | Update wallet link description (remove "ETH for gas") |
| Modify | `.env.example` | Add `PLATFORM_ADDRESS`, `PLATFORM_FEE_BPS` |
| Modify | `memory-bank/architecture.md` | Document platform fee mechanism |
| Modify | `memory-bank/implementation-plan.md` | Update fee structure table |

---

## Chunk 1: Escrow Contract — Platform Fee

### Task 1: Update Escrow.sol constructor and claim()

**Files:**
- Modify: `packages/contracts/contracts/Escrow.sol`

- [ ] **Step 1: Add state variables, errors, event, and update constructor**

Add after `paymentToken` (line 45):

```solidity
address public immutable platform;
uint256 public immutable feeBps; // basis points, e.g. 200 = 2%
```

Add to errors section (after `InvalidToken`):

```solidity
error InvalidPlatform();
error InvalidFeeBps();
```

Add to events section (after `PaymentRefunded`):

```solidity
event PlatformFeeCollected(
    bytes32 indexed requestId,
    address indexed platform,
    uint256 fee
);
```

Replace constructor (lines 88-91):

```solidity
constructor(IERC20 _paymentToken, address _platform, uint256 _feeBps) {
    if (address(_paymentToken) == address(0)) revert InvalidToken();
    if (_platform == address(0)) revert InvalidPlatform();
    if (_feeBps > 5000) revert InvalidFeeBps(); // max 50%
    paymentToken = _paymentToken;
    platform = _platform;
    feeBps = _feeBps;
}
```

- [ ] **Step 2: Update claim() to split payment**

Replace the `claim()` function (lines 128-141). Key design decisions:
- `PaymentReleased` keeps emitting `payment.amount` (original locked amount) for backward compatibility with indexer and SDK consumers.
- Events are emitted before external calls (Checks-Effects-Interactions pattern).
- `PlatformFeeCollected` only emitted when `fee > 0`.

```solidity
function claim(bytes32 requestId, bytes32 preimage) external {
    Payment storage payment = payments[requestId];

    if (payment.status != Status.Locked) revert PaymentNotLocked();
    if (msg.sender != payment.provider) revert NotProvider();
    if (block.timestamp > payment.deadline) revert DeadlinePassed();
    if (keccak256(abi.encodePacked(preimage)) != payment.hashLock) revert InvalidPreimage();

    payment.status = Status.Released;

    uint256 fee = payment.amount * feeBps / 10000;
    uint256 providerAmount = payment.amount - fee;

    // Events before interactions (CEI pattern)
    emit PaymentReleased(requestId, payment.provider, payment.amount, preimage);
    if (fee > 0) {
        emit PlatformFeeCollected(requestId, platform, fee);
    }

    // Interactions
    if (fee > 0) {
        paymentToken.safeTransfer(platform, fee);
    }
    paymentToken.safeTransfer(payment.provider, providerAmount);
}
```

- [ ] **Step 3: Verify the contract compiles**

Run: `cd packages/contracts && npx hardhat compile`
Expected: Compilation successful with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/contracts/Escrow.sol
git commit -m "feat(contracts): add platform fee to Escrow constructor and claim()"
```

---

### Task 2: Update Escrow tests for platform fee

**Files:**
- Modify: `packages/contracts/test/Escrow.test.ts`

- [ ] **Step 1: Update the test fixture**

Replace `deployEscrowFixture` (lines 9-43):

```typescript
async function deployEscrowFixture() {
    const [owner, agent, provider, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const token = await MockERC20.deploy('Mock USDC', 'USDC', 6);

    // Deploy Escrow with token, platform (owner), and 2% fee (200 bps)
    const Escrow = await ethers.getContractFactory('Escrow');
    const feeBps = 200; // 2%
    const escrow = await Escrow.deploy(await token.getAddress(), owner.address, feeBps);

    await token.mint(agent.address, ethers.parseUnits('10000', 6));

    const requestId = ethers.keccak256(ethers.toUtf8Bytes('test-request-1'));
    const preimage = ethers.keccak256(ethers.toUtf8Bytes('secret-key-123'));
    const hashLock = ethers.keccak256(preimage);
    const amount = ethers.parseUnits('100', 6); // 100 USDC
    const deadline = BigInt((await time.latest()) + 3600);

    return {
      token, escrow, owner, agent, provider, other,
      requestId, preimage, hashLock, amount, deadline, feeBps,
    };
}
```

- [ ] **Step 2: Replace constructor tests**

```typescript
describe('constructor', function () {
    it('should store the payment token address', async function () {
      const { token, escrow } = await loadFixture(deployEscrowFixture);
      expect(await escrow.paymentToken()).to.equal(await token.getAddress());
    });

    it('should store the platform address', async function () {
      const { escrow, owner } = await loadFixture(deployEscrowFixture);
      expect(await escrow.platform()).to.equal(owner.address);
    });

    it('should store the fee basis points', async function () {
      const { escrow, feeBps } = await loadFixture(deployEscrowFixture);
      expect(await escrow.feeBps()).to.equal(feeBps);
    });

    it('should reject zero token address', async function () {
      const Escrow = await ethers.getContractFactory('Escrow');
      const [owner] = await ethers.getSigners();
      await expect(
        Escrow.deploy(ethers.ZeroAddress, owner.address, 200)
      ).to.be.revertedWithCustomError(Escrow, 'InvalidToken');
    });

    it('should reject zero platform address', async function () {
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      const token = await MockERC20.deploy('T', 'T', 6);
      const Escrow = await ethers.getContractFactory('Escrow');
      await expect(
        Escrow.deploy(await token.getAddress(), ethers.ZeroAddress, 200)
      ).to.be.revertedWithCustomError(Escrow, 'InvalidPlatform');
    });

    it('should reject feeBps > 5000', async function () {
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      const token = await MockERC20.deploy('T', 'T', 6);
      const Escrow = await ethers.getContractFactory('Escrow');
      const [owner] = await ethers.getSigners();
      await expect(
        Escrow.deploy(await token.getAddress(), owner.address, 5001)
      ).to.be.revertedWithCustomError(Escrow, 'InvalidFeeBps');
    });

    it('should allow feeBps = 5000 (maximum)', async function () {
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      const token = await MockERC20.deploy('T', 'T', 6);
      const Escrow = await ethers.getContractFactory('Escrow');
      const [owner] = await ethers.getSigners();
      await expect(
        Escrow.deploy(await token.getAddress(), owner.address, 5000)
      ).to.not.be.reverted;
    });

    it('should allow feeBps = 0 (no fee)', async function () {
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      const token = await MockERC20.deploy('T', 'T', 6);
      const Escrow = await ethers.getContractFactory('Escrow');
      const [owner] = await ethers.getSigners();
      await expect(
        Escrow.deploy(await token.getAddress(), owner.address, 0)
      ).to.not.be.reverted;
    });
});
```

- [ ] **Step 3: Replace claim() tests**

```typescript
describe('claim()', function () {
    it('should split payment: fee to platform, remainder to provider', async function () {
      const { token, escrow, owner, agent, provider, requestId, preimage, hashLock, amount, deadline, feeBps } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      const platformBefore = await token.balanceOf(owner.address);
      const providerBefore = await token.balanceOf(provider.address);

      await escrow.connect(provider).claim(requestId, preimage);

      const expectedFee = amount * BigInt(feeBps) / 10000n;
      const expectedProvider = amount - expectedFee;

      expect(await token.balanceOf(owner.address) - platformBefore).to.equal(expectedFee);
      expect(await token.balanceOf(provider.address) - providerBefore).to.equal(expectedProvider);

      const payment = await escrow.payments(requestId);
      expect(payment.status).to.equal(2); // Status.Released
    });

    it('should emit PaymentReleased with original amount (not deducted)', async function () {
      const { token, escrow, agent, provider, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      await expect(escrow.connect(provider).claim(requestId, preimage))
        .to.emit(escrow, 'PaymentReleased')
        .withArgs(requestId, provider.address, amount, preimage);
    });

    it('should emit PlatformFeeCollected event', async function () {
      const { token, escrow, owner, agent, provider, requestId, preimage, hashLock, amount, deadline, feeBps } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      const expectedFee = amount * BigInt(feeBps) / 10000n;

      await expect(escrow.connect(provider).claim(requestId, preimage))
        .to.emit(escrow, 'PlatformFeeCollected')
        .withArgs(requestId, owner.address, expectedFee);
    });

    it('should send full amount to provider when feeBps = 0', async function () {
      const { token, agent, provider } = await loadFixture(deployEscrowFixture);

      const Escrow = await ethers.getContractFactory('Escrow');
      const [owner] = await ethers.getSigners();
      const escrow0 = await Escrow.deploy(await token.getAddress(), owner.address, 0);

      const requestId = ethers.keccak256(ethers.toUtf8Bytes('zero-fee-test'));
      const preimage = ethers.keccak256(ethers.toUtf8Bytes('key-zero'));
      const hashLock = ethers.keccak256(preimage);
      const amount = ethers.parseUnits('50', 6);
      const deadline = BigInt((await time.latest()) + 3600);

      await token.connect(agent).approve(await escrow0.getAddress(), amount);
      await escrow0.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      const providerBefore = await token.balanceOf(provider.address);
      await escrow0.connect(provider).claim(requestId, preimage);
      expect(await token.balanceOf(provider.address) - providerBefore).to.equal(amount);
    });

    it('should NOT emit PlatformFeeCollected when feeBps = 0', async function () {
      const { token, agent, provider } = await loadFixture(deployEscrowFixture);

      const Escrow = await ethers.getContractFactory('Escrow');
      const [owner] = await ethers.getSigners();
      const escrow0 = await Escrow.deploy(await token.getAddress(), owner.address, 0);

      const requestId = ethers.keccak256(ethers.toUtf8Bytes('no-fee-event-test'));
      const preimage = ethers.keccak256(ethers.toUtf8Bytes('key-no-fee'));
      const hashLock = ethers.keccak256(preimage);
      const amount = ethers.parseUnits('50', 6);
      const deadline = BigInt((await time.latest()) + 3600);

      await token.connect(agent).approve(await escrow0.getAddress(), amount);
      await escrow0.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      await expect(escrow0.connect(provider).claim(requestId, preimage))
        .to.not.emit(escrow0, 'PlatformFeeCollected');
    });

    it('should handle dust amounts where fee rounds to zero', async function () {
      const { token, escrow, owner, agent, provider } = await loadFixture(deployEscrowFixture);

      const requestId = ethers.keccak256(ethers.toUtf8Bytes('dust-test'));
      const preimage = ethers.keccak256(ethers.toUtf8Bytes('key-dust'));
      const hashLock = ethers.keccak256(preimage);
      const amount = 1n; // 1 wei of USDC — fee = 1*200/10000 = 0
      const deadline = BigInt((await time.latest()) + 3600);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      const providerBefore = await token.balanceOf(provider.address);
      const platformBefore = await token.balanceOf(owner.address);

      await escrow.connect(provider).claim(requestId, preimage);

      // Fee rounds to 0, full amount goes to provider
      expect(await token.balanceOf(provider.address) - providerBefore).to.equal(1n);
      expect(await token.balanceOf(owner.address) - platformBefore).to.equal(0n);
    });

    it('should reject invalid preimage', async function () {
      const { token, escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      const invalidPreimage = ethers.keccak256(ethers.toUtf8Bytes('wrong-key'));

      await expect(
        escrow.connect(provider).claim(requestId, invalidPreimage)
      ).to.be.revertedWithCustomError(escrow, 'InvalidPreimage');
    });

    it('should reject claim from non-provider', async function () {
      const { token, escrow, agent, provider, other, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      await expect(
        escrow.connect(other).claim(requestId, preimage)
      ).to.be.revertedWithCustomError(escrow, 'NotProvider');
    });

    it('should reject claim after deadline', async function () {
      const { token, escrow, agent, provider, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      await time.increaseTo(deadline + 1n);

      await expect(
        escrow.connect(provider).claim(requestId, preimage)
      ).to.be.revertedWithCustomError(escrow, 'DeadlinePassed');
    });

    it('should reject claim on non-existent payment', async function () {
      const { escrow, provider, preimage } = await loadFixture(deployEscrowFixture);

      const nonExistentRequestId = ethers.keccak256(ethers.toUtf8Bytes('non-existent'));

      await expect(
        escrow.connect(provider).claim(nonExistentRequestId, preimage)
      ).to.be.revertedWithCustomError(escrow, 'PaymentNotLocked');
    });
});
```

- [ ] **Step 4: Run all tests**

Run: `cd packages/contracts && npx hardhat test`
Expected: All tests pass (constructor: 8, open: 7, claim: 11, refund: 5, getPayment: 1 = 32 total)

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/test/Escrow.test.ts
git commit -m "test(contracts): update tests for platform fee splitting"
```

---

### Task 3: Update deployment script

**Files:**
- Modify: `packages/contracts/scripts/deploy.ts:48-59`

- [ ] **Step 1: Add platform address, feeBps, and input validation**

Replace the Escrow deployment section (lines 48-59):

```typescript
  // Platform fee configuration
  const platformAddress = process.env.PLATFORM_ADDRESS || deployer.address;
  const feeBps = parseInt(process.env.PLATFORM_FEE_BPS || '200', 10);
  if (isNaN(feeBps) || feeBps < 0 || feeBps > 5000) {
    throw new Error(`Invalid PLATFORM_FEE_BPS: must be 0-5000, got "${process.env.PLATFORM_FEE_BPS}"`);
  }

  // Deploy Escrow
  const Escrow = await ethers.getContractFactory('Escrow');
  const escrow = await Escrow.deploy(tokenAddress, platformAddress, feeBps);
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  console.log('Escrow deployed to:', escrowAddress);
  console.log('Platform address:', platformAddress);
  console.log('Platform fee:', feeBps, 'bps (' + (feeBps / 100) + '%)');
  console.log('');
  console.log('Add to your .env:');
  console.log(`PAYMENT_TOKEN_ADDRESS=${tokenAddress}`);
  console.log(`ESCROW_CONTRACT_ADDRESS=${escrowAddress}`);
  console.log(`PAYMENT_TOKEN_DECIMALS=6`);
  console.log(`PLATFORM_ADDRESS=${platformAddress}`);
  console.log(`PLATFORM_FEE_BPS=${feeBps}`);
```

- [ ] **Step 2: Verify deploy script on local network**

Run (terminal 1): `cd packages/contracts && npx hardhat node`
Run (terminal 2): `cd packages/contracts && npx hardhat run scripts/deploy.ts --network localhost`
Expected: Successful deployment with platform address and fee logged.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/scripts/deploy.ts
git commit -m "feat(contracts): add platform address and fee to deploy script"
```

---

## Chunk 2: SDK, Indexer & Frontend Updates

### Task 4: Update SDK ABI

**Files:**
- Modify: `packages/sdk/src/abi.ts`

Note: These are ABI-only additions. No wrapper methods in `EscrowClient` are needed at this stage — `platform()` and `feeBps()` are read-only convenience functions that external tooling can call directly via the ABI.

- [ ] **Step 1: Add new error entries, event, and view functions**

Add to the EscrowABI array in `packages/sdk/src/abi.ts`:

After existing error entries (after `PaymentNotLocked`), add:

```typescript
{
    inputs: [],
    name: 'InvalidPlatform',
    type: 'error',
},
{
    inputs: [],
    name: 'InvalidFeeBps',
    type: 'error',
},
```

After existing events (after `PaymentRefunded`), add:

```typescript
{
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'bytes32', name: 'requestId', type: 'bytes32' },
      { indexed: true, internalType: 'address', name: 'platform', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'fee', type: 'uint256' },
    ],
    name: 'PlatformFeeCollected',
    type: 'event',
},
```

After existing functions (e.g., after `paymentToken`), add:

```typescript
{
    inputs: [],
    name: 'platform',
    outputs: [
      { internalType: 'address', name: '', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
},
{
    inputs: [],
    name: 'feeBps',
    outputs: [
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
},
```

- [ ] **Step 2: Build SDK**

Run: `cd packages/sdk && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/abi.ts
git commit -m "feat(sdk): add platform fee ABI entries"
```

---

### Task 5: Update Indexer ABI

**Files:**
- Modify: `packages/indexer/src/abi.ts`

The indexer maintains a separate ABI copy (see comment at line 1-3). It only needs event ABIs. The `PlatformFeeCollected` event should be added so the indexer can decode it (even if it doesn't process it yet — avoids `Unknown event, skip` warnings).

- [ ] **Step 1: Add PlatformFeeCollected event to indexer ABI**

Add after the `PaymentRefunded` event entry (before the closing `] as const`):

```typescript
{
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'bytes32', name: 'requestId', type: 'bytes32' },
      { indexed: true, internalType: 'address', name: 'platform', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'fee', type: 'uint256' },
    ],
    name: 'PlatformFeeCollected',
    type: 'event',
},
```

No changes to `indexer.ts` needed — `PlatformFeeCollected` events will be decoded but fall through the if/else chain and be silently skipped (which is correct; fees don't need to be indexed for MVP).

- [ ] **Step 2: Commit**

```bash
git add packages/indexer/src/abi.ts
git commit -m "feat(indexer): add PlatformFeeCollected event to ABI"
```

---

### Task 6: Simplify wallet page — remove ETH

**Files:**
- Modify: `apps/frontend/src/app/wallet/page.tsx`

- [ ] **Step 1: Update imports — remove formatEther, parseEther**

Replace line 6-14 imports:

```typescript
import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  http,
  parseUnits,
} from 'viem';
```

- [ ] **Step 2: Update Tab type and default state**

Line 27 — change type:
```typescript
type Tab = 'deposit-usdc' | 'withdraw-usdc';
```

Line 81 — change default:
```typescript
const [activeTab, setActiveTab] = useState<Tab>('deposit-usdc');
```

Line 82 — delete `ethBalance` state entirely:
```typescript
// DELETE: const [ethBalance, setEthBalance] = useState<string | null>(null);
```

- [ ] **Step 3: Remove ETH balance fetch from fetchBalances**

In `fetchBalances` (lines 98-120), remove the ETH balance lines (103-105). Keep only the USDC balance fetch:

```typescript
const fetchBalances = useCallback(async () => {
    if (!embeddedAddress) return;
    try {
      const client = createPublicClient({ transport: http(rpcUrl) });

      // USDC balance
      if (tokenAddress) {
        const usdcBal = await client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [embeddedAddress as `0x${string}`],
        });
        setUsdcBalance(formatUnits(usdcBal, tokenDecimals));
      }
    } catch {
      // silently fail
    }
}, [embeddedAddress]);
```

- [ ] **Step 4: Remove handleDepositEth function entirely**

Delete lines 220-261 (the entire `handleDepositEth` function).

- [ ] **Step 5: Update unauthenticated description text**

Line 399 — change:
```typescript
Login to manage your USDC balance, deposit, withdraw, and view transaction history.
```

- [ ] **Step 6: Update tabs, derived variables, and handleSubmit**

Tabs (lines 428-432):
```typescript
const tabs: { key: Tab; label: string }[] = [
    { key: 'deposit-usdc', label: 'Deposit USDC' },
    { key: 'withdraw-usdc', label: 'Withdraw USDC' },
];
```

Derived variables (lines 434-437):
```typescript
const isDeposit = activeTab === 'deposit-usdc';
const assetLabel = 'USDC';
const actionLabel = isDeposit ? 'Deposit' : 'Withdraw';
const needsExternal = true;
```

handleSubmit (lines 375-379):
```typescript
const handleSubmit = () => {
    if (activeTab === 'deposit-usdc') handleDepositUsdc();
    else handleWithdrawUsdc();
};
```

- [ ] **Step 7: Fix dead code references to 'deposit-eth'**

Input placeholder (line 552) — simplify:
```typescript
placeholder="1.00"
```

Submit button disabled condition (line 569) — simplify:
```typescript
disabled={txStatus === 'pending' || !amount || !tokenAddress}
```

- [ ] **Step 8: Replace Overview card grid with single USDC balance**

Replace the `grid-cols-2` overview (lines 472-501) with a single full-width card:

```tsx
<div className="rounded-xl bg-gray-50 p-4">
    <span className="text-sm text-gray-500">USDC Balance</span>
    <div className="text-xl font-bold text-gray-900 mt-1">
      {usdcBalance !== null ? (
        <span className="flex items-center gap-2">
          {parseFloat(usdcBalance).toFixed(2)}
          <span className="text-sm text-gray-500 font-normal">USDC</span>
        </span>
      ) : tokenAddress ? (
        <span className="text-gray-400">Loading...</span>
      ) : (
        <span className="text-gray-400">Not configured</span>
      )}
    </div>
</div>
```

- [ ] **Step 9: Keep formatDisplayAmount backward-compatible**

Keep the ETH branch in `formatDisplayAmount` (lines 383-389) for backward compatibility with historical transaction records that may have `asset: 'ETH'` in the database. Do NOT change this function.

- [ ] **Step 10: Verify the frontend builds**

Run: `cd apps/frontend && npx next build`
Expected: Build succeeds with no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/src/app/wallet/page.tsx
git commit -m "feat(frontend): remove ETH from wallet, USDC-only experience"
```

---

### Task 7: Update agent page wallet link text

**Files:**
- Modify: `apps/frontend/src/app/agent/page.tsx:239`

- [ ] **Step 1: Update the wallet description**

Change line 239:
```tsx
<p className="text-gray-500 text-sm mt-1">Deposit and withdraw USDC for service payments</p>
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/app/agent/page.tsx
git commit -m "fix(frontend): update agent page wallet link description"
```

---

### Task 8: Update .env.example

**Files:**
- Modify: `.env.example` (root only — platform fee is contract-level config, not needed by agent/provider apps)

- [ ] **Step 1: Add platform fee env vars**

Add after the existing blockchain variables section:

```env
# Platform Fee
PLATFORM_ADDRESS=           # Address to receive platform fees (defaults to deployer)
PLATFORM_FEE_BPS=200        # Fee in basis points (200 = 2%, max 5000 = 50%)
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add platform fee env vars to .env.example"
```

---

## Chunk 3: Documentation & Privy Gas Sponsorship

### Task 9: Update architecture documentation

**Files:**
- Modify: `memory-bank/architecture.md`
- Modify: `memory-bank/implementation-plan.md`

- [ ] **Step 1: Update architecture.md Escrow section (3.2)**

Replace the existing section 3.2 content:

```markdown
### 3.2 Escrow Contract (Monad)
*   **ERC20 代币支付**（v4）：使用 `IERC20 paymentToken`（构造函数参数，immutable），不再使用原生 ETH。
*   部署时指定支付代币地址（本地用 MockERC20/6 decimals，主网用 USDC）。
*   **平台手续费**（v5）：构造函数接受 `platform` 地址和 `feeBps`（基点）。`claim()` 时自动分账：
    - `fee = amount * feeBps / 10000` → 转给 platform
    - `amount - fee` → 转给 provider (Gateway)
    - `feeBps = 200` 即 2%，最大 5000（50%），允许 0（免费）
    - `PaymentReleased` 事件保持发送原始 `amount`（向后兼容），另发 `PlatformFeeCollected` 事件记录手续费
*   Agent 需先 `approve(escrow, amount)` 再调用 `open()`，合约通过 `safeTransferFrom` 拉取代币。
*   `claim()` 通过 `safeTransfer` 分别转账给 platform 和 provider。`refund()` 全额退还 agent。
*   通过 `Hashlock` 确保交付后再打款。
*   提供超时自动退款机制。
*   **v3 变化**：`recipient` 改为 Gateway 地址（而非 Provider 地址）。
*   **环境变量**：`PAYMENT_TOKEN_ADDRESS`、`PAYMENT_TOKEN_DECIMALS`、`PLATFORM_ADDRESS`、`PLATFORM_FEE_BPS`。
```

- [ ] **Step 2: Update implementation-plan.md fee structure table**

Replace the fee table (lines 74-80):

```markdown
### 费用结构
| 费用 | 由谁支付 | 说明 |
|------|----------|------|
| 服务费 | Agent 开发者（通过 SDK 签名） | ERC20 代币（USDC） |
| 平台手续费 | 从服务费中自动扣除 | claim() 时合约自动分账（默认 2%） |
| 所有 Gas 费 | 平台（Privy Gas Sponsorship） | DApp 用户无需持有 ETH |
| open() gas | 平台代付 | 通过 Privy embedded wallet gas sponsorship |
| claim() gas | 平台代付 | Gateway 钱包执行 |

> **注意**：SDK 用户（导出私钥在本地运行 Agent）仍需自行持有 ETH 支付 gas。
> Gas Sponsorship 仅覆盖 DApp 前端嵌入式钱包的操作。
```

- [ ] **Step 3: Commit**

```bash
git add memory-bank/architecture.md memory-bank/implementation-plan.md
git commit -m "docs: update architecture for platform fee and gasless UX"
```

---

## Privy Gas Sponsorship — Manual Setup (Not Code)

> **Important:** This is a Privy dashboard configuration, not a code change.

After deploying the updated contract, complete these steps in the [Privy Dashboard](https://dashboard.privy.io):

1. Go to **Gas Sponsorship** tab → Enable gas sponsorship
2. Select the target chain (Monad Testnet / localhost)
3. Fund the gas sponsorship pool with ETH

The current frontend uses raw `provider.request()` for embedded wallet transactions. To use Privy's native gas sponsorship, a follow-up task should migrate `handleDepositUsdc` and `handleWithdrawUsdc` to use Privy's `useSendTransaction` hook with `{ sponsor: true }`. This is out of scope for this plan.

For SDK users (Agent developers running locally with exported private keys), they still need ETH for gas — Privy gas sponsorship only covers embedded wallet transactions on the DApp frontend.
