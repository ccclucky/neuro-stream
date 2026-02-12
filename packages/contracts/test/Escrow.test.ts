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

    // Deploy Escrow with token address
    const Escrow = await ethers.getContractFactory('Escrow');
    const escrow = await Escrow.deploy(await token.getAddress());

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
    };
  }

  // ============ constructor ============

  describe('constructor', function () {
    it('should store the payment token address', async function () {
      const { token, escrow } = await loadFixture(deployEscrowFixture);

      expect(await escrow.paymentToken()).to.equal(await token.getAddress());
    });

    it('should reject zero token address', async function () {
      const Escrow = await ethers.getContractFactory('Escrow');

      await expect(
        Escrow.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(Escrow, 'InvalidToken');
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
    it('should release tokens to provider with valid preimage', async function () {
      const { token, escrow, agent, provider, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      // Setup: approve + open
      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      const providerBalanceBefore = await token.balanceOf(provider.address);

      await escrow.connect(provider).claim(requestId, preimage);

      const providerBalanceAfter = await token.balanceOf(provider.address);
      expect(providerBalanceAfter - providerBalanceBefore).to.equal(amount);

      const payment = await escrow.payments(requestId);
      expect(payment.status).to.equal(2); // Status.Released
    });

    it('should emit PaymentReleased event with preimage', async function () {
      const { token, escrow, agent, provider, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await token.connect(agent).approve(await escrow.getAddress(), amount);
      await escrow.connect(agent).open(requestId, provider.address, amount, hashLock, deadline);

      await expect(escrow.connect(provider).claim(requestId, preimage))
        .to.emit(escrow, 'PaymentReleased')
        .withArgs(requestId, provider.address, amount, preimage);
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

      // Move time past deadline
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
