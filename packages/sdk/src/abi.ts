// Escrow contract ABI - extracted from compiled contract
export const EscrowABI = [
  {
    inputs: [],
    name: 'DeadlineNotPassed',
    type: 'error',
  },
  {
    inputs: [],
    name: 'DeadlinePassed',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidAmount',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidDeadline',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidPreimage',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidProvider',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotAgent',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotProvider',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PaymentExists',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PaymentNotLocked',
    type: 'error',
  },
  {
    inputs: [],
    name: 'TransferFailed',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'requestId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'agent',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'provider',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'hashLock',
        type: 'bytes32',
      },
      {
        indexed: false,
        internalType: 'uint64',
        name: 'deadline',
        type: 'uint64',
      },
    ],
    name: 'PaymentLocked',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'requestId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'agent',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'PaymentRefunded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'requestId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'provider',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'preimage',
        type: 'bytes32',
      },
    ],
    name: 'PaymentReleased',
    type: 'event',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'requestId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'preimage',
        type: 'bytes32',
      },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'requestId',
        type: 'bytes32',
      },
    ],
    name: 'getPayment',
    outputs: [
      {
        components: [
          {
            internalType: 'address',
            name: 'agent',
            type: 'address',
          },
          {
            internalType: 'address',
            name: 'provider',
            type: 'address',
          },
          {
            internalType: 'uint256',
            name: 'amount',
            type: 'uint256',
          },
          {
            internalType: 'bytes32',
            name: 'hashLock',
            type: 'bytes32',
          },
          {
            internalType: 'uint64',
            name: 'deadline',
            type: 'uint64',
          },
          {
            internalType: 'uint8',
            name: 'status',
            type: 'uint8',
          },
        ],
        internalType: 'struct Escrow.Payment',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'requestId',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'provider',
        type: 'address',
      },
      {
        internalType: 'bytes32',
        name: 'hashLock',
        type: 'bytes32',
      },
      {
        internalType: 'uint64',
        name: 'deadline',
        type: 'uint64',
      },
    ],
    name: 'open',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    name: 'payments',
    outputs: [
      {
        internalType: 'address',
        name: 'agent',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'provider',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
      {
        internalType: 'bytes32',
        name: 'hashLock',
        type: 'bytes32',
      },
      {
        internalType: 'uint64',
        name: 'deadline',
        type: 'uint64',
      },
      {
        internalType: 'uint8',
        name: 'status',
        type: 'uint8',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'requestId',
        type: 'bytes32',
      },
    ],
    name: 'refund',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
