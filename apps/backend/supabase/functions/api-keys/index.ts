// Supabase Edge Function: api-keys
// Endpoints:
//   POST   /api-keys              — Create API Key (requires wallet signature)
//   GET    /api-keys?walletAddress=0x...  — List keys for wallet (prefix only)
//   DELETE /api-keys/:id          — Revoke key (requires wallet signature)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyMessage } from 'https://esm.sh/viem@2.7.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

/** Generate a random hex string of the given byte length */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 hash a string, return hex */
async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  try {
    // POST /api-keys — Create new API Key
    if (req.method === 'POST' && pathParts.length <= 1) {
      const body = await req.json();

      const { signature, message: signedMessage, walletAddress: rawAddress, name } = body;
      if (!signature || !signedMessage || !rawAddress) {
        return new Response(
          JSON.stringify({ error: 'Missing signature, message, or walletAddress' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!signedMessage.startsWith('NeuroStream: Create API Key')) {
        return new Response(
          JSON.stringify({ error: 'Invalid message format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const isValid = await verifyMessage({
        address: rawAddress as `0x${string}`,
        message: signedMessage,
        signature: signature as `0x${string}`,
      });

      if (!isValid) {
        return new Response(
          JSON.stringify({ error: 'Invalid signature — wallet ownership not proven' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate key: ns_live_ + 64 hex chars (32 bytes)
      const fullKey = `ns_live_${randomHex(32)}`;
      const keyHash = await sha256(fullKey);
      const keyPrefix = fullKey.slice(0, 16);

      const { data, error } = await supabase
        .from('api_keys')
        .insert({
          key_hash: keyHash,
          key_prefix: keyPrefix,
          wallet_address: rawAddress.toLowerCase(),
          name: name || 'Default',
        })
        .select('id, key_prefix, name, is_active, created_at')
        .single();

      if (error) throw error;

      // Return the full key only once
      return new Response(
        JSON.stringify({ ...data, key: fullKey }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /api-keys?walletAddress=0x... — List keys (prefix only)
    if (req.method === 'GET') {
      const walletAddress = url.searchParams.get('walletAddress');
      if (!walletAddress) {
        return new Response(
          JSON.stringify({ error: 'walletAddress query parameter required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabase
        .from('api_keys')
        .select('id, key_prefix, name, is_active, created_at, last_used_at, expires_at')
        .eq('wallet_address', walletAddress.toLowerCase())
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /api-keys/:id — Revoke key
    if (req.method === 'DELETE' && pathParts.length === 2) {
      const keyId = pathParts[1];
      const body = await req.json();

      const { signature, message: signedMessage, walletAddress: rawAddress } = body;
      if (!signature || !signedMessage || !rawAddress) {
        return new Response(
          JSON.stringify({ error: 'Missing signature, message, or walletAddress' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!signedMessage.startsWith('NeuroStream: Revoke API Key')) {
        return new Response(
          JSON.stringify({ error: 'Invalid message format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const isValid = await verifyMessage({
        address: rawAddress as `0x${string}`,
        message: signedMessage,
        signature: signature as `0x${string}`,
      });

      if (!isValid) {
        return new Response(
          JSON.stringify({ error: 'Invalid signature — wallet ownership not proven' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify the key belongs to this wallet
      const { data: existing, error: fetchError } = await supabase
        .from('api_keys')
        .select('wallet_address')
        .eq('id', keyId)
        .single();

      if (fetchError || !existing) {
        return new Response(
          JSON.stringify({ error: 'API key not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (existing.wallet_address !== rawAddress.toLowerCase()) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized — key does not belong to this wallet' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: false })
        .eq('id', keyId);

      if (error) throw error;

      return new Response(JSON.stringify({ status: 'revoked' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
