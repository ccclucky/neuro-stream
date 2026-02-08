'use client';

import { usePrivy, useSignMessage, useWallets } from '@privy-io/react-auth';
import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabaseFetch } from '@/lib/supabase';
import { useEmbeddedWallet } from '@/lib/useEmbeddedWallet';
import { Deposit } from '@/components/deposit';

interface Service {
  id: string;
  service_id: string;
  service_type: string;
  endpoint: string;
  pricing_amount: string;
  pricing_asset: string;
  status: string;
  created_at: string;
}

interface Payment {
  request_id: string;
  agent: string;
  provider: string;
  amount: string;
  status: 'Locked' | 'Released' | 'Refunded';
  deadline: number;
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

export default function ProviderPage() {
  const { login, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { embeddedAddress } = useEmbeddedWallet();
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [formData, setFormData] = useState({
    serviceId: '',
    serviceType: 'utility',
    endpoint: '',
    pricingAmount: '0.001',
  });

  const [myServices, setMyServices] = useState<Service[]>([]);
  const [pendingClaims, setPendingClaims] = useState<Payment[]>([]);
  const [totalEarned, setTotalEarned] = useState('0');
  const [totalCalls, setTotalCalls] = useState(0);
  const [dataLoading, setDataLoading] = useState(false);

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || user?.wallet?.address;

  const fetchProviderData = useCallback(async () => {
    console.log('[Provider] fetchProviderData called', { walletAddress, isSupabaseConfigured });
    if (!walletAddress || !isSupabaseConfigured) return;

    setDataLoading(true);

    try {
      // 1. Fetch user's services by recipient (Privy wallet)
      const services = await supabaseFetch<Service[]>(
        `services?select=*&recipient=ilike.${walletAddress}&status=eq.active&order=created_at.desc`
      );
      setMyServices(services);

      // 2. Bridge to payments via call_logs (service_id → request_id)
      //    payments.provider is the on-chain PROVIDER_WALLET_ADDRESS which
      //    differs from the Privy embedded wallet, so we look up through call_logs.
      const serviceIds = services.map((s) => s.service_id);
      console.log('[Provider] services:', serviceIds);

      let pending: Payment[] = [];
      let released: Pick<Payment, 'amount'>[] = [];

      if (serviceIds.length > 0) {
        const logs = await supabaseFetch<{ request_id: string }[]>(
          `call_logs?select=request_id&service_id=in.(${serviceIds.join(',')})`
        );
        console.log('[Provider] call_logs:', logs);
        const requestIds = [...new Set(logs.map((l) => l.request_id).filter(Boolean))];
        console.log('[Provider] requestIds:', requestIds);

        if (requestIds.length > 0) {
          const reqFilter = requestIds.join(',');
          [pending, released] = await Promise.all([
            supabaseFetch<Payment[]>(
              `payments?select=*&request_id=in.(${reqFilter})&status=eq.Locked&order=created_at.desc`
            ),
            supabaseFetch<Pick<Payment, 'amount'>[]>(
              `payments?select=amount&request_id=in.(${reqFilter})&status=eq.Released`
            ),
          ]);
          console.log('[Provider] pending:', pending, 'released:', released);
        }
      }

      setPendingClaims(pending);

      // Aggregate revenue
      let sum = BigInt(0);
      for (const r of released) {
        sum += BigInt(r.amount);
      }
      const eth = Number(sum) / 1e18;
      setTotalEarned(eth.toFixed(6));
      setTotalCalls(released.length);
    } catch (err) {
      console.error('[Provider] fetchProviderData error:', err);
    } finally {
      setDataLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchProviderData();
  }, [fetchProviderData]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSupabaseConfigured) {
      alert('Supabase is not configured. Cannot register service.');
      return;
    }

    if (!embeddedWallet) {
      alert('Embedded wallet not found. Please wait for wallet initialization.');
      return;
    }

    setRegisterLoading(true);

    try {
      // 1. Construct and sign the verification message
      const timestamp = Math.floor(Date.now() / 1000);
      const message = `NeuroStream: Register service ${formData.serviceId} at ${timestamp}`;
      const signature = await signMessage(message, undefined, embeddedWallet.address);

      // 2. Send registration with signature
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

      const res = await fetch(`${supabaseUrl}/functions/v1/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          walletAddress: embeddedWallet.address,
          signature,
          message,
          providerName: user?.email?.address || 'Anonymous',
          email: user?.email?.address,
          serviceId: formData.serviceId,
          serviceType: formData.serviceType,
          endpoint: formData.endpoint,
          pricingAmount: formData.pricingAmount,
          pricingAsset: 'ETH',
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to register service');
      }

      alert('Service registered successfully!');
      setShowRegisterForm(false);
      fetchProviderData();
    } catch (err) {
      alert('Error registering service: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setRegisterLoading(false);
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

      {/* Deposit */}
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
              disabled={registerLoading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-2 rounded-lg font-medium"
            >
              {registerLoading ? 'Signing & Registering...' : 'Register Service'}
            </button>
          </form>
        )}
      </div>

      {/* My Services */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">My Services</h2>
        {dataLoading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
          </div>
        ) : myServices.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">
            No services registered yet. Click &quot;Register Service&quot; to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {myServices.map((s) => (
              <div key={s.id} className="border rounded-lg p-4 flex justify-between items-center">
                <div>
                  <div className="font-medium text-gray-900">{s.service_id}</div>
                  <div className="text-sm text-gray-500">
                    {s.service_type} | {s.endpoint}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-indigo-600">
                    {s.pricing_amount} {s.pricing_asset}
                  </div>
                  <div className="text-xs text-gray-400">per call</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Claims */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pending Claims</h2>
        {dataLoading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
          </div>
        ) : pendingClaims.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">
            No pending claims. Payments will appear here when Agents lock funds for your services.
          </p>
        ) : (
          <div className="space-y-3">
            {pendingClaims.map((p) => (
              <div key={p.request_id} className="border rounded-lg p-4 flex justify-between items-center">
                <div>
                  <div className="font-mono text-xs text-gray-700">{shortenHex(p.request_id)}</div>
                  <div className="text-sm text-gray-500">
                    From: {shortenHex(p.agent)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-yellow-700">
                    {weiToEth(p.amount)} ETH
                  </div>
                  <div className="text-xs text-gray-400">
                    Deadline: {new Date(Number(p.deadline) * 1000).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revenue Stats */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Statistics</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{totalEarned} ETH</div>
            <div className="text-sm text-gray-500">Total Earned</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{totalCalls}</div>
            <div className="text-sm text-gray-500">Total Calls Served</div>
          </div>
        </div>
      </div>
    </div>
  );
}
