'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabaseFetch } from '@/lib/supabase';
import { useEmbeddedWallet } from '@/lib/useEmbeddedWallet';
import { Deposit } from '@/components/deposit';

interface Payment {
  request_id: string;
  agent: string;
  provider: string;
  amount: string;
  status: 'Locked' | 'Released' | 'Refunded';
  deadline: number;
  tx_hash: string;
  created_at: string;
}

function weiToEth(wei: string): string {
  const num = BigInt(wei);
  const eth = Number(num) / 1e18;
  return eth.toFixed(6);
}

function shortenHex(hex: string, chars = 6): string {
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

const statusColors: Record<string, string> = {
  Locked: 'bg-yellow-100 text-yellow-800',
  Released: 'bg-green-100 text-green-800',
  Refunded: 'bg-red-100 text-red-800',
};

export default function AgentPage() {
  const { login, authenticated, user, exportWallet } = usePrivy();
  const { wallets } = useWallets();
  const { embeddedAddress } = useEmbeddedWallet();
  const [showSdkGuide, setShowSdkGuide] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || user?.wallet?.address;

  useEffect(() => {
    if (!walletAddress || !isSupabaseConfigured) return;

    async function fetchPayments() {
      setPaymentsLoading(true);
      try {
        const data = await supabaseFetch<Payment[]>(
          `payments?select=*&agent=eq.${walletAddress!.toLowerCase()}&order=created_at.desc&limit=20`
        );
        setPayments(data);
      } catch {
        // silently fail — empty list shown
      } finally {
        setPaymentsLoading(false);
      }
    }

    fetchPayments();
  }, [walletAddress]);

  if (!authenticated) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Agent Developer Panel</h1>
        <p className="text-gray-500 mb-8">
          Login to get your wallet, export private key, and integrate the NeuroStream SDK.
        </p>
        <button
          onClick={login}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg text-lg font-medium"
        >
          Login to Get Started
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Agent Developer Panel</h1>

      {/* Deposit (includes wallet info + balance + funding) */}
      {embeddedAddress ? (
        <Deposit embeddedAddress={embeddedAddress} />
      ) : (
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">Creating Embedded Wallet...</h2>
          <p className="text-yellow-700 text-sm">
            Setting up your platform wallet. This only happens once.
          </p>
        </div>
      )}

      {/* Export Private Key */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Export Private Key</h2>
        <p className="text-gray-500 text-sm mb-4">
          Export your embedded wallet private key to use with the NeuroStream SDK in your local Agent program.
        </p>
        <button
          onClick={() => exportWallet()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-medium"
        >
          Export Private Key
        </button>
        <p className="text-red-500 text-xs mt-2">
          Keep your private key secure. Never share it publicly.
        </p>
      </div>

      {/* SDK Integration Guide */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">SDK Integration Guide</h2>
          <button
            onClick={() => setShowSdkGuide(!showSdkGuide)}
            className="text-indigo-600 hover:text-indigo-800 text-sm"
          >
            {showSdkGuide ? 'Hide' : 'Show'}
          </button>
        </div>

        {showSdkGuide && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">1. Install the SDK:</p>
              <code className="block bg-gray-900 text-green-400 p-3 rounded-lg text-sm">
                npm install @neurostream/sdk
              </code>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">2. Configure your .env:</p>
              <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm overflow-x-auto">
{`NEUROSTREAM_PRIVATE_KEY=<your-exported-key>
MONAD_RPC_URL=<monad-testnet-rpc>
ESCROW_CONTRACT_ADDRESS=<deployed-contract>`}
              </pre>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">3. Use in your Agent:</p>
              <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm overflow-x-auto">
{`import { NeuroStream } from '@neurostream/sdk';

const client = new NeuroStream({
  privateKey: process.env.NEUROSTREAM_PRIVATE_KEY,
  rpcUrl: process.env.MONAD_RPC_URL,
  escrowAddress: process.env.ESCROW_CONTRACT_ADDRESS,
});

// Discover services
const services = await client.discoverServices({ type: 'utility' });

// Invoke (auto pay + decrypt)
const { result } = await client.invokeService(
  services[0].endpoint,
  { text: 'Hello world' }
);`}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Call History */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Call History</h2>

        {paymentsLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
          </div>
        ) : payments.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">
            No calls yet. Integrate the SDK and start invoking services.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-4">Request ID</th>
                  <th className="pb-2 pr-4">Provider</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.request_id} className="border-b last:border-b-0">
                    <td className="py-3 pr-4 font-mono text-xs">
                      {shortenHex(p.request_id)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      {shortenHex(p.provider)}
                    </td>
                    <td className="py-3 pr-4">{weiToEth(p.amount)} ETH</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status] ?? ''}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 text-gray-500 text-xs">
                      {new Date(p.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
