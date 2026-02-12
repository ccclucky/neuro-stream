export const rpcUrl = process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'http://127.0.0.1:8545';
export const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337);
export const tokenAddress = process.env.NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS || '';
export const tokenDecimals = Number(process.env.NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS || 6);

export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;
