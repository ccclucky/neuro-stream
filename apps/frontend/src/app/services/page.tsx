'use client';

import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabaseFetch } from '@/lib/supabase';

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
      if (!isSupabaseConfigured) {
        setError(
          'Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
        );
        setLoading(false);
        return;
      }

      try {
        const data = await supabaseFetch<ServiceMetrics[]>(
          'services_with_metrics?select=*&order=quality_score.desc'
        );
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

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-emerald-600';
    if (score >= 0.6) return 'text-blue-600';
    if (score >= 0.4) return 'text-amber-600';
    return 'text-red-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 0.8) return 'bg-emerald-50 border-emerald-200';
    if (score >= 0.6) return 'bg-blue-50 border-blue-200';
    if (score >= 0.4) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="w-12 h-12 rounded-full border-2 border-slate-900 border-t-transparent animate-spin mb-4"></div>
          <p className="text-gray-500">Loading services...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card rounded-2xl p-8 text-center">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Configuration Error
          </h3>
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">
          Service Discovery
        </h1>
        <p className="text-gray-500">
          Browse available services ranked by quality score
        </p>
      </div>

      {/* Search */}
      <div className="card rounded-xl p-4 mb-6">
        <input
          type="text"
          placeholder="Search services by name or type..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all"
        />
      </div>

      {/* Services Grid */}
      <div className="space-y-4">
        {filteredServices.map((service) => (
          <div key={service.id} className="card card-hover rounded-2xl p-6 group">
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              {/* Main Info */}
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {service.service_id}
                    </h3>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                        {service.service_type || 'general'}
                      </span>
                      <span className="text-gray-500 font-mono text-xs">
                        {service.endpoint}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`flex-shrink-0 px-4 py-3 rounded-xl border ${getScoreBg(service.quality_score)}`}
                  >
                    <div className={`text-3xl font-bold ${getScoreColor(service.quality_score)}`}>
                      {(service.quality_score * 100).toFixed(0)}
                    </div>
                    <div className="text-xs text-gray-500">Quality Score</div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-lg font-bold text-emerald-600 mb-1">
                      {(service.success_rate * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">Success Rate</div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-lg font-bold text-blue-600 mb-1">
                      {service.avg_latency.toFixed(0)}ms
                    </div>
                    <div className="text-xs text-gray-500">Avg Latency</div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-lg font-bold text-amber-600 mb-1">
                      {(service.schema_match_rate * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">Schema Match</div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-lg font-bold text-slate-700 mb-1">
                      {service.total_calls.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">Total Calls</div>
                  </div>
                </div>
              </div>

              {/* Price & Action */}
              <div className="lg:w-48 flex flex-col justify-between gap-4 lg:border-l lg:border-gray-200 lg:pl-6">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Price per Call</div>
                  <div className="text-xl font-bold text-gray-900">
                    {service.pricing_amount}{' '}
                    <span className="text-sm text-gray-500">{service.pricing_asset}</span>
                  </div>
                </div>
                <button className="btn-secondary w-full text-sm py-2.5">View Details</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredServices.length === 0 && (
        <div className="card rounded-2xl p-12 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Services Found
          </h3>
          <p className="text-gray-500">
            No services match your search criteria. Try different keywords.
          </p>
        </div>
      )}
    </div>
  );
}
