// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Escrow
 * @notice Escrow contract for NeuroStream Agent-to-Provider payments
 * @dev Uses hashlock mechanism to ensure atomic swap between payment and content delivery
 *
 * Flow:
 * 1. Agent calls open() to lock funds with a hashLock H
 * 2. Provider delivers encrypted content
 * 3. Provider calls claim() with preimage k where hash(k) == H
 * 4. If provider doesn't claim before deadline, agent can refund()
 */
contract Escrow {
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
        uint256 amount;     // Amount locked
        bytes32 hashLock;   // keccak256(preimage) - provider must reveal preimage to claim
        uint64 deadline;    // After this time, agent can refund
        Status status;      // Current payment status
    }

    // ============ State ============

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
    error TransferFailed();

    // ============ External Functions ============

    /**
     * @notice Lock funds for a service request
     * @param requestId Unique identifier for this payment
     * @param provider Address that can claim the funds
     * @param hashLock keccak256(preimage) - provider must know preimage to claim
     * @param deadline Unix timestamp after which agent can refund
     */
    function open(
        bytes32 requestId,
        address provider,
        bytes32 hashLock,
        uint64 deadline
    ) external payable {
        if (msg.value == 0) revert InvalidAmount();
        if (provider == address(0)) revert InvalidProvider();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (payments[requestId].status != Status.None) revert PaymentExists();

        payments[requestId] = Payment({
            agent: msg.sender,
            provider: provider,
            amount: msg.value,
            hashLock: hashLock,
            deadline: deadline,
            status: Status.Locked
        });

        emit PaymentLocked(
            requestId,
            msg.sender,
            provider,
            msg.value,
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

        (bool success, ) = payment.provider.call{value: payment.amount}("");
        if (!success) revert TransferFailed();
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

        (bool success, ) = payment.agent.call{value: payment.amount}("");
        if (!success) revert TransferFailed();
    }

    // ============ View Functions ============

    /**
     * @notice Get payment details
     * @param requestId The payment to query
     * @return Payment struct with all details
     */
    function getPayment(bytes32 requestId) external view returns (Payment memory) {
        return payments[requestId];
    }
}
