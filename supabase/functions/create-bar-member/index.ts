import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
}

serve(async (req) => {
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[create-bar-member] Starting user creation flow');

    // 1. Create a Supabase admin client with the service_role key
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    );
    console.log('[create-bar-member] Admin client created');

    // 2. Authenticate the calling user (the promoter/super_admin)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }
    console.log('[create-bar-member] Auth header found');

    const { data: { user: callingUser }, error: userError } = await createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();
    console.log('[create-bar-member] Got calling user:', callingUser?.id);

    if (userError) {
        throw new Error(`Authentication error: ${userError.message}`);
    }
    if (!callingUser) {
        throw new Error('Invalid user token');
    }

    // 3. Authorize the calling user by getting their full profile from auth.users via admin client
    const { data: callerProfileData, error: callerProfileError } = await adminClient.auth.admin.getUserById(callingUser.id);
    console.log('[create-bar-member] Got caller profile, error:', callerProfileError?.message);

    if (callerProfileError || !callerProfileData || !callerProfileData.user) {
        return new Response(JSON.stringify({ error: "Permission denied: Could not retrieve caller's profile for authorization." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403,
        });
    }
    // Try to get role from app_metadata first
    let callerRole = callerProfileData.user.app_metadata?.role || callerProfileData.user.user_metadata?.role;
    console.log('[create-bar-member] Caller role from app_metadata:', callerRole);

    // If role not found in app_metadata, check bar_members table as fallback
    if (!callerRole) {
      console.log('[create-bar-member] Role not in app_metadata, checking bar_members...');
      const { data: barMemberData, error: barMemberError } = await adminClient
        .from('bar_members')
        .select('role')
        .eq('user_id', callingUser.id)
        .eq('is_active', true)
        .limit(1);

      if (!barMemberError && barMemberData && barMemberData.length > 0) {
        callerRole = barMemberData[0].role;
        console.log('[create-bar-member] Caller role from bar_members:', callerRole);
      }
    }

    if (callerRole !== 'promoteur' && callerRole !== 'super_admin') {
      return new Response(JSON.stringify({ error: `Permission denied: Caller's role '${callerRole}', not 'promoteur' or 'super_admin'.` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
      });
    }

    // 4. Get the new user's data from the request body
    console.log('[create-bar-member] Parsing request body');
    const { newUser, barId, role: newUserRole } = await req.json(); // Renamed 'role' to 'newUserRole'
    console.log('[create-bar-member] Received: newUser.email=%s, barId=%s, role=%s', newUser?.email, barId, newUserRole);

    if (!newUser) {
      return new Response(JSON.stringify({ error: "Missing newUser in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Validation for barId and newUserRole: if one is provided, both must be.
    if ((barId && !newUserRole) || (!barId && newUserRole)) {
      return new Response(JSON.stringify({ error: "Both barId and role are required if either is provided" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // 5. Create the new user in auth.users using the admin client
    console.log('[create-bar-member] Creating new user: %s', newUser.email);
    const { data: newAuthUser, error: createError } = await adminClient.auth.admin.createUser({
      email: newUser.email,
      password: newUser.password,
      email_confirm: true, // Auto-confirm email
      user_metadata: { // This is raw_user_meta_data
        name: newUser.name,
        phone: newUser.phone,
        username: newUser.username,
      },
      app_metadata: { // <-- Set app_metadata here during creation for the NEW user
        role: newUserRole || 'serveur' // Default to 'serveur' if not provided (e.g., for promoter creation where role is inferred)
      }
    });

    if (createError || !newAuthUser.user) {
        console.error('[create-bar-member] Failed to create user:', createError?.message);
        return new Response(JSON.stringify({ error: `Failed to create user: ${createError?.message}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        });
    }
    const newUserId = newAuthUser.user.id;
    console.log('[create-bar-member] User created successfully: %s', newUserId);

    // Create user profile using RPC (bypasses RLS with SECURITY DEFINER)
    console.log('[create-bar-member] Creating user profile in public.users via RPC...');
    const { data: profileData, error: profileError } = await adminClient.rpc('create_user_profile', {
      p_user_id: newUserId,
      p_email: newUser.email,
      p_username: newUser.username || newUser.email.split('@')[0],
      p_name: newUser.name || '',
      p_phone: newUser.phone || '',
    });

    if (profileError) {
      console.error('[create-bar-member] Failed to create user profile:', profileError.message);
      // Clean up the created user since we can't create the profile
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: `Failed to create user profile: ${profileError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
    console.log('[create-bar-member] User profile created successfully via RPC');

    // 6. Conditionally assign the new user to the bar with the specified role
    if (barId && newUserRole) { // Only assign if both barId and newUserRole are provided
        console.log('[create-bar-member] Assigning user to bar: %s', barId);
        const { data: assignedData, error: assignError } = await adminClient.rpc('assign_bar_member', {
        p_user_id: newUserId,
        p_bar_id: barId,
        p_role: newUserRole,
        p_assigned_by: callingUser.id,
        });

        if (assignError) {
            console.error('[create-bar-member] Failed to assign user to bar:', assignError.message);
            // If assignment fails, it's good practice to clean up the created user
            await adminClient.auth.admin.deleteUser(newUserId);
            return new Response(JSON.stringify({ error: `Failed to assign user to bar: ${assignError.message}` }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500
            });
        }
        console.log('[create-bar-member] User assigned to bar successfully');
    } else {
        console.log('[create-bar-member] Skipping bar assignment (barId=%s, role=%s)', barId, newUserRole);
    }

    // 7. Return success response
    console.log('[create-bar-member] Returning success response');
    return new Response(JSON.stringify({ success: true, user: newAuthUser.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[create-bar-member] Caught error:', error);

    const errorMessage = error instanceof Error
      ? error.message
      : String(error);

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})