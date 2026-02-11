'use client';

import { usePrivy, useSignMessage } from '@privy-io/react-auth';
import { useEffect, useState, useCallback } from 'react';
import { isSupabaseConfigured, supabaseFetch, supabaseUrl, supabaseKey } from '@/lib/supabase';
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

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

function weiToEth(wei: string): string {
  const num = BigInt(wei);
  const eth = Number(num) / 1e18;
  return eth.toFixed(6);
}

function shortenHex(hex: string, chars = 6): string {
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

const statusConfig: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  Locked: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-600',
    label: 'Locked',
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  },
  Released: {
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-600',
    label: 'Released',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  Refunded: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-600',
    label: 'Refunded',
    icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
  },
};

const edgeFunctionsUrl = supabaseUrl ? `${supabaseUrl}/functions/v1` : '';

export default function AgentPage() {
  const { login, authenticated, user, exportWallet } = usePrivy();
  const { signMessage } = useSignMessage();
  const { embeddedAddress, embeddedWallet } = useEmbeddedWallet();
  const [showSdkGuide, setShowSdkGuide] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // API Key state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const walletAddress = embeddedWallet?.address || user?.wallet?.address;

  // Fetch API keys
  const fetchApiKeys = useCallback(async () => {
    if (!walletAddress || !edgeFunctionsUrl) return;
    setApiKeysLoading(true);
    try {
      const res = await fetch(
        `${edgeFunctionsUrl}/api-keys?walletAddress=${walletAddress.toLowerCase()}`,
        {
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data);
      }
    } catch {
      // silently fail
    } finally {
      setApiKeysLoading(false);
    }
  }, [walletAddress]);

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
        // silently fail
      } finally {
        setPaymentsLoading(false);
      }
    }

    fetchPayments();
    fetchApiKeys();
  }, [walletAddress, fetchApiKeys]);

  // Generate API Key
  const handleCreateApiKey = async () => {
    if (!embeddedWallet || !walletAddress) return;
    setCreating(true);
    setCreatedKey(null);
    try {
      const timestamp = Date.now();
      const message = `NeuroStream: Create API Key "${newKeyName || 'Default'}" at ${timestamp}`;
      const signature = await signMessage(message, undefined, embeddedWallet.address);

      const res = await fetch(`${edgeFunctionsUrl}/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          signature,
          message,
          walletAddress,
          name: newKeyName || 'Default',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create API key');
      }

      const data = await res.json();
      setCreatedKey(data.key);
      setNewKeyName('');
      await fetchApiKeys();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  // Revoke API Key
  const handleRevokeKey = async (keyId: string) => {
    if (!embeddedWallet || !walletAddress) return;
    try {
      const timestamp = Date.now();
      const message = `NeuroStream: Revoke API Key ${keyId} at ${timestamp}`;
      const signature = await signMessage(message, undefined, embeddedWallet.address);

      const res = await fetch(`${edgeFunctionsUrl}/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          signature,
          message,
          walletAddress,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to revoke');
      }

      await fetchApiKeys();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!authenticated) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card rounded-3xl p-12 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-10 h-10 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Agent Developer Panel
          </h1>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">
            Login to get your embedded wallet, export private keys, and integrate the NeuroStream
            SDK.
          </p>
          <button onClick={login} className="btn-primary">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Agent Developer Panel
          </h1>
          <p className="text-sm text-gray-500">
            Manage your agent wallet, API keys, and SDK integration
          </p>
        </div>
      </div>

      {/* Deposit (includes wallet info + balance + funding) */}
      {embeddedAddress ? (
        <Deposit embeddedAddress={embeddedAddress} />
      ) : (
        <div className="card rounded-2xl p-6 border-amber-200 bg-amber-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-600 animate-spin" fill="none" viewBox="0 0 24 24">
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
            </div>
            <div>
              <h2 className="text-lg font-semibold text-amber-800 mb-1">
                Creating Embedded Wallet...
              </h2>
              <p className="text-amber-600 text-sm">
                Setting up your platform wallet. This only happens once.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Export Private Key */}
      <div className="card rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
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
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Export Private Key
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              Export your embedded wallet private key to use with the NeuroStream SDK in your local
              Agent program.
            </p>
            <div className="flex items-center gap-4">
              <button onClick={() => exportWallet()} className="btn-secondary">
                Export Private Key
              </button>
              <span className="text-xs text-red-500 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                Keep secure. Never share publicly.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* API Key Management */}
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
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              API Keys
            </h2>
            <p className="text-gray-500 text-sm">
              Generate API keys to authenticate your Agent with the NeuroStream platform.
            </p>
          </div>
        </div>

        {/* Create new key */}
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Key name (optional)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all"
          />
          <button
            onClick={handleCreateApiKey}
            disabled={creating || !embeddedWallet}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
                Signing...
              </span>
            ) : (
              'Generate Key'
            )}
          </button>
        </div>

        {/* Newly created key display */}
        {createdKey && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-6">
            <p className="text-emerald-600 text-sm font-medium mb-3 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              API Key created! Copy it now — it won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm font-mono text-emerald-400 break-all">
                {createdKey}
              </code>
              <button onClick={() => copyToClipboard(createdKey)} className="btn-secondary">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Existing keys list */}
        {apiKeysLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 rounded-full border-2 border-slate-900 border-t-transparent animate-spin"></div>
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
            <p className="text-gray-500">
              No API keys yet. Generate one above to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className={`flex items-center justify-between rounded-xl p-4 border ${
                  key.is_active
                    ? 'bg-gray-50 border-gray-200'
                    : 'bg-gray-50 border-gray-100 opacity-60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <code className="text-sm font-mono text-emerald-600">
                      {key.key_prefix}...
                    </code>
                    <span className="text-xs text-gray-500">{key.name}</span>
                    {!key.is_active && (
                      <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs">
                        Revoked
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Created {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at &&
                      ` · Last used ${new Date(key.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
                {key.is_active && (
                  <button
                    onClick={() => handleRevokeKey(key.id)}
                    className="text-red-500 hover:text-red-600 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors ml-4"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SDK Integration Guide */}
      <div className="card rounded-2xl p-6">
        <button
          onClick={() => setShowSdkGuide(!showSdkGuide)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
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
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <div className="text-left">
              <h2 className="text-lg font-semibold text-gray-900">
                SDK Integration Guide
              </h2>
              <p className="text-gray-500 text-sm">
                Learn how to integrate NeuroStream into your agent
              </p>
            </div>
          </div>
          <svg
            className={`w-6 h-6 text-gray-400 transition-transform duration-300 ${showSdkGuide ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showSdkGuide && (
          <div className="mt-6 space-y-6 pt-6 border-t border-gray-200">
            <div>
              <p className="text-sm text-gray-500 mb-3">1. Install the SDK:</p>
              <code className="block bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm font-mono text-emerald-400">
                npm install @neurostream/sdk
              </code>
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-3">2. Configure your .env:</p>
              <pre className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm font-mono text-emerald-400 overflow-x-auto">
                {`NEUROSTREAM_API_KEY=<your-api-key-from-above>
NEUROSTREAM_PRIVATE_KEY=<your-exported-private-key>`}
              </pre>
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-3">3. Use in your Agent:</p>
              <pre className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm font-mono text-emerald-400 overflow-x-auto">
                {`import { NeuroStream } from '@neurostream/sdk';

const client = new NeuroStream({
  apiKey: process.env.NEUROSTREAM_API_KEY,
  privateKey: process.env.NEUROSTREAM_PRIVATE_KEY,
});

// Auto-discover + invoke best service
const { result } = await client.callService({
  keyword: 'text-analysis',
  params: { text: 'Hello world' },
});

// Or invoke by service ID
const { result: r2 } = await client.callService({
  serviceId: 'text-analysis-v1',
  params: { text: 'Hello world' },
});`}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Call History */}
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
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Call History
            </h2>
            <p className="text-gray-500 text-sm">
              Recent service invocations and payment status
            </p>
          </div>
        </div>

        {paymentsLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 rounded-full border-2 border-slate-900 border-t-transparent animate-spin"></div>
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
            <p className="text-gray-500">
              No calls yet. Integrate the SDK and start invoking services.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 pr-4 text-xs font-medium text-gray-500 uppercase">
                    Request ID
                  </th>
                  <th className="text-left py-3 pr-4 text-xs font-medium text-gray-500 uppercase">
                    Provider
                  </th>
                  <th className="text-left py-3 pr-4 text-xs font-medium text-gray-500 uppercase">
                    Amount
                  </th>
                  <th className="text-left py-3 pr-4 text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="text-left py-3 text-xs font-medium text-gray-500 uppercase">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.request_id} className="border-b border-gray-100 last:border-0">
                    <td className="py-4 pr-4">
                      <code className="text-xs font-mono text-emerald-600">
                        {shortenHex(p.request_id)}
                      </code>
                    </td>
                    <td className="py-4 pr-4">
                      <code className="text-xs font-mono text-gray-500">
                        {shortenHex(p.provider)}
                      </code>
                    </td>
                    <td className="py-4 pr-4 text-gray-900 font-medium">{weiToEth(p.amount)} ETH</td>
                    <td className="py-4 pr-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusConfig[p.status]?.bg} ${statusConfig[p.status]?.text}`}
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d={statusConfig[p.status]?.icon}
                          />
                        </svg>
                        {statusConfig[p.status]?.label}
                      </span>
                    </td>
                    <td className="py-4 text-xs text-gray-500">
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
