'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePrivy } from '@privy-io/react-auth';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/services', label: 'Services' },
  { href: '/agent', label: 'Agent' },
  { href: '/provider', label: 'Provider' },
  { href: '/wallet', label: 'Wallet' },
];

export function Navigation() {
  const { login, logout, authenticated, user } = usePrivy();
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
              <Image
                src="/logo.png"
                alt="NeuroStream Logo"
                width={32}
                height={32}
                className="object-cover"
              />
            </div>
            <span className="font-semibold text-lg text-gray-900">NeuroStream</span>
          </Link>

          {/* Navigation Links - Desktop */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? 'text-slate-900 bg-gray-100'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Auth Button */}
          <div className="flex items-center gap-3">
            {authenticated ? (
              <>
                <span className="hidden sm:block text-sm text-gray-500 font-mono">
                  {user?.email?.address ||
                    user?.wallet?.address?.slice(0, 6) + '...' + user?.wallet?.address?.slice(-4)}
                </span>
                <button onClick={logout} className="btn-secondary text-sm py-2 px-4">
                  Logout
                </button>
              </>
            ) : (
              <button onClick={login} className="btn-primary text-sm py-2 px-4">
                Connect
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="flex md:hidden justify-center gap-1 py-2 border-t border-gray-200">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pathname === link.href
                  ? 'text-slate-900 bg-gray-100'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
