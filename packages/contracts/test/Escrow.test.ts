import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('Escrow', function () {
  // ============ Fixture ============

  async function deployEscrowFixture() {
    const [owner, agent, provider, other] = await ethers.getSigners();

    // Deploy MockERC20 (6 decimals, like USDC)
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const token = await MockERC20.deploy('Mock USDC', 'USDC', 6);

    // Deploy Escrow with token, platform (owner), and 2% fee (200 bps)
    const Escrow = await ethers.getContractFactory('Escrow');
    const feeBps = 200; // 2%
    const escrow = await Escrow.deploy(await token.getAddress(), owner.address, feeBps);

    // Mint 10,000 USDC to agent
    await token.mint(agent.address, ethers.parseUnits('10000', 6));

    // Generate test data
    const requestId = ethers.keccak256(ethers.toUtf8Bytes('test-request-1'));
    const preimage = ethers.keccak256(ethers.toUtf8Bytes('secret-key-123'));
    const hashLock = ethers.keccak256(preimage);
    const amount = ethers.parseUnits('100', 6); // 100 USDC
    const deadline = BigInt((await time.latest()) + 3600); // 1 hour from now

    return {
      token,
      escrow,
      owner,
      agent,
      provider,
      other,
      requestId,
      preimage,
      hashLock,
      amount,
      deadline,
      feeBps,
    };
  }

  // ============ constructor ============

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

  // ============ open() ============

  describe('open()', function () {
    it('should lock tokens with correct parameters', async function () {
      const { token, escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      // Approve escrow to spend agent's tokens
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
      expect(payment.status).to.equal(1); // Status.Locked
    });

    it('should transfer tokens from agent to escrow', async function () {
      const { token, escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      const escrowAddress = await escrow.getAddress();

      const agentBalanceBefore = await token.balanceOf(agent.address);
      const escrowBalanceBefore = await token.balanceOf(escrowAddress);

      await token.connect(agent).approve(escrowAddress, amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      const agentBalanceAfter = await token.balanceOf(agent.address);
      const escrowBalanceAfter = await token.balanceOf(escrowAddress);

      expect(agentBalanceBefore - agentBalanceAfter).to.equal(amount);
      expect(escrowBalanceAfter - escrowBalanceBefore).to.equal(amount);
    });

    it('should emit PaymentLocked event', async function () {
      const { token, escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);

      await expect(
        escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline)
      )
        .to.emit(escrow, 'PaymentLocked')
        .withArgs(requestId, agent.address, provider.address, amount, hashLock, deadline);
    });

    it('should reject zero amount', async function () {
      const { token, escrow, agent, provider, requestId, hashLock, deadline } =
        await loadFixture(deployEscrowFixture);

      await expect(
        escrow.connect(agent).open(requestId, provider.address, 0, hashLock, deadline)
      ).to.be.revertedWithCustomError(escrow, 'InvalidAmount');
    });

    it('should reject zero provider address', async function () {
      const { token, escrow, agent, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);

      await expect(
        escrow.connect(agent).open(requestId, ethers.ZeroAddress, amount, hashLock, deadline)
      ).to.be.revertedWithCustomError(escrow, 'InvalidProvider');
    });

    it('should reject deadline in the past', async function () {
      const { token, escrow, agent, provider, requestId, hashLock, amount } =
        await loadFixture(deployEscrowFixture);

      const pastDeadline = BigInt((await time.latest()) - 100);

      await token.connect(agent).approve(await escrow.getAddress(), amount);

      await expect(
        escrow.connect(agent).open(requestId, provider.address, amount, hashLock, pastDeadline)
      ).to.be.revertedWithCustomError(escrow, 'InvalidDeadline');
    });

    it('should reject duplicate requestId', async function () {
      const { token, escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      const escrowAddress = await escrow.getAddress();

      // First open succeeds
      await token.connect(agent).approve(escrowAddress, amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      // Second open with same requestId fails
      await token.connect(agent).approve(escrowAddress, amount);
      await expect(
        escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline)
      ).to.be.revertedWithCustomError(escrow, 'PaymentExists');
    });

    it('should revert if agent has insufficient allowance', async function () {
      const { escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      // Do NOT approve — allowance is zero
      await expect(
        escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline)
      ).to.be.reverted; // SafeERC20 will revert on insufficient allowance
    });
  });

  // ============ claim() ============

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

  // ============ refund() ============

  describe('refund()', function () {
    it('should refund tokens to agent after deadline', async function () {
      const { token, escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      // Move time past deadline
      await time.increaseTo(deadline + 1n);

      const agentBalanceBefore = await token.balanceOf(agent.address);

      await escrow.connect(agent).refund(requestId);

      const agentBalanceAfter = await token.balanceOf(agent.address);
      expect(agentBalanceAfter - agentBalanceBefore).to.equal(amount);

      const payment = await escrow.payments(requestId);
      expect(payment.status).to.equal(3); // Status.Refunded
    });

    it('should emit PaymentRefunded event', async function () {
      const { token, escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      await time.increaseTo(deadline + 1n);

      await expect(escrow.connect(agent).refund(requestId))
        .to.emit(escrow, 'PaymentRefunded')
        .withArgs(requestId, agent.address, amount);
    });

    it('should reject refund before deadline', async function () {
      const { token, escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      await expect(
        escrow.connect(agent).refund(requestId)
      ).to.be.revertedWithCustomError(escrow, 'DeadlineNotPassed');
    });

    it('should reject refund from non-agent', async function () {
      const { token, escrow, agent, provider, other, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      await time.increaseTo(deadline + 1n);

      await expect(
        escrow.connect(other).refund(requestId)
      ).to.be.revertedWithCustomError(escrow, 'NotAgent');
    });

    it('should reject refund on already claimed payment', async function () {
      const { token, escrow, agent, provider, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);
      await escrow.connect(provider).claim(requestId, preimage);

      await time.increaseTo(deadline + 1n);

      await expect(
        escrow.connect(agent).refund(requestId)
      ).to.be.revertedWithCustomError(escrow, 'PaymentNotLocked');
    });
  });

  // ============ getPayment() ============

  describe('getPayment()', function () {
    it('should return payment details', async function () {
      const { token, escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      const payment = await escrow.getPayment(requestId);
      expect(payment.agent).to.equal(agent.address);
      expect(payment.provider).to.equal(provider.address);
      expect(payment.amount).to.equal(amount);
      expect(payment.hashLock).to.equal(hashLock);
      expect(payment.deadline).to.equal(deadline);
      expect(payment.status).to.equal(1); // Status.Locked
    });
  });
});
