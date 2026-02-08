// Supabase Edge Function: metrics
// Endpoints:
//   POST /metrics/report — Report a call log (Agent SDK auto-reports) — API Key required

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

/** SHA-256 hash a string, return hex */
async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validate API Key from request headers. Required for metrics reporting.
 * Checks x-api-key header or Authorization: Bearer ns_live_...
 */
async function validateApiKey(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<{ valid: boolean; walletAddress?: string }> {
  let apiKey = req.headers.get('x-api-key');
  if (!apiKey) {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ns_live_')) {
      apiKey = authHeader.slice(7);
    }
  }

  if (!apiKey || !apiKey.startsWith('ns_live_')) {
    return { valid: false };
  }

  const keyHash = await sha256(apiKey);

  const { data, error } = await supabase
    .from('api_keys')
    .select('wallet_address, is_active, expires_at')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data) {
    return { valid: false };
  }

  if (!data.is_active) {
    return { valid: false };
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false };
  }

  // Update last_used_at (fire and forget)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key_hash', keyHash)
    .then(() => {});

  return { valid: true, walletAddress: data.wallet_address };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    if (req.method === 'POST') {
      // API Key is required for metrics reporting
      const auth = await validateApiKey(req, supabase);
      if (!auth.valid) {
        return new Response(
          JSON.stringify({ error: 'Valid API key required. Set x-api-key header.' }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const body = await req.json();

      // Validate required fields
      if (!body.service_id || !body.request_id) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: service_id, request_id' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Insert call log
      const { error } = await supabase.from('call_logs').insert({
        service_id: body.service_id,
        request_id: body.request_id,
        agent_address: body.agent_address || auth.walletAddress || 'unknown',
        success: body.success ?? true,
        latency_ms: body.latency_ms ?? 0,
        schema_match: body.schema_match ?? true,
      });

      if (error) throw error;

      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 201,
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
