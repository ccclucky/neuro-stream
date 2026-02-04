'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useState } from 'react';

export default function AgentPage() {
  const { login, authenticated, user, exportWallet } = usePrivy();
  const { wallets } = useWallets();
  const [copied, setCopied] = useState(false);
  const [showSdkGuide, setShowSdkGuide] = useState(false);

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || user?.wallet?.address;

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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

      {/* Wallet Info */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Wallet Information</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Address:</span>
            <div className="flex items-center space-x-2">
              <code className="text-sm bg-gray-100 px-3 py-1 rounded font-mono">
                {walletAddress || 'No wallet found'}
              </code>
              {walletAddress && (
                <button
                  onClick={copyAddress}
                  className="text-indigo-600 hover:text-indigo-800 text-sm"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Deposit Prompt */}
      <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-yellow-800 mb-2">Fund Your Wallet</h2>
        <p className="text-yellow-700 text-sm mb-3">
          Send ETH (Monad Testnet) to your wallet address above. You need ETH for:
        </p>
        <ul className="text-yellow-700 text-sm list-disc list-inside space-y-1">
          <li>Service fees (locked in Escrow during calls)</li>
          <li>Gas fees for Escrow.open() transactions</li>
        </ul>
      </div>

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

      {/* Call History (placeholder) */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Call History</h2>
        <p className="text-gray-400 text-sm text-center py-8">
          No calls yet. Integrate the SDK and start invoking services.
        </p>
      </div>
    </div>
  );
}
