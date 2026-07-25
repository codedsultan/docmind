'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearClientToken, initClientToken } from '@/lib/api';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    initClientToken()
      .then((token) => setAuthenticated(token !== null))
      .finally(() => setChecking(false));
  }, []);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch('/api/auth/logout');
      clearClientToken();
      router.push('/auth/login');
      router.refresh();
    } catch {
      setLoading(false);
    }
  }

  function handleClick() {
    if (!authenticated) {
      router.push('/auth/login');
      return;
    }
    void handleLogout();
  }

  if (checking || !authenticated) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 disabled:opacity-50"
    >
      {loading ? 'Logging out...' : 'Logout'}
    </button>
  );
}