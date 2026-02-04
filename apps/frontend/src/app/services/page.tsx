'use client';

import { useEffect, useState } from 'react';

interface ServiceMetrics {
  id: string;
  service_id: string;
  service_type: string;
  endpoint: string;
  pricing_amount: string;
  pricing_asset: string;
  recipient: string;
  quality_score: number;
  success_rate: number;
  avg_latency: number;
  schema_match_rate: number;
  total_calls: number;
}

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    async function fetchServices() {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          // Use mock data for demo
          setServices([
            {
              id: '1',
              service_id: 'string-length',
              service_type: 'utility',
              endpoint: 'http://localhost:3001/invoke',
              pricing_amount: '0.001',
              pricing_asset: 'ETH',
              recipient: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
              quality_score: 0.92,
              success_rate: 0.98,
              avg_latency: 150,
              schema_match_rate: 0.95,
              total_calls: 1234,
            },
            {
              id: '2',
              service_id: 'text-summarize',
              service_type: 'ai',
              endpoint: 'http://localhost:3002/invoke',
              pricing_amount: '0.005',
              pricing_asset: 'ETH',
              recipient: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
              quality_score: 0.85,
              success_rate: 0.90,
              avg_latency: 450,
              schema_match_rate: 0.88,
              total_calls: 567,
            },
          ]);
          setLoading(false);
          return;
        }

        const res = await fetch(
          `${supabaseUrl}/rest/v1/services_with_metrics?select=*&order=quality_score.desc`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
            },
          }
        );

        if (!res.ok) throw new Error('Failed to fetch services');
        const data = await res.json();
        setServices(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchServices();
  }, []);

  const filteredServices = services.filter(
    (s) =>
      s.service_id.toLowerCase().includes(filter.toLowerCase()) ||
      s.service_type?.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 p-8">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Service Discovery</h1>
        <p className="text-gray-500">
          Browse available services ranked by quality score
        </p>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search services..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full max-w-md px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div className="grid gap-4">
        {filteredServices.map((service) => (
          <div
            key={service.id}
            className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {service.service_id}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Type: {service.service_type || 'general'} | Endpoint: {service.endpoint}
                </p>
                <p className="text-sm text-gray-500">
                  Price: {service.pricing_amount} {service.pricing_asset} per call
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-indigo-600">
                  {(service.quality_score * 100).toFixed(0)}
                </div>
                <div className="text-xs text-gray-500">Quality Score</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-4 text-center">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-lg font-semibold text-green-600">
                  {(service.success_rate * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">Success Rate</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-lg font-semibold text-blue-600">
                  {service.avg_latency.toFixed(0)}ms
                </div>
                <div className="text-xs text-gray-500">Avg Latency</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-lg font-semibold text-purple-600">
                  {(service.schema_match_rate * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">Schema Match</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-lg font-semibold text-gray-600">
                  {service.total_calls.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">Total Calls</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredServices.length === 0 && (
        <div className="text-center text-gray-500 py-12">
          No services found matching your search.
        </div>
      )}
    </div>
  );
}
