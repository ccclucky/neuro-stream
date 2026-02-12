# ERC20 Payment Token (USDC) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace native ETH payments with ERC20 token (USDC) payments across the entire stack — contracts, SDK, gateway, indexer, and config.

**Architecture:** Escrow contract takes an `IERC20 paymentToken` in its constructor (immutable). Payments use `approve` + `transferFrom` instead of `msg.value`. A `MockERC20` contract is provided for local/testnet testing. Token address and decimals are environment-configurable.

**Tech Stack:** Solidity + OpenZeppelin SafeERC20, viem (parseUnits), Hardhat, Vitest

---

## Summary of All Changes

| Layer | Files | What Changes |
|-------|-------|-------------|
| Contracts | `Escrow.sol`, new `MockERC20.sol` | ERC20 transferFrom instead of msg.value |
| Contracts | `Escrow.test.ts`, `scripts/deploy.ts` | Deploy MockERC20, approve before open |
| SDK | `abi.ts`, `escrow.ts` | New ABI, approve+open flow, no `value` |
| SDK | `client.ts`, `types.ts`, `discovery.ts` | Asset = USDC, parseUnits instead of parseEther |
| SDK | `test/escrow.test.ts`, `test/gateway.test.ts` | Updated configs and mocks |
| Gateway | `state-machine.ts`, `invoke/route.ts` | parseUnits, ERC20 approve for gateway wallet |
| Indexer | No changes needed | Events unchanged, amounts are just numbers |
| Config | `.env.example`, `.env.development` | Add PAYMENT_TOKEN_ADDRESS, PAYMENT_TOKEN_DECIMALS |

---

### Task 1: Install OpenZeppelin and Create MockERC20

**Files:**
- Modify: `packages/contracts/package.json` (add @openzeppelin/contracts)
- Create: `packages/contracts/contracts/MockERC20.sol`

**Step 1: Install OpenZeppelin**

Run: `cd packages/contracts && pnpm add -D @openzeppelin/contracts`

**Step 2: Create MockERC20.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20 — Test-only ERC20 token (e.g. Mock USDC)
contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Anyone can mint — test only!
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

**Step 3: Verify compilation**

Run: `cd packages/contracts && npx hardhat compile`
Expected: Compiled successfully

**Step 4: Commit**

```bash
git add packages/contracts/contracts/MockERC20.sol packages/contracts/package.json pnpm-lock.yaml
git commit -m "feat(contracts): add MockERC20 and OpenZeppelin dependency"
```

---

### Task 2: Refactor Escrow.sol to ERC20

**Files:**
- Modify: `packages/contracts/contracts/Escrow.sol`

**Step 1: Rewrite Escrow.sol**

Key changes from current contract:
1. Add `IERC20 public immutable paymentToken` (constructor param)
2. `open()`: Remove `payable`, add `uint256 amount` param, use `safeTransferFrom`
3. `claim()`: Replace `call{value:}` with `safeTransfer`
4. `refund()`: Replace `call{value:}` with `safeTransfer`
5. Remove `TransferFailed` error (SafeERC20 reverts automatically)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Escrow
 * @notice ERC20-based escrow for NeuroStream Agent-to-Provider payments
 * @dev Uses hashlock mechanism for atomic swap between payment and content delivery.
 *      Payment token is set at deployment (immutable).
 *
 * Flow:
 * 1. Agent approves Escrow to spend `amount` of paymentToken
 * 2. Agent calls open() to lock funds with a hashLock H
 * 3. Provider delivers content
 * 4. Provider calls claim() with preimage k where hash(k) == H
 * 5. If provider doesn't claim before deadline, agent can refund()
 */
contract Escrow {
    using SafeERC20 for IERC20;

    // ============ Enums ============

    enum Status {
        None,      // 0 - Payment doesn't exist
        Locked,    // 1 - Funds locked, awaiting claim
        Released,  // 2 - Provider claimed successfully
        Refunded   // 3 - Agent refunded after timeout
    }

    // ============ Structs ============

    struct Payment {
        address agent;      // Who locked the funds
        address provider;   // Who can claim the funds
        uint256 amount;     // Amount locked (in token smallest unit)
        bytes32 hashLock;   // keccak256(preimage) - provider must reveal preimage to claim
        uint64 deadline;    // After this time, agent can refund
        Status status;      // Current payment status
    }

    // ============ State ============

    IERC20 public immutable paymentToken;
    mapping(bytes32 => Payment) public payments;

    // ============ Events ============

    event PaymentLocked(
        bytes32 indexed requestId,
        address indexed agent,
        address indexed provider,
        uint256 amount,
        bytes32 hashLock,
        uint64 deadline
    );

    event PaymentReleased(
        bytes32 indexed requestId,
        address indexed provider,
        uint256 amount,
        bytes32 preimage
    );

    event PaymentRefunded(
        bytes32 indexed requestId,
        address indexed agent,
        uint256 amount
    );

    // ============ Errors ============

    error InvalidAmount();
    error InvalidProvider();
    error InvalidDeadline();
    error PaymentExists();
    error PaymentNotLocked();
    error InvalidPreimage();
    error NotProvider();
    error NotAgent();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error InvalidToken();

    // ============ Constructor ============

    constructor(IERC20 _paymentToken) {
        if (address(_paymentToken) == address(0)) revert InvalidToken();
        paymentToken = _paymentToken;
    }

    // ============ External Functions ============

    /**
     * @notice Lock ERC20 tokens for a service request.
     *         Caller must have approved this contract to spend `amount` tokens.
     * @param requestId Unique identifier for this payment
     * @param provider Address that can claim the funds
     * @param amount Amount of tokens to lock
     * @param hashLock keccak256(preimage) - provider must know preimage to claim
     * @param deadline Unix timestamp after which agent can refund
     */
    function open(
        bytes32 requestId,
        address provider,
        uint256 amount,
        bytes32 hashLock,
        uint64 deadline
    ) external {
        if (amount == 0) revert InvalidAmount();
        if (provider == address(0)) revert InvalidProvider();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (payments[requestId].status != Status.None) revert PaymentExists();

        payments[requestId] = Payment({
            agent: msg.sender,
            provider: provider,
            amount: amount,
            hashLock: hashLock,
            deadline: deadline,
            status: Status.Locked
        });

        paymentToken.safeTransferFrom(msg.sender, address(this), amount);

        emit PaymentLocked(
            requestId,
            msg.sender,
            provider,
            amount,
            hashLock,
            deadline
        );
    }

    /**
     * @notice Claim locked funds by revealing the preimage
     * @param requestId The payment to claim
     * @param preimage The secret that hashes to the stored hashLock
     */
    function claim(bytes32 requestId, bytes32 preimage) external {
        Payment storage payment = payments[requestId];

        if (payment.status != Status.Locked) revert PaymentNotLocked();
        if (msg.sender != payment.provider) revert NotProvider();
        if (block.timestamp > payment.deadline) revert DeadlinePassed();
        if (keccak256(abi.encodePacked(preimage)) != payment.hashLock) revert InvalidPreimage();

        payment.status = Status.Released;

        emit PaymentReleased(requestId, payment.provider, payment.amount, preimage);

        paymentToken.safeTransfer(payment.provider, payment.amount);
    }

    /**
     * @notice Refund locked funds after deadline has passed
     * @param requestId The payment to refund
     */
    function refund(bytes32 requestId) external {
        Payment storage payment = payments[requestId];

        if (payment.status != Status.Locked) revert PaymentNotLocked();
        if (msg.sender != payment.agent) revert NotAgent();
        if (block.timestamp <= payment.deadline) revert DeadlineNotPassed();

        payment.status = Status.Refunded;

        emit PaymentRefunded(requestId, payment.agent, payment.amount);

        paymentToken.safeTransfer(payment.agent, payment.amount);
    }

    // ============ View Functions ============

    function getPayment(bytes32 requestId) external view returns (Payment memory) {
        return payments[requestId];
    }
}
```

**Step 2: Verify compilation**

Run: `cd packages/contracts && npx hardhat compile`
Expected: Compiled successfully

**Step 3: Commit**

```bash
git add packages/contracts/contracts/Escrow.sol
git commit -m "feat(contracts): refactor Escrow from native ETH to ERC20 token"
```

---

### Task 3: Update Escrow Tests for ERC20

**Files:**
- Modify: `packages/contracts/test/Escrow.test.ts`

**Step 1: Rewrite test file**

Key test changes:
1. Fixture deploys MockERC20 (6 decimals) then Escrow(mockToken)
2. Mint tokens to agent, approve escrow before open()
3. Balance checks use `token.balanceOf()` instead of `ethers.provider.getBalance()`
4. `open()` calls no longer include `{ value: amount }`, instead pass `amount` as 3rd arg
5. Amount uses `parseUnits("100", 6)` instead of `parseEther("0.1")`
6. Add test: `should reject if agent has insufficient token allowance`
7. Add test: `constructor rejects zero token address`

```typescript
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('Escrow', function () {
  async function deployEscrowFixture() {
    const [owner, agent, provider, other] = await ethers.getSigners();

    // Deploy MockERC20 (USDC-like: 6 decimals)
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const token = await MockERC20.deploy('Mock USDC', 'USDC', 6);

    // Deploy Escrow with token
    const Escrow = await ethers.getContractFactory('Escrow');
    const escrow = await Escrow.deploy(await token.getAddress());

    // Mint tokens to agent (10,000 USDC)
    const mintAmount = ethers.parseUnits('10000', 6);
    await token.mint(agent.address, mintAmount);

    // Generate test data
    const requestId = ethers.keccak256(ethers.toUtf8Bytes('test-request-1'));
    const preimage = ethers.keccak256(ethers.toUtf8Bytes('secret-key-123'));
    const hashLock = ethers.keccak256(preimage);
    const amount = ethers.parseUnits('100', 6); // 100 USDC
    const deadline = (await time.latest()) + 3600;

    return { escrow, token, owner, agent, provider, other, requestId, preimage, hashLock, amount, deadline, mintAmount };
  }

  describe('constructor', function () {
    it('should store the payment token address', async function () {
      const { escrow, token } = await loadFixture(deployEscrowFixture);
      expect(await escrow.paymentToken()).to.equal(await token.getAddress());
    });

    it('should reject zero token address', async function () {
      const Escrow = await ethers.getContractFactory('Escrow');
      await expect(Escrow.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        await Escrow.deploy(ethers.ZeroAddress).catch(() => Escrow),
        'InvalidToken'
      );
    });
  });

  describe('open()', function () {
    it('should lock tokens with correct parameters', async function () {
      const { escrow, token, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      // Approve escrow to spend tokens
      await token.connect(agent).approve(await escrow.getAddress(), amount);

      await expect(
        escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline)
      ).to.not.be.reverted;

      const payment = await escrow.payments(requestId);
      expect(payment.agent).to.equal(agent.address);
      expect(payment.provider).to.equal(provider.address);
      expect(payment.amount).to.equal(amount);
      expect(payment.hashLock).to.equal(hashLock);
      expect(payment.deadline).to.equal(deadline);
      expect(payment.status).to.equal(1); // Locked
    });

    it('should transfer tokens from agent to escrow', async function () {
      const { escrow, token, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);

      const balanceBefore = await token.balanceOf(agent.address);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);
      const balanceAfter = await token.balanceOf(agent.address);

      expect(balanceBefore - balanceAfter).to.equal(amount);
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(amount);
    });

    it('should emit PaymentLocked event', async function () {
      const { escrow, token, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);

      await expect(
        escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline)
      )
        .to.emit(escrow, 'PaymentLocked')
        .withArgs(requestId, agent.address, provider.address, amount, hashLock, deadline);
    });

    it('should reject zero amount', async function () {
      const { escrow, agent, provider, requestId, hashLock, deadline } =
        await loadFixture(deployEscrowFixture);

      await expect(
        escrow.connect(agent).open(requestId, provider.address, 0, hashLock, deadline)
      ).to.be.revertedWithCustomError(escrow, 'InvalidAmount');
    });

    it('should reject zero provider address', async function () {
      const { escrow, agent, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await expect(
        escrow.connect(agent).open(requestId, ethers.ZeroAddress, amount, hashLock, deadline)
      ).to.be.revertedWithCustomError(escrow, 'InvalidProvider');
    });

    it('should reject deadline in the past', async function () {
      const { escrow, agent, provider, requestId, hashLock, amount } =
        await loadFixture(deployEscrowFixture);

      const pastDeadline = (await time.latest()) - 100;

      await expect(
        escrow.connect(agent).open(requestId, provider.address, amount, hashLock, pastDeadline)
      ).to.be.revertedWithCustomError(escrow, 'InvalidDeadline');
    });

    it('should reject duplicate requestId', async function () {
      const { escrow, token, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount * 2n);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      await expect(
        escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline)
      ).to.be.revertedWithCustomError(escrow, 'PaymentExists');
    });

    it('should revert if agent has insufficient allowance', async function () {
      const { escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      // No approve — should fail
      await expect(
        escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline)
      ).to.be.reverted;
    });
  });

  describe('claim()', function () {
    it('should release tokens to provider with valid preimage', async function () {
      const { escrow, token, agent, provider, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      const providerBefore = await token.balanceOf(provider.address);
      await escrow.connect(provider).claim(requestId, preimage);
      const providerAfter = await token.balanceOf(provider.address);

      expect(providerAfter - providerBefore).to.equal(amount);
      expect(await escrow.payments(requestId).then(p => p.status)).to.equal(2); // Released
    });

    it('should emit PaymentReleased event with preimage', async function () {
      const { escrow, token, agent, provider, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      await expect(escrow.connect(provider).claim(requestId, preimage))
        .to.emit(escrow, 'PaymentReleased')
        .withArgs(requestId, provider.address, amount, preimage);
    });

    it('should reject invalid preimage', async function () {
      const { escrow, token, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      const invalidPreimage = ethers.keccak256(ethers.toUtf8Bytes('wrong-key'));
      await expect(
        escrow.connect(provider).claim(requestId, invalidPreimage)
      ).to.be.revertedWithCustomError(escrow, 'InvalidPreimage');
    });

    it('should reject claim from non-provider', async function () {
      const { escrow, token, agent, provider, other, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      await expect(
        escrow.connect(other).claim(requestId, preimage)
      ).to.be.revertedWithCustomError(escrow, 'NotProvider');
    });

    it('should reject claim after deadline', async function () {
      const { escrow, token, agent, provider, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);
      await time.increaseTo(deadline + 1);

      await expect(
        escrow.connect(provider).claim(requestId, preimage)
      ).to.be.revertedWithCustomError(escrow, 'DeadlinePassed');
    });

    it('should reject claim on non-existent payment', async function () {
      const { escrow, provider, preimage } = await loadFixture(deployEscrowFixture);
      const nonExistentId = ethers.keccak256(ethers.toUtf8Bytes('non-existent'));

      await expect(
        escrow.connect(provider).claim(nonExistentId, preimage)
      ).to.be.revertedWithCustomError(escrow, 'PaymentNotLocked');
    });
  });

  describe('refund()', function () {
    it('should refund tokens to agent after deadline', async function () {
      const { escrow, token, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);
      await time.increaseTo(deadline + 1);

      const agentBefore = await token.balanceOf(agent.address);
      await escrow.connect(agent).refund(requestId);
      const agentAfter = await token.balanceOf(agent.address);

      expect(agentAfter - agentBefore).to.equal(amount);
      expect(await escrow.payments(requestId).then(p => p.status)).to.equal(3); // Refunded
    });

    it('should emit PaymentRefunded event', async function () {
      const { escrow, token, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);
      await time.increaseTo(deadline + 1);

      await expect(escrow.connect(agent).refund(requestId))
        .to.emit(escrow, 'PaymentRefunded')
        .withArgs(requestId, agent.address, amount);
    });

    it('should reject refund before deadline', async function () {
      const { escrow, token, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      await expect(
        escrow.connect(agent).refund(requestId)
      ).to.be.revertedWithCustomError(escrow, 'DeadlineNotPassed');
    });

    it('should reject refund from non-agent', async function () {
      const { escrow, token, agent, provider, other, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);
      await time.increaseTo(deadline + 1);

      await expect(
        escrow.connect(other).refund(requestId)
      ).to.be.revertedWithCustomError(escrow, 'NotAgent');
    });

    it('should reject refund on already claimed payment', async function () {
      const { escrow, token, agent, provider, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);
      await escrow.connect(provider).claim(requestId, preimage);
      await time.increaseTo(deadline + 1);

      await expect(
        escrow.connect(agent).refund(requestId)
      ).to.be.revertedWithCustomError(escrow, 'PaymentNotLocked');
    });
  });

  describe('getPayment()', function () {
    it('should return payment details', async function () {
      const { escrow, token, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      const payment = await escrow.getPayment(requestId);
      expect(payment.agent).to.equal(agent.address);
      expect(payment.provider).to.equal(provider.address);
      expect(payment.amount).to.equal(amount);
      expect(payment.hashLock).to.equal(hashLock);
      expect(payment.deadline).to.equal(deadline);
      expect(payment.status).to.equal(1);
    });
  });
});
```

**Step 2: Run tests**

Run: `cd packages/contracts && npx hardhat test`
Expected: All 20 tests pass (18 original + 2 new: constructor reject, insufficient allowance)

**Step 3: Commit**

```bash
git add packages/contracts/test/Escrow.test.ts
git commit -m "test(contracts): update Escrow tests for ERC20 token payments"
```

---

### Task 4: Update Deploy Script

**Files:**
- Modify: `packages/contracts/scripts/deploy.ts`

**Step 1: Update deploy.ts**

For local/testnet: deploy MockERC20 first, then Escrow(token).
For mainnet: use existing USDC address from env var.

```typescript
import { ethers } from 'hardhat';

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error('No signers available. Set DEPLOYER_PRIVATE_KEY in your .env.production file.');
  }

  const [deployer] = signers;
  console.log('Deploying with account:', deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', ethers.formatEther(balance), 'ETH');

  // Determine payment token address
  let tokenAddress = process.env.PAYMENT_TOKEN_ADDRESS;

  if (!tokenAddress) {
    // No token address provided → deploy MockERC20 (local/testnet)
    console.log('\nNo PAYMENT_TOKEN_ADDRESS set — deploying MockERC20...');
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const token = await MockERC20.deploy('Mock USDC', 'USDC', 6);
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
    console.log('MockERC20 deployed to:', tokenAddress);

    // Mint test tokens to deployer (1,000,000 USDC)
    const mintAmount = ethers.parseUnits('1000000', 6);
    await token.mint(deployer.address, mintAmount);
    console.log(`Minted ${ethers.formatUnits(mintAmount, 6)} USDC to deployer`);
  } else {
    console.log('\nUsing existing token at:', tokenAddress);
  }

  // Deploy Escrow
  const Escrow = await ethers.getContractFactory('Escrow');
  const escrow = await Escrow.deploy(tokenAddress);
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  console.log('Escrow deployed to:', escrowAddress);
  console.log('');
  console.log('Add to your .env:');
  console.log(`PAYMENT_TOKEN_ADDRESS=${tokenAddress}`);
  console.log(`ESCROW_CONTRACT_ADDRESS=${escrowAddress}`);
  console.log(`PAYMENT_TOKEN_DECIMALS=6`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

**Step 2: Test deploy on local Hardhat**

Run: `cd packages/contracts && npx hardhat run scripts/deploy.ts`
Expected: Both MockERC20 and Escrow deploy successfully, addresses printed

**Step 3: Commit**

```bash
git add packages/contracts/scripts/deploy.ts
git commit -m "feat(contracts): update deploy script for ERC20 Escrow"
```

---

### Task 5: Update SDK ABI

**Files:**
- Modify: `packages/sdk/src/abi.ts`

**Step 1: Regenerate ABI from compiled contract**

After compiling the updated Escrow.sol, extract the new ABI.

Key ABI changes:
1. `open()` — no longer `payable`, now has `uint256 amount` as 3rd parameter
2. New `paymentToken()` view function
3. `InvalidToken` error added
4. `TransferFailed` error removed
5. `payments` mapping and `getPayment` struct — unchanged (same fields)
6. Events — unchanged

The new abi.ts should be generated from `packages/contracts/artifacts/contracts/Escrow.sol/Escrow.json` after compilation.

Run: `cd packages/contracts && npx hardhat compile`

Then extract ABI from artifacts and write to `packages/sdk/src/abi.ts`.

**Step 2: Also export a minimal ERC20 ABI for approve calls**

Add to `packages/sdk/src/abi.ts`:

```typescript
export const ERC20ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
```

**Step 3: Update SDK index.ts to export ERC20ABI**

Add `export { EscrowABI, ERC20ABI } from './abi';` to `packages/sdk/src/index.ts`.

**Step 4: Commit**

```bash
git add packages/sdk/src/abi.ts packages/sdk/src/index.ts
git commit -m "feat(sdk): update ABI for ERC20 Escrow + add ERC20ABI"
```

---

### Task 6: Update SDK EscrowClient

**Files:**
- Modify: `packages/sdk/src/escrow.ts`

**Step 1: Update EscrowClient**

Key changes:
1. Add `tokenAddress` to `EscrowClientConfig` (new optional field, env fallback: `PAYMENT_TOKEN_ADDRESS`)
2. In `open()`: call `approve()` on token contract first, then `open()` without `value`
3. `open()` args now include `amount` as 3rd positional arg (matching new Solidity signature)
4. Remove `parseEther` import — amounts are passed as `bigint` (already in smallest unit)
5. Add `getTokenAddress()` public getter

Changes to `escrow.ts`:
- `EscrowClientConfig`: add `tokenAddress?: \`0x${string}\``
- Constructor: resolve tokenAddress from config or `PAYMENT_TOKEN_ADDRESS` env
- `open()`: two-step: approve then open
- No `value` field in writeContract

```typescript
// Key diff for open():

async open(params: OpenParams): Promise<`0x${string}`> {
  const amount = typeof params.amount === 'string'
    ? BigInt(params.amount)
    : params.amount;

  // Step 1: Approve escrow to spend tokens
  await this.walletClient.writeContract({
    address: this.tokenAddress,
    abi: ERC20ABI,
    functionName: 'approve',
    args: [this.escrowAddress, amount],
    chain: this.chain,
    account: this.account,
  });

  // Step 2: Lock tokens in escrow
  const hash = await this.walletClient.writeContract({
    address: this.escrowAddress,
    abi: EscrowABI,
    functionName: 'open',
    args: [params.requestId, params.provider, amount, params.hashLock, params.deadline],
    chain: this.chain,
    account: this.account,
  });

  return hash;
}
```

**Step 2: Update OpenParams**

`amount` field stays `bigint | string` but string is now raw smallest-unit string (not ETH decimal).

**Step 3: Commit**

```bash
git add packages/sdk/src/escrow.ts
git commit -m "feat(sdk): update EscrowClient for ERC20 approve+open flow"
```

---

### Task 7: Update SDK Types and Discovery

**Files:**
- Modify: `packages/sdk/src/types.ts` — no changes needed (asset is already `string`)
- Modify: `packages/sdk/src/discovery.ts:84` — change default from `'ETH'` to `'USDC'`

**Step 1: Update default asset**

In `packages/sdk/src/discovery.ts:84`:
```typescript
// Before:
asset: (row.pricing_asset as string) || 'ETH',
// After:
asset: (row.pricing_asset as string) || 'USDC',
```

**Step 2: Commit**

```bash
git add packages/sdk/src/discovery.ts
git commit -m "feat(sdk): default pricing asset to USDC"
```

---

### Task 8: Update Gateway — invoke/route.ts

**Files:**
- Modify: `apps/frontend/src/app/api/gateway/invoke/route.ts`

**Step 1: Replace parseEther with parseUnits**

Line 2 and line 82:
```typescript
// Before:
import { parseEther } from 'viem';
// ...
const amount = parseEther(service.pricingAmount).toString();

// After:
import { parseUnits } from 'viem';
// ...
const decimals = parseInt(process.env.PAYMENT_TOKEN_DECIMALS || '6', 10);
const amount = parseUnits(service.pricingAmount, decimals).toString();
```

No other changes needed — the gateway already stores amounts as strings, and the claim flow calls the contract which handles ERC20 internally.

**Step 2: Commit**

```bash
git add apps/frontend/src/app/api/gateway/invoke/route.ts
git commit -m "feat(gateway): use parseUnits for ERC20 token decimals"
```

---

### Task 9: Update Gateway — state-machine.ts

**Files:**
- Modify: `apps/frontend/src/lib/gateway/state-machine.ts`

**Step 1: Update chain nativeCurrency (cosmetic)**

Line 197:
```typescript
// Before:
nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
// After:
nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, // chain native coin — not the payment token
```

No functional changes needed. The gateway:
- Creates challenges → amounts are stored as strings (already correct)
- Verifies escrow locked → calls `getPayment()` which returns status (unchanged)
- Claims payment → calls `claim(requestId, preimage)` on the contract (unchanged)

The ERC20 token handling is fully encapsulated in the Escrow contract. The gateway doesn't need to approve or transfer tokens directly — it only calls `claim()` which triggers the contract to `safeTransfer`.

**Step 2: No commit needed (cosmetic only — skip if preferred)**

---

### Task 10: Update Environment Variables

**Files:**
- Modify: `.env.example`
- Modify: `.env.development`

**Step 1: Add token vars to .env.example**

After `ESCROW_CONTRACT_ADDRESS=` line, add:
```bash
PAYMENT_TOKEN_ADDRESS=                     # ERC20 payment token address (MockUSDC for dev, real USDC for prod)
PAYMENT_TOKEN_DECIMALS=6                   # Token decimals (6 for USDC/USDT)
```

Add `NEXT_PUBLIC_` duplicates:
```bash
NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=
NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS=6
```

**Step 2: Add token vars to .env.development**

After `ESCROW_CONTRACT_ADDRESS=...` line:
```bash
PAYMENT_TOKEN_ADDRESS=                     # Set after running deploy:local (MockERC20 address)
PAYMENT_TOKEN_DECIMALS=6
```

**Step 3: Commit**

```bash
git add .env.example .env.development
git commit -m "feat(config): add PAYMENT_TOKEN_ADDRESS and PAYMENT_TOKEN_DECIMALS env vars"
```

---

### Task 11: Update SDK Tests

**Files:**
- Modify: `packages/sdk/test/escrow.test.ts`
- Modify: `packages/sdk/test/gateway.test.ts`

**Step 1: Update escrow.test.ts**

Add `tokenAddress` to mockConfig:
```typescript
const mockConfig = {
  privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`,
  rpcUrl: 'http://127.0.0.1:8545',
  escrowAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as `0x${string}`,
  tokenAddress: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as `0x${string}`,
};
```

Add test for tokenAddress env fallback and missing tokenAddress error.

**Step 2: Run SDK tests**

Run: `cd packages/sdk && pnpm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add packages/sdk/test/escrow.test.ts packages/sdk/test/gateway.test.ts
git commit -m "test(sdk): update tests for ERC20 token configuration"
```

---

### Task 12: Update turbo.json + Run Full Test Suite

**Files:**
- Modify: `turbo.json` (add PAYMENT_TOKEN_ADDRESS, PAYMENT_TOKEN_DECIMALS to globalPassThroughEnv)

**Step 1: Update turbo.json**

Add to `globalPassThroughEnv` array:
```json
"PAYMENT_TOKEN_ADDRESS",
"PAYMENT_TOKEN_DECIMALS"
```

**Step 2: Run all tests**

Run: `pnpm test` (from repo root)
Expected: All tests pass across contracts, SDK, indexer, provider

**Step 3: Final commit**

```bash
git add turbo.json
git commit -m "feat: complete ERC20 USDC payment token migration"
```

---

### Task 13: Update Architecture Documentation

**Files:**
- Modify: `memory-bank/architecture.md`

**Step 1: Update architecture doc**

Update sections:
- 3.2 Escrow Contract: mention ERC20 + constructor param
- Section 4 key flow: mention approve step
- Mention PAYMENT_TOKEN_ADDRESS env var

**Step 2: Commit**

```bash
git add memory-bank/architecture.md
git commit -m "docs: update architecture for ERC20 payment token"
```

---

## Execution Checklist

- [ ] Task 1: Install OpenZeppelin + MockERC20
- [ ] Task 2: Refactor Escrow.sol to ERC20
- [ ] Task 3: Update Escrow tests
- [ ] Task 4: Update deploy script
- [ ] Task 5: Update SDK ABI
- [ ] Task 6: Update SDK EscrowClient
- [ ] Task 7: Update SDK discovery default asset
- [ ] Task 8: Update Gateway invoke route
- [ ] Task 9: Update Gateway state-machine (cosmetic)
- [ ] Task 10: Update env vars
- [ ] Task 11: Update SDK tests
- [ ] Task 12: Update turbo.json + full test run
- [ ] Task 13: Update architecture docs
