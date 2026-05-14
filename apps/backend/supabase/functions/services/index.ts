// Supabase Edge Function: services
// Endpoints:
//   GET  /services         — List services (sorted by quality_score) — API Key optional
//   GET  /services/:id     — Get service details — API Key optional
//   POST /services         — Register new service (provider) — requires wallet signature

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyMessage } from 'https://esm.sh/viem@2.7.0';

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
 * Validate API Key from request headers.
 * Checks x-api-key header or Authorization: Bearer ns_live_...
 * Returns { valid, walletAddress } or { valid: false }.
 */
async function validateApiKey(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<{ valid: boolean; walletAddress?: string }> {
  // Extract key from x-api-key or Authorization header
  let apiKey = req.headers.get('x-api-key');
  if (!apiKey) {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ns_live_')) {
      apiKey = authHeader.slice(7); // Remove "Bearer "
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  try {
    // GET /services - List all active services (API Key optional)
    if (req.method === 'GET' && pathParts.length <= 1) {
      // Optionally validate API key (not required for browsing)
      await validateApiKey(req, supabase);

      const type = url.searchParams.get('type');
      const minScore = url.searchParams.get('minQualityScore');

      let query = supabase
        .from('services_with_metrics')
        .select('*')
        .order('quality_score', { ascending: false, nullsFirst: false });

      if (type) {
        query = query.eq('service_type', type);
      }

      if (minScore) {
        query = query.gte('quality_score', parseFloat(minScore));
      }

      const { data, error } = await query;

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /services/:id - Get specific service (API Key optional)
    if (req.method === 'GET' && pathParts.length === 2) {
      await validateApiKey(req, supabase);

      const serviceId = pathParts[1];

      const { data, error } = await supabase
        .from('services_with_metrics')
        .select('*')
        .eq('service_id', serviceId)
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /services - Register new service
    if (req.method === 'POST') {
      const body = await req.json();

      // Signature verification
      const { signature, message: signedMessage, walletAddress: rawAddress } = body;
      if (!signature || !signedMessage || !rawAddress) {
        return new Response(
          JSON.stringify({ error: 'Missing signature, message, or walletAddress' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify the message follows expected format
      if (!signedMessage.startsWith('NeuroStream: Register service ')) {
        return new Response(
          JSON.stringify({ error: 'Invalid message format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify signature matches wallet address
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

      const { data: provider, error: providerError } = await supabase
        .from('providers')
        .upsert(
          {
            wallet_address: body.walletAddress,
            name: body.providerName,
            email: body.email,
          },
          { onConflict: 'wallet_address' }
        )
        .select()
        .single();

      if (providerError) throw providerError;

      const { data: service, error: serviceError } = await supabase
        .from('services')
        .upsert(
          {
            provider_id: provider.id,
            service_id: body.serviceId,
            service_type: body.serviceType,
            endpoint: body.endpoint,
            pricing_model: body.pricingModel || 'per_call',
            pricing_asset: body.pricingAsset || 'USDC',
            pricing_amount: body.pricingAmount || '2.00',
            recipient: body.walletAddress,
            schema_input: body.schemaInput,
            schema_output: body.schemaOutput,
            status: 'active',
          },
          { onConflict: 'service_id' }
        )
        .select()
        .single();

      if (serviceError) throw serviceError;

      return new Response(JSON.stringify(service), {
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
