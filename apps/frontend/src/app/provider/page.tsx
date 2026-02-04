'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useState } from 'react';

export default function ProviderPage() {
  const { login, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [formData, setFormData] = useState({
    serviceId: '',
    serviceType: 'utility',
    endpoint: '',
    pricingAmount: '0.001',
  });

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || user?.wallet?.address;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      alert('Demo mode: Service registration would be saved to Supabase');
      setShowRegisterForm(false);
      return;
    }

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          walletAddress,
          providerName: user?.email?.address || 'Anonymous',
          email: user?.email?.address,
          serviceId: formData.serviceId,
          serviceType: formData.serviceType,
          endpoint: formData.endpoint,
          pricingAmount: formData.pricingAmount,
          pricingAsset: 'ETH',
        }),
      });

      if (!res.ok) throw new Error('Failed to register service');
      alert('Service registered successfully!');
      setShowRegisterForm(false);
    } catch (err) {
      alert('Error registering service: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  };

  if (!authenticated) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Provider Panel</h1>
        <p className="text-gray-500 mb-8">
          Login to register services and claim payments.
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
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Provider Panel</h1>

      {/* Wallet Info */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Wallet Information</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Address:</span>
            <code className="text-sm bg-gray-100 px-3 py-1 rounded font-mono">
              {walletAddress || 'No wallet found'}
            </code>
          </div>
        </div>
      </div>

      {/* Gas Deposit Prompt */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-blue-800 mb-2">Fund Gas for Claims</h2>
        <p className="text-blue-700 text-sm">
          Send a small amount of ETH (Monad Testnet) to your wallet. You need gas to call claim() and receive payments.
        </p>
      </div>

      {/* Register Service */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Register New Service</h2>
          <button
            onClick={() => setShowRegisterForm(!showRegisterForm)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {showRegisterForm ? 'Cancel' : 'Register Service'}
          </button>
        </div>

        {showRegisterForm && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service ID
              </label>
              <input
                type="text"
                value={formData.serviceId}
                onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                placeholder="e.g., my-string-service"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service Type
              </label>
              <select
                value={formData.serviceType}
                onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="utility">Utility</option>
                <option value="ai">AI</option>
                <option value="data">Data</option>
                <option value="compute">Compute</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Endpoint URL
              </label>
              <input
                type="url"
                value={formData.endpoint}
                onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                placeholder="https://your-service.com/invoke"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price per Call (ETH)
              </label>
              <input
                type="text"
                value={formData.pricingAmount}
                onChange={(e) => setFormData({ ...formData, pricingAmount: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium"
            >
              Register Service
            </button>
          </form>
        )}
      </div>

      {/* My Services */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">My Services</h2>
        <p className="text-gray-400 text-sm text-center py-4">
          No services registered yet. Click "Register Service" to get started.
        </p>
      </div>

      {/* Pending Claims */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pending Claims</h2>
        <p className="text-gray-400 text-sm text-center py-4">
          No pending claims. Payments will appear here when Agents lock funds for your services.
        </p>
      </div>

      {/* Revenue Stats */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Statistics</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">0 ETH</div>
            <div className="text-sm text-gray-500">Total Earned</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">0</div>
            <div className="text-sm text-gray-500">Total Calls Served</div>
          </div>
        </div>
      </div>
    </div>
  );
}
