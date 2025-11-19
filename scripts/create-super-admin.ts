/**
 * Script pour créer le super admin initial avec custom auth
 * À exécuter une seule fois lors de la configuration initiale
 *
 * Usage: npx tsx scripts/create-super-admin.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yekomwjdznvtnialpdcz.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY manquante');
  console.error('Récupérez-la depuis : Supabase Dashboard > Settings > API > service_role key');
  process.exit(1);
}

// Client avec service role key (bypass RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
});

async function createSuperAdmin() {
  console.log('🚀 Création du super admin avec custom auth...\n');

  const username = 'admin';
  const password = 'Admin@1234';
  const name = 'Super Administrateur';
  const phone = '+22900000000';

  try {
    // 1. Créer l'utilisateur via la fonction SQL
    console.log('1️⃣ Création de l\'utilisateur...');
    const { data: userId, error: createError } = await supabase.rpc('create_user', {
      p_username: username,
      p_password: password,
      p_name: name,
      p_phone: phone,
    });

    if (createError || !userId) {
      throw new Error(`Erreur création user: ${createError?.message}`);
    }

    console.log(`✅ Utilisateur créé: ${userId}`);

    // 2. Créer le bar système + bar_members via fonction SQL (bypass RLS)
    console.log('\n2️⃣ Création du bar système et attribution du rôle...');
    const { data: barSetup, error: setupError } = await supabase.rpc('setup_super_admin_bar', {
      p_user_id: userId,
    });

    if (setupError || !barSetup || barSetup.length === 0) {
      throw new Error(`Erreur setup: ${setupError?.message || 'Pas de données retournées'}`);
    }

    const barInfo = barSetup[0];
    console.log(`✅ Bar créé: ${barInfo.bar_id}`);
    console.log('✅ Rôle attribué: super_admin');

    // 4. Vérifier que le login fonctionne
    console.log('\n4️⃣ Vérification de l\'authentification...');
    const { data: validateData, error: validateError } = await supabase.rpc('validate_password', {
      p_username: username,
      p_password: password,
    });

    if (validateError || !validateData || validateData.length === 0) {
      throw new Error('Échec de la validation du mot de passe');
    }

    console.log('✅ Authentification testée avec succès');

    // 5. Résumé
    console.log('\n' + '='.repeat(50));
    console.log('✅ SUPER ADMIN CRÉÉ AVEC SUCCÈS !');
    console.log('='.repeat(50));
    console.log(`\n📝 Credentials:`);
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    console.log(`\n🆔 IDs:`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Bar ID: ${barInfo.bar_id}`);
    console.log('\n💡 Vous pouvez maintenant vous connecter avec:');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}\n`);
    console.log('📌 Note: Custom auth avec bcrypt activé');

  } catch (error: any) {
    console.error('\n❌ ERREUR:', error.message);
    process.exit(1);
  }
}

// Exécuter
createSuperAdmin();
