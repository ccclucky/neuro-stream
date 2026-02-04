import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('Escrow', function () {
  // Test fixtures
  async function deployEscrowFixture() {
    const [owner, agent, provider, other] = await ethers.getSigners();

    const Escrow = await ethers.getContractFactory('Escrow');
    const escrow = await Escrow.deploy();

    // Generate test data
    const requestId = ethers.keccak256(ethers.toUtf8Bytes('test-request-1'));
    const preimage = ethers.keccak256(ethers.toUtf8Bytes('secret-key-123'));
    const hashLock = ethers.keccak256(preimage);
    const amount = ethers.parseEther('0.1');
    const deadline = (await time.latest()) + 3600; // 1 hour from now

    return { escrow, owner, agent, provider, other, requestId, preimage, hashLock, amount, deadline };
  }

  describe('open()', function () {
    it('should lock funds with correct parameters', async function () {
      const { escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await expect(
        escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount })
      ).to.not.be.reverted;

      const payment = await escrow.payments(requestId);
      expect(payment.agent).to.equal(agent.address);
      expect(payment.provider).to.equal(provider.address);
      expect(payment.amount).to.equal(amount);
      expect(payment.hashLock).to.equal(hashLock);
      expect(payment.deadline).to.equal(deadline);
      expect(payment.status).to.equal(1); // Status.Locked
    });

    it('should emit PaymentLocked event', async function () {
      const { escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await expect(
        escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount })
      )
        .to.emit(escrow, 'PaymentLocked')
        .withArgs(requestId, agent.address, provider.address, amount, hashLock, deadline);
    });

    it('should reject zero amount', async function () {
      const { escrow, agent, provider, requestId, hashLock, deadline } =
        await loadFixture(deployEscrowFixture);

      await expect(
        escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: 0 })
      ).to.be.revertedWithCustomError(escrow, 'InvalidAmount');
    });

    it('should reject zero provider address', async function () {
      const { escrow, agent, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await expect(
        escrow.connect(agent).open(requestId, ethers.ZeroAddress, hashLock, deadline, { value: amount })
      ).to.be.revertedWithCustomError(escrow, 'InvalidProvider');
    });

    it('should reject deadline in the past', async function () {
      const { escrow, agent, provider, requestId, hashLock, amount } =
        await loadFixture(deployEscrowFixture);

      const pastDeadline = (await time.latest()) - 100;

      await expect(
        escrow.connect(agent).open(requestId, provider.address, hashLock, pastDeadline, { value: amount })
      ).to.be.revertedWithCustomError(escrow, 'InvalidDeadline');
    });

    it('should reject duplicate requestId', async function () {
      const { escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount });

      await expect(
        escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount })
      ).to.be.revertedWithCustomError(escrow, 'PaymentExists');
    });
  });

  describe('claim()', function () {
    it('should release funds to provider with valid preimage', async function () {
      const { escrow, agent, provider, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount });

      const providerBalanceBefore = await ethers.provider.getBalance(provider.address);

      await expect(escrow.connect(provider).claim(requestId, preimage)).to.not.be.reverted;

      const providerBalanceAfter = await ethers.provider.getBalance(provider.address);
      // Provider balance should increase (minus gas costs)
      expect(providerBalanceAfter).to.be.greaterThan(providerBalanceBefore);

      const payment = await escrow.payments(requestId);
      expect(payment.status).to.equal(2); // Status.Released
    });

    it('should emit PaymentReleased event with preimage', async function () {
      const { escrow, agent, provider, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount });

      await expect(escrow.connect(provider).claim(requestId, preimage))
        .to.emit(escrow, 'PaymentReleased')
        .withArgs(requestId, provider.address, amount, preimage);
    });

    it('should reject invalid preimage', async function () {
      const { escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount });

      const invalidPreimage = ethers.keccak256(ethers.toUtf8Bytes('wrong-key'));

      await expect(
        escrow.connect(provider).claim(requestId, invalidPreimage)
      ).to.be.revertedWithCustomError(escrow, 'InvalidPreimage');
    });

    it('should reject claim from non-provider', async function () {
      const { escrow, agent, provider, other, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount });

      await expect(
        escrow.connect(other).claim(requestId, preimage)
      ).to.be.revertedWithCustomError(escrow, 'NotProvider');
    });

    it('should reject claim after deadline', async function () {
      const { escrow, agent, provider, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount });

      // Move time past deadline
      await time.increaseTo(deadline + 1);

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

  describe('refund()', function () {
    it('should refund agent after deadline', async function () {
      const { escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount });

      // Move time past deadline
      await time.increaseTo(deadline + 1);

      const agentBalanceBefore = await ethers.provider.getBalance(agent.address);

      await expect(escrow.connect(agent).refund(requestId)).to.not.be.reverted;

      const agentBalanceAfter = await ethers.provider.getBalance(agent.address);
      // Agent balance should increase (minus gas costs)
      expect(agentBalanceAfter).to.be.greaterThan(agentBalanceBefore);

      const payment = await escrow.payments(requestId);
      expect(payment.status).to.equal(3); // Status.Refunded
    });

    it('should emit PaymentRefunded event', async function () {
      const { escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount });

      await time.increaseTo(deadline + 1);

      await expect(escrow.connect(agent).refund(requestId))
        .to.emit(escrow, 'PaymentRefunded')
        .withArgs(requestId, agent.address, amount);
    });

    it('should reject refund before deadline', async function () {
      const { escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount });

      await expect(
        escrow.connect(agent).refund(requestId)
      ).to.be.revertedWithCustomError(escrow, 'DeadlineNotPassed');
    });

    it('should reject refund from non-agent', async function () {
      const { escrow, agent, provider, other, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount });

      await time.increaseTo(deadline + 1);

      await expect(
        escrow.connect(other).refund(requestId)
      ).to.be.revertedWithCustomError(escrow, 'NotAgent');
    });

    it('should reject refund on already claimed payment', async function () {
      const { escrow, agent, provider, requestId, preimage, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount });
      await escrow.connect(provider).claim(requestId, preimage);

      await time.increaseTo(deadline + 1);

      await expect(
        escrow.connect(agent).refund(requestId)
      ).to.be.revertedWithCustomError(escrow, 'PaymentNotLocked');
    });
  });

  describe('getPayment()', function () {
    it('should return payment details', async function () {
      const { escrow, agent, provider, requestId, hashLock, amount, deadline } =
        await loadFixture(deployEscrowFixture);

      await escrow.connect(agent).open(requestId, provider.address, hashLock, deadline, { value: amount });

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
