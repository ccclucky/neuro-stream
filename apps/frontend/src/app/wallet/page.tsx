'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  http,
  parseUnits,
} from 'viem';
import { useEmbeddedWallet } from '@/lib/useEmbeddedWallet';
import { isSupabaseConfigured, supabaseFetch } from '@/lib/supabase';
import {
  rpcUrl,
  targetChainId,
  tokenAddress,
  tokenDecimals,
  ERC20_ABI,
} from '@/lib/constants';

// --- Types ---

type Tab = 'deposit-usdc' | 'withdraw-usdc';

interface WalletTx {
  id: string;
  type: 'deposit' | 'withdraw';
  asset: string;
  amount: string;
  tx_hash: string;
  created_at: string;
}

interface GatewayChallenge {
  request_id: string;
  amount: string;
  status: string;
  created_at: string;
  claim_tx_hash: string | null;
}

interface MergedTx {
  id: string;
  kind: 'deposit' | 'withdraw' | 'service';
  asset: string;
  amount: string;
  txHash: string;
  createdAt: string;
}

// --- Helpers ---

function formatTokenAmount(raw: string): string {
  const num = BigInt(raw);
  const amount = Number(num) / 1e6;
  return amount.toFixed(2);
}

function shortenHash(hash: string): string {
  if (!hash || hash.length < 16) return hash || '';
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

const kindConfig: Record<string, { bg: string; text: string; label: string }> = {
  deposit: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-600', label: 'Deposit' },
  withdraw: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-600', label: 'Withdraw' },
  service: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-600', label: 'Service Payment' },
};

// --- Component ---

export default function WalletPage() {
  const { login, authenticated, linkWallet } = usePrivy();
  const { wallets } = useWallets();
  const { embeddedAddress, embeddedWallet } = useEmbeddedWallet();

  const [activeTab, setActiveTab] = useState<Tab>('deposit-usdc');
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Transaction history
  const [transactions, setTransactions] = useState<MergedTx[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  const externalWallet = wallets.find((w) => w.walletClientType !== 'privy');

  // --- Fetch Balances ---

  const fetchBalances = useCallback(async () => {
    if (!embeddedAddress) return;
    try {
      const client = createPublicClient({ transport: http(rpcUrl) });

      // USDC balance
      if (tokenAddress) {
        const usdcBal = await client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [embeddedAddress as `0x${string}`],
        });
        setUsdcBalance(formatUnits(usdcBal, tokenDecimals));
      }
    } catch {
      // silently fail
    }
  }, [embeddedAddress]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  // --- Fetch Transactions ---

  const fetchTransactions = useCallback(async () => {
    if (!embeddedAddress || !isSupabaseConfigured) return;
    setTxLoading(true);
    try {
      const addr = embeddedAddress.toLowerCase();
      const [walletTxs, challenges] = await Promise.all([
        supabaseFetch<WalletTx[]>(
          `wallet_transactions?select=*&wallet_address=eq.${addr}&order=created_at.desc&limit=50`
        ).catch(() => [] as WalletTx[]),
        supabaseFetch<GatewayChallenge[]>(
          `gateway_challenges?select=request_id,amount,status,created_at,claim_tx_hash&agent_address=ilike.${addr}&status=in.(COMPLETED,CLAIMED)&order=created_at.desc&limit=50`
        ).catch(() => [] as GatewayChallenge[]),
      ]);

      const merged: MergedTx[] = [
        ...walletTxs.map((tx) => ({
          id: tx.id,
          kind: tx.type as 'deposit' | 'withdraw',
          asset: tx.asset,
          amount: tx.amount,
          txHash: tx.tx_hash,
          createdAt: tx.created_at,
        })),
        ...challenges.map((c) => ({
          id: c.request_id,
          kind: 'service' as const,
          asset: 'USDC',
          amount: c.amount,
          txHash: c.claim_tx_hash || '',
          createdAt: c.created_at,
        })),
      ];

      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTransactions(merged);
    } catch {
      // silently fail
    } finally {
      setTxLoading(false);
    }
  }, [embeddedAddress]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // --- Record Transaction (fire-and-forget) ---

  const recordTransaction = (params: {
    type: 'deposit' | 'withdraw';
    asset: string;
    amount: string;
    txHash: string;
    from: string;
    to: string;
  }) => {
    if (!embeddedAddress || !isSupabaseConfigured) return;
    supabaseFetch('wallet_transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        wallet_address: embeddedAddress.toLowerCase(),
        type: params.type,
        asset: params.asset,
        amount: params.amount,
        tx_hash: params.txHash,
        from_address: params.from.toLowerCase(),
        to_address: params.to.toLowerCase(),
      }),
    }).then(() => fetchTransactions()).catch(() => {});
  };

  // --- Copy Address ---

  const copyAddress = () => {
    if (!embeddedAddress) return;
    navigator.clipboard.writeText(embeddedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Reset TX State ---

  const resetTxState = () => {
    setTxStatus('idle');
    setTxHash(null);
    setTxError(null);
    setAmount('');
  };

  // --- Deposit USDC ---

  const handleDepositUsdc = async () => {
    if (!externalWallet || !tokenAddress || !amount) return;
    const parsed = parseUnits(amount, tokenDecimals);
    if (parsed <= 0n) return;

    setTxStatus('pending');
    setTxHash(null);
    setTxError(null);

    try {
      await externalWallet.switchChain(targetChainId);
      const provider = await externalWallet.getEthereumProvider();

      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [embeddedAddress as `0x${string}`, parsed],
      });

      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: externalWallet.address as `0x${string}`,
          to: tokenAddress as `0x${string}`,
          data,
        }],
      });

      setTxHash(hash as string);
      setTxStatus('success');
      setAmount('');
      setTimeout(fetchBalances, 3000);

      recordTransaction({
        type: 'deposit',
        asset: 'USDC',
        amount: parsed.toString(),
        txHash: hash as string,
        from: externalWallet.address,
        to: embeddedAddress!,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Wallet] USDC deposit failed:', msg);
      setTxError(msg);
      setTxStatus('error');
    }
  };

  // --- Withdraw USDC ---

  const handleWithdrawUsdc = async () => {
    if (!embeddedWallet || !externalWallet || !tokenAddress || !amount) return;
    const parsed = parseUnits(amount, tokenDecimals);
    if (parsed <= 0n) return;

    setTxStatus('pending');
    setTxHash(null);
    setTxError(null);

    try {
      await embeddedWallet.switchChain(targetChainId);
      const provider = await embeddedWallet.getEthereumProvider();

      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [externalWallet.address as `0x${string}`, parsed],
      });

      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: embeddedAddress as `0x${string}`,
          to: tokenAddress as `0x${string}`,
          data,
        }],
      });

      setTxHash(hash as string);
      setTxStatus('success');
      setAmount('');
      setTimeout(fetchBalances, 3000);

      recordTransaction({
        type: 'withdraw',
        asset: 'USDC',
        amount: parsed.toString(),
        txHash: hash as string,
        from: embeddedAddress!,
        to: externalWallet.address,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Wallet] USDC withdrawal failed:', msg);
      setTxError(msg);
      setTxStatus('error');
    }
  };

  // --- Handle MAX button ---

  const handleMax = () => {
    if (activeTab === 'withdraw-usdc' && usdcBalance) {
      setAmount(parseFloat(usdcBalance).toString());
    }
  };

  // --- Handle Submit ---

  const handleSubmit = () => {
    if (activeTab === 'deposit-usdc') handleDepositUsdc();
    else handleWithdrawUsdc();
  };

  // --- Format Display Amount ---

  const formatDisplayAmount = (raw: string, asset: string): string => {
    if (asset === 'ETH') {
      const eth = Number(raw) / 1e18;
      return eth < 0.0001 ? '<0.0001' : eth.toFixed(4);
    }
    return formatTokenAmount(raw);
  };

  // --- Unauthenticated ---

  if (!authenticated) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card rounded-2xl p-12 text-center">
          <h1 className="text-3xl font-semibold text-gray-900 mb-3">Wallet</h1>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">
            Login to manage your USDC balance, deposit, withdraw, and view transaction history.
          </p>
          <button onClick={login} className="btn-primary">Connect Wallet</button>
        </div>
      </div>
    );
  }

  // --- Waiting for embedded wallet ---

  if (!embeddedAddress) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card rounded-2xl p-6 border-amber-200 bg-amber-50">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-600 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div>
              <h2 className="font-medium text-amber-800">Creating Embedded Wallet...</h2>
              <p className="text-amber-600 text-sm">Setting up your platform wallet. This only happens once.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'deposit-usdc', label: 'Deposit USDC' },
    { key: 'withdraw-usdc', label: 'Withdraw USDC' },
  ];

  const isDeposit = activeTab === 'deposit-usdc';
  const actionLabel = isDeposit ? 'Deposit' : 'Withdraw';
  const needsExternal = true; // All operations need external wallet

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-2xl font-semibold text-gray-900">Wallet</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your balances, deposit, and withdraw</p>
      </div>

      {/* Overview Card */}
      <div className="card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg">
              {embeddedAddress.slice(0, 8)}...{embeddedAddress.slice(-6)}
            </code>
            <button
              onClick={copyAddress}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {copied ? (
                <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-gray-50 p-4">
          <span className="text-sm text-gray-500">USDC Balance</span>
          <div className="text-xl font-bold text-gray-900 mt-1">
            {usdcBalance !== null ? (
              <span className="flex items-center gap-2">
                {parseFloat(usdcBalance).toFixed(2)}
                <span className="text-sm text-gray-500 font-normal">USDC</span>
              </span>
            ) : tokenAddress ? (
              <span className="text-gray-400">Loading...</span>
            ) : (
              <span className="text-gray-400">Not configured</span>
            )}
          </div>
        </div>
      </div>

      {/* Operations Card */}
      <div className="card rounded-2xl p-6">
        {/* Tab Selector */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); resetTxState(); }}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* External Wallet Requirement */}
        {needsExternal && !externalWallet ? (
          <button
            onClick={() => linkWallet()}
            className="w-full btn-secondary flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Connect External Wallet
          </button>
        ) : (
          <div className="space-y-4">
            {/* Direction indicator */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <span className="text-sm text-gray-500">{isDeposit ? 'From' : 'To'}</span>
              <span className="text-sm font-mono text-gray-900">
                {externalWallet?.walletClientType} ({externalWallet?.address.slice(0, 6)}...
                {externalWallet?.address.slice(-4)})
              </span>
            </div>

            {/* Amount Input */}
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1.00"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pr-24 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {activeTab === 'withdraw-usdc' && (
                    <button
                      onClick={handleMax}
                      className="text-xs text-gray-500 hover:text-gray-900 font-medium transition-colors"
                    >
                      MAX
                    </button>
                  )}
                  <span className="text-sm text-gray-400">USDC</span>
                </span>
              </div>
              <button
                onClick={handleSubmit}
                disabled={txStatus === 'pending' || !amount || !tokenAddress}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {txStatus === 'pending' ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    {isDeposit ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                      </svg>
                    )}
                    {actionLabel}
                  </>
                )}
              </button>
            </div>

            {/* TX Status */}
            {txStatus === 'success' && txHash && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-emerald-600 mb-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Transaction Failed</span>
                </div>
                {txError && <p className="text-xs text-red-500 break-all">{txError}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div className="card rounded-2xl p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Transaction History</h2>
          <p className="text-gray-500 text-sm mt-1">Deposits, withdrawals, and service payments</p>
        </div>

        {txLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
            <p className="text-gray-500">No transactions yet. Use the controls above to deposit or withdraw.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => {
              const cfg = kindConfig[tx.kind];
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl p-4 bg-gray-50 border border-gray-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text}`}>
                      {cfg.label}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {formatDisplayAmount(tx.amount, tx.asset)}{' '}
                        <span className="text-gray-500">{tx.asset}</span>
                      </div>
                      {tx.txHash && (
                        <code className="text-xs font-mono text-gray-500">{shortenHash(tx.txHash)}</code>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 ml-4 flex-shrink-0">
                    {new Date(tx.createdAt).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Link back to agent/provider for more details */}
        <div className="mt-6 flex gap-3 justify-center">
          <Link href="/agent" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            View Agent Calls →
          </Link>
          <Link href="/provider" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            View Provider Revenue →
          </Link>
        </div>
      </div>
    </div>
  );
}
