import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImpersonateRequest {
  impersonated_user_id: string;
  impersonated_user_email: string;
  impersonated_user_role: string;
  bar_id: string;
  expires_at: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get the JWT signing secret from environment
    const jwtSecret = Deno.env.get('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    // Parse request body
    const body: ImpersonateRequest = await req.json();

    // Validate required fields
    if (!body.impersonated_user_id || !body.bar_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the signing key
    const secret = new TextEncoder().encode(jwtSecret);
    const alg = 'HS256';

    // Build JWT payload
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = new Date(body.expires_at);
    const exp = Math.floor(expiresAt.getTime() / 1000);

    const payload = {
      sub: body.impersonated_user_id,
      aud: 'authenticated',
      role: body.impersonated_user_role,
      email: body.impersonated_user_email,
      email_verified: true,
      phone_verified: false,
      app_metadata: {
        provider: 'custom_impersonate',
        impersonated_at: new Date().toISOString(),
        bar_id: body.bar_id,
        bar_role: body.impersonated_user_role,
      },
      user_metadata: {
        impersonation: true,
      },
      iss: Deno.env.get('SUPABASE_URL') || 'https://supabase.io',
      iat: now,
      exp: exp,
    };

    // Sign the token
    const token = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg })
      .sign(secret);

    return new Response(
      JSON.stringify({
        token,
        expires_at: body.expires_at,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
