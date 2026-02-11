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
    <div className="card rounded-2xl p-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Fund Your Wallet
          </h2>
          <p className="text-gray-500 text-sm">Deposit ETH to your embedded wallet</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Balance */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50">
          <span className="text-gray-500 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
            Balance
          </span>
          <span className="text-xl font-bold text-gray-900">
            {balance !== null ? (
              <span className="flex items-center gap-2">
                {parseFloat(balance).toFixed(6)}
                <span className="text-sm text-gray-500">ETH</span>
              </span>
            ) : (
              <span className="text-gray-400">Loading...</span>
            )}
          </span>
        </div>

        {/* Address + Copy */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50">
          <span className="text-gray-500 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Address
          </span>
          <div className="flex items-center gap-3">
            <code className="text-sm font-mono text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg">
              {embeddedAddress.slice(0, 8)}...{embeddedAddress.slice(-6)}
            </code>
            <button
              onClick={copyAddress}
              className="p-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {copied ? (
                <svg
                  className="w-5 h-5 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-4 text-sm text-gray-500">
              Transfer from External Wallet
            </span>
          </div>
        </div>

        {/* External Wallet Section */}
        {!externalWallet ? (
          <button
            onClick={() => linkWallet()}
            className="w-full btn-secondary flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Connect External Wallet
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <span className="text-sm text-gray-500">From</span>
              <span className="text-sm font-mono text-gray-900">
                {externalWallet.walletClientType} ({externalWallet.address.slice(0, 6)}...
                {externalWallet.address.slice(-4)})
              </span>
            </div>

            <div className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.01"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  ETH
                </span>
              </div>
              <button
                onClick={handleDeposit}
                disabled={txStatus === 'pending'}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {txStatus === 'pending' ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 11l5-5m0 0l5 5m-5-5v12"
                      />
                    </svg>
                    Deposit
                  </>
                )}
              </button>
            </div>

            {/* Transaction Status */}
            {txStatus === 'success' && txHash && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-emerald-600 mb-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="font-medium">Transaction Confirmed</span>
                </div>
                <code className="text-xs font-mono text-emerald-700">
                  {txHash.slice(0, 20)}...{txHash.slice(-8)}
                </code>
              </div>
            )}
            {txStatus === 'error' && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2 text-red-600 mb-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="font-medium">Transaction Failed</span>
                </div>
                {txError && <p className="text-xs text-red-500 break-all">{txError}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
