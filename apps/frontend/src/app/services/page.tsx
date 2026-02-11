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
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            Service Discovery
          </h1>
        </div>
        <p className="text-gray-500 ml-[52px]">
          Browse available services ranked by quality score
        </p>
      </div>

      {/* Search */}
      <div className="card rounded-xl p-4 mb-6">
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search services by name or type..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg pl-12 pr-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all"
          />
        </div>
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
                      <span className="text-gray-500 flex items-center gap-1">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                          />
                        </svg>
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
                    <div className="flex items-center gap-2 text-emerald-600 mb-1">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span className="text-lg font-bold">
                        {(service.success_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">Success Rate</div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-blue-600 mb-1">
                      <svg
                        className="w-4 h-4"
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
                      <span className="text-lg font-bold">{service.avg_latency.toFixed(0)}ms</span>
                    </div>
                    <div className="text-xs text-gray-500">Avg Latency</div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-amber-600 mb-1">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span className="text-lg font-bold">
                        {(service.schema_match_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">Schema Match</div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-slate-700 mb-1">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"
                        />
                      </svg>
                      <span className="text-lg font-bold">
                        {service.total_calls.toLocaleString()}
                      </span>
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
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
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
