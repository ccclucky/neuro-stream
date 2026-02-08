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

const statusColors: Record<string, string> = {
  Locked: 'bg-yellow-100 text-yellow-800',
  Released: 'bg-green-100 text-green-800',
  Refunded: 'bg-red-100 text-red-800',
};

const edgeFunctionsUrl = supabaseUrl
  ? `${supabaseUrl}/functions/v1`
  : '';

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
        // silently fail — empty list shown
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

      {/* API Key Management */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">API Keys</h2>
        <p className="text-gray-500 text-sm mb-4">
          Generate API keys to authenticate your Agent with the NeuroStream platform.
          The full key is shown only once — store it securely.
        </p>

        {/* Create new key */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Key name (optional)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleCreateApiKey}
            disabled={creating || !embeddedWallet}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
          >
            {creating ? 'Signing...' : 'Generate Key'}
          </button>
        </div>

        {/* Newly created key display */}
        {createdKey && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <p className="text-green-800 text-sm font-medium mb-2">
              API Key created! Copy it now — it won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white border rounded px-3 py-2 text-sm font-mono break-all">
                {createdKey}
              </code>
              <button
                onClick={() => copyToClipboard(createdKey)}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Existing keys list */}
        {apiKeysLoading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
          </div>
        ) : apiKeys.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">
            No API keys yet. Generate one above to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className={`flex items-center justify-between border rounded-lg px-4 py-3 ${
                  key.is_active ? 'bg-white' : 'bg-gray-50 opacity-60'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">{key.key_prefix}...</code>
                    <span className="text-xs text-gray-500">{key.name}</span>
                    {!key.is_active && (
                      <span className="text-xs text-red-600 font-medium">Revoked</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Created {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at && ` · Last used ${new Date(key.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
                {key.is_active && (
                  <button
                    onClick={() => handleRevokeKey(key.id)}
                    className="text-red-600 hover:text-red-800 text-xs font-medium ml-4"
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
{`NEUROSTREAM_API_KEY=<your-api-key-from-above>
NEUROSTREAM_PRIVATE_KEY=<your-exported-private-key>`}
              </pre>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">3. Use in your Agent:</p>
              <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm overflow-x-auto">
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
