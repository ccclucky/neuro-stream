import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto text-center py-16">
      <h1 className="text-5xl font-bold text-gray-900 mb-6">NeuroStream</h1>
      <p className="text-xl text-gray-600 mb-8">
        Agent-native payment and settlement protocol
      </p>
      <p className="text-lg text-gray-500 mb-12 max-w-2xl mx-auto">
        Enable AI agents to automatically discover, pay for, and consume services
        with on-chain escrow guarantees and quality-based ranking.
      </p>

      <div className="grid md:grid-cols-3 gap-6 mt-12">
        <Link
          href="/services"
          className="p-6 bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Discover Services
          </h3>
          <p className="text-gray-500 text-sm">
            Browse available services ranked by quality score
          </p>
        </Link>

        <Link
          href="/agent"
          className="p-6 bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Agent Developer
          </h3>
          <p className="text-gray-500 text-sm">
            Get your wallet, export private key, and integrate SDK
          </p>
        </Link>

        <Link
          href="/provider"
          className="p-6 bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Service Provider
          </h3>
          <p className="text-gray-500 text-sm">
            Register services and claim payments
          </p>
        </Link>
      </div>

      <div className="mt-16 p-6 bg-indigo-50 rounded-xl">
        <h2 className="text-lg font-semibold text-indigo-900 mb-4">How it Works</h2>
        <div className="flex flex-wrap justify-center gap-4 text-sm text-indigo-700">
          <span className="px-3 py-1 bg-white rounded-full">1. Agent requests service</span>
          <span className="px-3 py-1 bg-white rounded-full">2. Provider returns 402 + hashLock</span>
          <span className="px-3 py-1 bg-white rounded-full">3. Agent locks funds in Escrow</span>
          <span className="px-3 py-1 bg-white rounded-full">4. Provider returns ciphertext</span>
          <span className="px-3 py-1 bg-white rounded-full">5. Provider claims with preimage</span>
          <span className="px-3 py-1 bg-white rounded-full">6. Agent decrypts result</span>
        </div>
      </div>
    </div>
  );
}
