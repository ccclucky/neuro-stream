'use client';

import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth';
import { useEffect, useRef } from 'react';

/**
 * Ensures an embedded (Privy) wallet exists for the authenticated user.
 * If the user logged in before `createOnLogin: 'all-users'` was set,
 * this hook will auto-create the embedded wallet on first render.
 *
 * Returns the embedded wallet address (or undefined while creating).
 */
export function useEmbeddedWallet() {
  const { authenticated } = usePrivy();
  const { wallets, ready } = useWallets();
  const { createWallet } = useCreateWallet();
  const creating = useRef(false);

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');

  useEffect(() => {
    if (!authenticated || !ready || embeddedWallet || creating.current) return;

    creating.current = true;
    createWallet().catch((err) => {
      // "already has an embedded wallet" is expected if race condition
      console.warn('[useEmbeddedWallet] createWallet failed:', err);
    });
  }, [authenticated, ready, embeddedWallet, createWallet]);

  return {
    embeddedWallet,
    embeddedAddress: embeddedWallet?.address,
    ready: ready && !!embeddedWallet,
  };
}
