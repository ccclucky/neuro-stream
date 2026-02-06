export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export async function supabaseFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured');
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase request failed (${res.status}): ${text}`);
  }

  return res.json();
}
