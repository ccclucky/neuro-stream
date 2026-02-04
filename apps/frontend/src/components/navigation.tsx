'use client';

import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';

export function Navigation() {
  const { login, logout, authenticated, user } = usePrivy();

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="font-bold text-xl text-indigo-600">
              NeuroStream
            </Link>
            <div className="flex space-x-4">
              <Link
                href="/services"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Services
              </Link>
              <Link
                href="/agent"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Agent Panel
              </Link>
              <Link
                href="/provider"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Provider Panel
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {authenticated ? (
              <>
                <span className="text-sm text-gray-500">
                  {user?.email?.address || user?.wallet?.address?.slice(0, 8) + '...'}
                </span>
                <button
                  onClick={logout}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={login}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
