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
    address public immutable platform;
    uint256 public immutable feeBps; // basis points, e.g. 200 = 2%
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

    event PlatformFeeCollected(
        bytes32 indexed requestId,
        address indexed platform,
        uint256 fee
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
    error InvalidPlatform();
    error InvalidFeeBps();

    // ============ Constructor ============

    constructor(IERC20 _paymentToken, address _platform, uint256 _feeBps) {
        if (address(_paymentToken) == address(0)) revert InvalidToken();
        if (_platform == address(0)) revert InvalidPlatform();
        if (_feeBps > 5000) revert InvalidFeeBps(); // max 50%
        paymentToken = _paymentToken;
        platform = _platform;
        feeBps = _feeBps;
    }

    // ============ External Functions ============

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

    function refund(bytes32 requestId) external {
        Payment storage payment = payments[requestId];

        if (payment.status != Status.Locked) revert PaymentNotLocked();
        if (msg.sender != payment.agent) revert NotAgent();
        if (block.timestamp <= payment.deadline) revert DeadlineNotPassed();

        payment.status = Status.Refunded;

        emit PaymentRefunded(requestId, payment.agent, payment.amount);

        paymentToken.safeTransfer(payment.agent, payment.amount);
    }

    function getPayment(bytes32 requestId) external view returns (Payment memory) {
        return payments[requestId];
    }
}
