'use client';

import { usePrivy, useSignMessage, useWallets } from '@privy-io/react-auth';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { isSupabaseConfigured, supabaseFetch } from '@/lib/supabase';
import { useEmbeddedWallet } from '@/lib/useEmbeddedWallet';

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

function formatTokenAmount(raw: string): string {
  const num = BigInt(raw);
  const amount = Number(num) / 1e6;
  return amount.toFixed(2);
}

function shortenHex(hex: string, chars = 6): string {
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

const serviceTypeColors: Record<string, string> = {
  utility: 'bg-blue-50 text-blue-700 border-blue-200',
  ai: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  data: 'bg-green-50 text-green-700 border-green-200',
  compute: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function ProviderPage() {
  const { login, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  useEmbeddedWallet();
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [formData, setFormData] = useState({
    serviceId: '',
    serviceType: 'utility',
    endpoint: '',
    pricingAmount: '2.00',
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
      const usdc = Number(sum) / 1e6;
      setTotalEarned(usdc.toFixed(2));
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
          pricingAsset: 'USDC',
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
      <div className="max-w-2xl mx-auto">
        <div className="card rounded-2xl p-12 text-center">
          <h1 className="text-3xl font-semibold text-gray-900 mb-3">
            Provider Panel
          </h1>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">
            Login to register services, manage your offerings, and claim payments from agents.
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
      <div className="mb-2">
        <h1 className="text-2xl font-semibold text-gray-900">
          Provider Panel
        </h1>
        <p className="text-sm text-gray-500 mt-1">Register services and manage your revenue</p>
      </div>

      {/* Wallet Link */}
      <Link href="/wallet" className="card rounded-2xl p-6 flex items-center justify-between hover:bg-gray-50 transition-colors group">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Wallet</h2>
          <p className="text-gray-500 text-sm mt-1">Withdraw USDC earned from service calls</p>
        </div>
        <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-900 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Register Service */}
      <div className="card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Register New Service
            </h2>
            <p className="text-gray-500 text-sm mt-1">Add a new service to the marketplace</p>
          </div>
          <button onClick={() => setShowRegisterForm(!showRegisterForm)} className="btn-secondary">
            {showRegisterForm ? 'Cancel' : 'Register Service'}
          </button>
        </div>

        {showRegisterForm && (
          <form onSubmit={handleRegister} className="space-y-5 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Service ID</label>
                <input
                  type="text"
                  value={formData.serviceId}
                  onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                  placeholder="e.g., my-string-service"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Service Type</label>
                <select
                  value={formData.serviceType}
                  onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all"
                >
                  <option value="utility">Utility</option>
                  <option value="ai">AI</option>
                  <option value="data">Data</option>
                  <option value="compute">Compute</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Endpoint URL</label>
              <input
                type="url"
                value={formData.endpoint}
                onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                placeholder="https://your-service.com/invoke"
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Price per Call (USDC)
              </label>
              <input
                type="text"
                value={formData.pricingAmount}
                onChange={(e) => setFormData({ ...formData, pricingAmount: e.target.value })}
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={registerLoading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {registerLoading ? (
                <span className="flex items-center justify-center gap-2">
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
                  Signing & Registering...
                </span>
              ) : (
                'Register Service'
              )}
            </button>
          </form>
        )}
      </div>

      {/* My Services */}
      <div className="card rounded-2xl p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            My Services
          </h2>
          <p className="text-gray-500 text-sm mt-1">Services you have registered</p>
        </div>

        {dataLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 rounded-full border-2 border-slate-900 border-t-transparent animate-spin"></div>
          </div>
        ) : myServices.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
            <p className="text-gray-500">
              No services registered yet. Register your first service above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {myServices.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl p-4 bg-gray-50 border border-gray-200"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold text-gray-900">
                      {s.service_id}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${serviceTypeColors[s.service_type] || serviceTypeColors.utility}`}
                    >
                      {s.service_type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{s.endpoint}</p>
                </div>
                <div className="text-right ml-4">
                  <div className="text-lg font-bold text-gray-900">
                    {s.pricing_amount}{' '}
                    <span className="text-sm text-gray-500">{s.pricing_asset}</span>
                  </div>
                  <div className="text-xs text-gray-500">per call</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Claims */}
      <div className="card rounded-2xl p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Pending Claims
          </h2>
          <p className="text-gray-500 text-sm mt-1">Payments locked for your services</p>
        </div>

        {dataLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 rounded-full border-2 border-slate-900 border-t-transparent animate-spin"></div>
          </div>
        ) : pendingClaims.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
            <p className="text-gray-500">
              No pending claims. Payments will appear here when agents lock funds.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingClaims.map((p) => (
              <div
                key={p.request_id}
                className="flex items-center justify-between rounded-xl p-4 bg-gray-50 border border-gray-200"
              >
                <div className="flex-1 min-w-0">
                  <code className="text-sm font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded block mb-1 w-fit">
                    {shortenHex(p.request_id)}
                  </code>
                  <p className="text-sm text-gray-500">
                    From: <span className="font-mono">{shortenHex(p.agent)}</span>
                  </p>
                </div>
                <div className="text-right ml-4">
                  <div className="text-lg font-bold text-amber-600">
                    {formatTokenAmount(p.amount)} USDC
                  </div>
                  <div className="text-xs text-gray-500">
                    Deadline: {new Date(Number(p.deadline) * 1000).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revenue Stats */}
      <div className="card rounded-2xl p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Revenue Statistics
          </h2>
          <p className="text-gray-500 text-sm mt-1">Your earnings from service calls</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="card rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-slate-900 mb-1">
              {totalEarned}
            </div>
            <div className="text-sm text-gray-500 font-medium">USDC Total Earned</div>
          </div>
          <div className="card rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-slate-900 mb-1">
              {totalCalls}
            </div>
            <div className="text-sm text-gray-500 font-medium">Total Calls Served</div>
          </div>
        </div>
      </div>
    </div>
  );
}
