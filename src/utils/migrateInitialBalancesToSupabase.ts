import { supabase } from '../lib/supabase';
import type { InitialBalance } from '../types';

/**
 * Migration utility: Sync initial balances from localStorage to Supabase
 * Run this ONCE after deploying the new schema
 *
 * Usage in browser console:
 * import { migrateInitialBalancesToSupabase } from './utils/migrateInitialBalancesToSupabase';
 * await migrateInitialBalancesToSupabase();
 */
export async function migrateInitialBalancesToSupabase() {
  console.log('🔄 Starting migration of initial balances from localStorage to Supabase...');

  const STORAGE_KEY_PREFIX = 'initial_balance_';
  const localStorageKeys = Object.keys(localStorage).filter(key =>
    key.startsWith(STORAGE_KEY_PREFIX)
  );

  if (localStorageKeys.length === 0) {
    console.log('✅ No initial balances found in localStorage');
    return;
  }

  console.log(`📊 Found ${localStorageKeys.length} initial balance(s) to migrate`);

  let successCount = 0;
  let errorCount = 0;

  for (const key of localStorageKeys) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) continue;

      const parsed = JSON.parse(stored) as InitialBalance;

      // Check if already exists in Supabase
      const { data: existing } = await supabase
        .from('initial_balances')
        .select('id')
        .eq('bar_id', parsed.barId)
        .single();

      if (existing) {
        console.log(`⏭️  Skipping bar ${parsed.barId} - already in Supabase`);
        continue;
      }

      // Insert into Supabase
      const { error } = await supabase
        .from('initial_balances')
        .insert([
          {
            id: parsed.id,
            bar_id: parsed.barId,
            amount: parsed.amount,
            date: new Date(parsed.date).toISOString().split('T')[0],
            description: parsed.description,
            created_by: parsed.createdBy,
            created_at: new Date(parsed.createdAt).toISOString(),
            is_locked: parsed.isLocked || false,
          },
        ]);

      if (error) {
        console.error(`❌ Error migrating bar ${parsed.barId}:`, error);
        errorCount++;
      } else {
        console.log(`✅ Migrated initial balance for bar ${parsed.barId}`);
        successCount++;
      }
    } catch (error) {
      console.error(`❌ Error processing localStorage key ${key}:`, error);
      errorCount++;
    }
  }

  console.log(`\n📈 Migration complete!`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);

  if (errorCount === 0 && successCount > 0) {
    console.log('\n✨ You can now safely clear localStorage for initial_balance_* keys');
  }
}

/**
 * Cleanup function: Remove initial balance data from localStorage after successful migration
 * Run this AFTER verifying all data was migrated correctly
 */
export function clearInitialBalancesFromLocalStorage() {
  const STORAGE_KEY_PREFIX = 'initial_balance_';
  const keysToRemove = Object.keys(localStorage).filter(key =>
    key.startsWith(STORAGE_KEY_PREFIX)
  );

  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
    console.log(`🗑️  Removed ${key}`);
  });

  console.log(`✅ Cleared ${keysToRemove.length} item(s) from localStorage`);
}
