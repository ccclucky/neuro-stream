'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, formatEther, http, parseEther, numberToHex } from 'viem';

const rpcUrl = process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'http://127.0.0.1:8545';
const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337);

interface DepositProps {
  embeddedAddress: string;
}

export function Deposit({ embeddedAddress }: DepositProps) {
  const { linkWallet } = usePrivy();
  const { wallets } = useWallets();

  const [balance, setBalance] = useState<string | null>(null);
  const [amount, setAmount] = useState('0.01');
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const externalWallet = wallets.find((w) => w.walletClientType !== 'privy');

  const fetchBalance = useCallback(async () => {
    if (!embeddedAddress) return;
    try {
      const client = createPublicClient({ transport: http(rpcUrl) });
      const bal = await client.getBalance({ address: embeddedAddress as `0x${string}` });
      setBalance(formatEther(bal));
    } catch {
      setBalance(null);
    }
  }, [embeddedAddress]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const copyAddress = () => {
    navigator.clipboard.writeText(embeddedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeposit = async () => {
    if (!externalWallet) return;

    const parsedAmount = parseEther(amount);
    if (parsedAmount <= 0n) return;

    setTxStatus('pending');
    setTxHash(null);
    setTxError(null);

    try {
      // Ensure the external wallet is on the correct chain
      await externalWallet.switchChain(targetChainId);

      // Get EIP-1193 provider from the external wallet directly
      const provider = await externalWallet.getEthereumProvider();

      // Send transaction via the external wallet's provider
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: externalWallet.address as `0x${string}`,
            to: embeddedAddress as `0x${string}`,
            value: numberToHex(parsedAmount),
          },
        ],
      });

      setTxHash(hash as string);
      setTxStatus('success');
      setTimeout(fetchBalance, 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Deposit] sendTransaction failed:', msg);
      setTxError(msg);
      setTxStatus('error');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Fund Your Wallet</h2>

      <div className="space-y-4">
        {/* Balance */}
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Balance:</span>
          <span className="font-medium text-gray-900">
            {balance !== null ? `${balance} ETH` : 'Loading...'}
          </span>
        </div>

        {/* Address + Copy */}
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Address:</span>
          <div className="flex items-center space-x-2">
            <code className="text-sm bg-gray-100 px-3 py-1 rounded font-mono">
              {embeddedAddress.slice(0, 8)}...{embeddedAddress.slice(-6)}
            </code>
            <button
              onClick={copyAddress}
              className="text-indigo-600 hover:text-indigo-800 text-sm"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-3 text-gray-400">Transfer from External Wallet</span>
          </div>
        </div>

        {/* External Wallet Section */}
        {!externalWallet ? (
          <button
            onClick={() => linkWallet()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium"
          >
            Connect External Wallet
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">From:</span>
              <span className="font-mono text-gray-700">
                {externalWallet.walletClientType} ({externalWallet.address.slice(0, 8)}...
                {externalWallet.address.slice(-6)})
              </span>
            </div>

            <div className="flex space-x-2">
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.01"
                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              <span className="flex items-center text-sm text-gray-500">ETH</span>
              <button
                onClick={handleDeposit}
                disabled={txStatus === 'pending'}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {txStatus === 'pending' ? 'Sending...' : 'Deposit'}
              </button>
            </div>

            {/* Transaction Status */}
            {txStatus === 'success' && txHash && (
              <div className="text-sm text-green-700 bg-green-50 rounded-lg p-3">
                Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)} Confirmed
              </div>
            )}
            {txStatus === 'error' && (
              <div className="text-sm text-red-700 bg-red-50 rounded-lg p-3">
                <div className="font-medium">Transaction failed</div>
                {txError && <div className="mt-1 text-xs text-red-600 break-all">{txError}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
