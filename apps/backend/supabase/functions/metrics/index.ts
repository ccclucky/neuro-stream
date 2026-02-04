// Supabase Edge Function: metrics
// Endpoints:
//   POST /metrics/report — Report a call log (Agent SDK auto-reports)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    if (req.method === 'POST') {
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
        agent_address: body.agent_address || 'unknown',
        success: body.success ?? true,
        latency_ms: body.latency_ms ?? 0,
        schema_match: body.schema_match ?? true,
      });

      if (error) throw error;

      // Metrics will be automatically updated by the database trigger

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
