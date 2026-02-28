import { defineChain } from 'viem';

export const rpcUrl = process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'http://127.0.0.1:8545';
export const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337);
export const tokenAddress = process.env.NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS || '';
export const tokenDecimals = Number(process.env.NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS || 6);

export const appChain = defineChain({
  id: targetChainId,
  name: process.env.NEXT_PUBLIC_CHAIN_NAME || 'Monad Testnet',
  nativeCurrency: {
    name: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_NAME || 'MON',
    symbol: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_SYMBOL || 'MON',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
  blockExplorers: {
    default: {
      name: 'Explorer',
      url: process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL || 'https://testnet.monadexplorer.com',
    },
  },
  testnet: targetChainId !== 1,
});

export const explorerUrl = appChain.blockExplorers?.default?.url || '';
export function txUrl(hash: string): string {
  return explorerUrl ? `${explorerUrl}/tx/${hash}` : '';
}

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
