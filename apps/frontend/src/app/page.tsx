import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero Section */}
      <section className="text-center py-16 lg:py-24">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 border border-gray-200 mb-8">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="text-sm text-gray-600">Verifiable Infrastructure on Monad</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-gray-900 mb-6 leading-tight tracking-tight">
          AI Agents
          <br />
          <span className="text-slate-900">Trustless Payments</span>
        </h1>

        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-4">
          Agent-native payment and settlement protocol
        </p>
        <p className="text-base text-gray-500 max-w-2xl mx-auto mb-10">
          Enable AI agents to automatically discover, pay for, and consume services with cryptographic
          escrow guarantees and quality-based ranking.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/services" className="btn-primary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            Discover Services
          </Link>
          <Link href="/agent" className="btn-secondary flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            Agent Panel
          </Link>
        </div>
      </section>

      {/* Features Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-20">
        <Link href="/services" className="card card-hover rounded-xl p-6 group">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center mb-4">
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
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Discover Services</h3>
          <p className="text-sm text-gray-500">
            Browse available services ranked by quality score
          </p>
        </Link>

        <Link href="/agent" className="card card-hover rounded-xl p-6 group">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center mb-4">
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
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Agent Developer</h3>
          <p className="text-sm text-gray-500">Get your wallet and integrate the SDK</p>
        </Link>

        <Link href="/provider" className="card card-hover rounded-xl p-6 group">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center mb-4">
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
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Service Provider</h3>
          <p className="text-sm text-gray-500">Register services and claim payments</p>
        </Link>
      </section>

      {/* Protocol Guarantees */}
      <section className="mb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Protocol Guarantees</h2>
          <p className="text-gray-500">Every transaction is protected by cryptographic commitments</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card rounded-xl p-6">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Pay-or-Refund</h3>
            <p className="text-sm text-gray-500">
              Funds locked in escrow with a deadline. If the service doesn&apos;t deliver, your money returns automatically. No disputes, no middleman.
            </p>
          </div>

          <div className="card rounded-xl p-6">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Deliver-then-Earn</h3>
            <p className="text-sm text-gray-500">
              Providers only receive payment after cryptographic proof of delivery. The protocol enforces honest behavior mathematically.
            </p>
          </div>

          <div className="card rounded-xl p-6">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Quality-First Ranking</h3>
            <p className="text-sm text-gray-500">
              Every service call is measured — latency, success rate, schema compliance. Rankings emerge from real performance data, not reviews.
            </p>
          </div>
        </div>
      </section>

      {/* Protocol Flow */}
      <section className="card rounded-2xl p-8 mb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">How It Works</h2>
          <p className="text-gray-500">Atomic payment-delivery in four steps</p>
        </div>

        {/* Desktop: horizontal flow */}
        <div className="hidden lg:block">
          <div className="relative flex items-start justify-between">
            {/* Connector line */}
            <div className="absolute top-5 left-[calc(12.5%+16px)] right-[calc(12.5%+16px)] border-t-2 border-gray-200"></div>

            {[
              {
                step: '1',
                title: 'Request',
                desc: 'Agent calls a service via the SDK',
              },
              {
                step: '2',
                title: 'Escrow',
                desc: 'Funds locked on-chain with cryptographic hash',
              },
              {
                step: '3',
                title: 'Execute',
                desc: 'Service processes the request, result stored',
              },
              {
                step: '4',
                title: 'Settle',
                desc: 'Provider proves delivery, payment released atomically',
              },
            ].map((item) => (
              <div key={item.step} className="relative flex flex-col items-center text-center w-1/4 px-2">
                <div className="relative z-10 w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-semibold text-sm">
                  {item.step}
                </div>
                <h4 className="font-semibold text-gray-900 mt-3 mb-1">{item.title}</h4>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile: vertical flow */}
        <div className="lg:hidden flex flex-col">
          {[
            {
              step: '1',
              title: 'Request',
              desc: 'Agent calls a service via the SDK',
            },
            {
              step: '2',
              title: 'Escrow',
              desc: 'Funds locked on-chain with cryptographic hash',
            },
            {
              step: '3',
              title: 'Execute',
              desc: 'Service processes the request, result stored',
            },
            {
              step: '4',
              title: 'Settle',
              desc: 'Provider proves delivery, payment released atomically',
            },
          ].map((item, idx) => (
            <div key={item.step} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                  {item.step}
                </div>
                {idx < 3 && <div className="w-px h-8 bg-gray-200 mt-1"></div>}
              </div>
              <div className="pb-6">
                <h4 className="font-semibold text-gray-900 mb-1">{item.title}</h4>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust Architecture */}
      <section className="card rounded-2xl p-8 mb-20">
        <div className="flex flex-col lg:flex-row gap-10">
          {/* Left: text */}
          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Verifiable by Design</h2>
            <p className="text-gray-500 mb-6">
              Trust emerges from cryptographic proofs, not promises.
            </p>

            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Fully Auditable</p>
                  <p className="text-sm text-gray-500">All payments recorded on a public ledger — every transaction is verifiable.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Cryptographic Proofs</p>
                  <p className="text-sm text-gray-500">Hash-locked commitments replace trust in third parties. Math, not middlemen.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Open-Source Protocol</p>
                  <p className="text-sm text-gray-500">Inspect every line of code. No black boxes, no hidden logic.</p>
                </div>
              </li>
            </ul>
          </div>

          {/* Right: trust diagram (pure SVG) */}
          <div className="flex-1 flex items-center justify-center">
            <svg className="w-full max-w-xs" viewBox="0 0 280 220" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Dashed connectors (behind boxes) */}
              {/* Agent → Escrow */}
              <line x1="75" y1="40" x2="205" y2="40" stroke="#D1D5DB" strokeWidth="1.5" strokeDasharray="6 4" />
              {/* Escrow → Provider */}
              <line x1="230" y1="65" x2="168" y2="160" stroke="#D1D5DB" strokeWidth="1.5" strokeDasharray="6 4" />
              {/* Provider → Agent */}
              <line x1="112" y1="160" x2="50" y2="65" stroke="#D1D5DB" strokeWidth="1.5" strokeDasharray="6 4" />

              {/* Edge labels */}
              <text x="140" y="30" textAnchor="middle" fill="#9CA3AF" fontSize="11" fontFamily="Inter, sans-serif">hashLock</text>
              <text x="212" y="120" textAnchor="middle" fill="#9CA3AF" fontSize="11" fontFamily="Inter, sans-serif">preimage</text>
              <text x="66" y="120" textAnchor="middle" fill="#9CA3AF" fontSize="11" fontFamily="Inter, sans-serif">result</text>

              {/* Agent box */}
              <rect x="4" y="36" width="80" height="50" rx="8" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="1" />
              <text x="44" y="54" textAnchor="middle" fill="#9CA3AF" fontSize="10" fontFamily="Inter, sans-serif">Caller</text>
              <text x="44" y="72" textAnchor="middle" fill="#111827" fontSize="13" fontWeight="600" fontFamily="Inter, sans-serif">Agent</text>

              {/* Escrow box */}
              <rect x="196" y="36" width="80" height="50" rx="8" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="1" />
              <text x="236" y="54" textAnchor="middle" fill="#9CA3AF" fontSize="10" fontFamily="Inter, sans-serif">Lock</text>
              <text x="236" y="72" textAnchor="middle" fill="#111827" fontSize="13" fontWeight="600" fontFamily="Inter, sans-serif">Escrow</text>

              {/* Provider box */}
              <rect x="100" y="156" width="80" height="50" rx="8" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="1" />
              <text x="140" y="174" textAnchor="middle" fill="#9CA3AF" fontSize="10" fontFamily="Inter, sans-serif">Service</text>
              <text x="140" y="192" textAnchor="middle" fill="#111827" fontSize="13" fontWeight="600" fontFamily="Inter, sans-serif">Provider</text>
            </svg>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Settlement', value: 'Atomic' },
          { label: 'Guarantee', value: '100%' },
          { label: 'Scoring', value: 'Automated' },
          { label: 'Audit', value: 'On-chain' },
        ].map((stat) => (
          <div key={stat.label} className="card rounded-xl p-6 text-center">
            <div className="text-2xl font-semibold text-slate-900 mb-1">{stat.value}</div>
            <div className="text-sm text-gray-500">{stat.label}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
