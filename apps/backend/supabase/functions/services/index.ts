// Supabase Edge Function: services
// Endpoints:
//   GET  /services         — List services (sorted by quality_score)
//   GET  /services/:id     — Get service details
//   POST /services         — Register new service (provider)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyMessage } from 'https://esm.sh/viem@2.7.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    // GET /services - List all active services
    if (req.method === 'GET' && pathParts.length <= 1) {
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

    // GET /services/:id - Get specific service
    if (req.method === 'GET' && pathParts.length === 2) {
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
            pricing_asset: body.pricingAsset || 'ETH',
            pricing_amount: body.pricingAmount || '0.001',
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
