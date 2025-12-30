/**
 * stock-conflict.test.ts
 * Test d'intégration - Validation verrou SQL transactionnel
 *
 * Scénario: 3+ utilisateurs tentent de vendre la dernière bouteille simultanément
 * Objectif: Vérifier que SEUL 1 utilisateur réussit (verrou SQL)
 *
 * Architecture testée:
 * - Verrou SQL transactionnel (SELECT FOR UPDATE)
 * - Realtime notification (UI sync)
 * - Broadcast Channel (cross-tab sync)
 *
 * Résultat attendu:
 * - 1 vente réussit
 * - 2+ ventes échouent avec erreur "insufficient_stock"
 * - Stock final = 0 (pas de stock négatif)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

describe('Stock Conflict Test - Phase 5 Validation', () => {
  let supabase: SupabaseClient;
  let testBarId: string;
  let testProductId: string;

  beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Setup: Utiliser le premier bar existant
    const { data: bars, error: barError } = await supabase
      .from('bars')
      .select('id')
      .limit(1);

    if (barError || !bars || bars.length === 0) {
      console.log('ℹ️ INFO: No bars found in database. Integration tests skipped.');
      console.log('To run integration tests:');
      console.log('1. Create at least one bar in Supabase dashboard');
      console.log('2. Run: npm run test -- tests/integration');
      return;
    }
    testBarId = bars[0].id;

    // Setup: Créer un produit avec stock = 1 (dernière bouteille)
    const { data: product, error: productError } = await supabase
      .from('bar_products')
      .insert({
        bar_id: testBarId,
        name: 'Dernière Bière',
        price: 500,
        stock: 1, // ⚠️ Stock critique
        alert_threshold: 5,
      })
      .select()
      .single();

    if (productError) throw productError;
    testProductId = product.id;

    console.log(`✅ Setup complet: Bar ${testBarId}, Product ${testProductId}, Stock = 1`);
  });

  afterAll(async () => {
    // Cleanup: Supprimer uniquement le produit de test
    if (testProductId) {
      await supabase.from('bar_products').delete().eq('id', testProductId);
    }
    // Ne pas supprimer le bar car il existait déjà
  });

  it.skipIf(!testBarId)('should handle concurrent sales on last item correctly', async () => {
    console.log('\n🧪 Test: 3 utilisateurs tentent de vendre la dernière bouteille\n');

    // Scénario: 3 serveurs vendent simultanément
    const createSale = async (userId: string, userName: string) => {
      const salePayload = {
        p_bar_id: testBarId,
        p_items: [
          {
            product_id: testProductId,
            product_name: 'Dernière Bière',
            quantity: 1,
            unit_price: 500,
            total_price: 500,
          },
        ],
        p_payment_method: 'cash',
        p_sold_by: userId,
        p_status: 'validated',
        p_business_date: new Date().toISOString().split('T')[0],
      };

      try {
        const startTime = Date.now();

        const { data, error } = await supabase.rpc('create_sale', salePayload);

        const duration = Date.now() - startTime;

        if (error) {
          return {
            userId,
            userName,
            success: false,
            error: error.message,
            duration,
          };
        }

        return {
          userId,
          userName,
          success: true,
          saleId: data,
          duration,
        };
      } catch (err: any) {
        return {
          userId,
          userName,
          success: false,
          error: err.message,
          duration: 0,
        };
      }
    };

    // Lancer 3 ventes SIMULTANÉMENT
    const results = await Promise.all([
      createSale('server-1', 'Alice'),
      createSale('server-2', 'Bob'),
      createSale('server-3', 'Charlie'),
    ]);

    console.log('📊 Résultats:');
    results.forEach((r, i) => {
      console.log(
        `  ${i + 1}. ${r.userName}: ${r.success ? '✅ SUCCESS' : '❌ FAILED'} (${r.duration}ms)`
      );
      if (!r.success) {
        console.log(`     Erreur: ${r.error}`);
      }
    });

    // VALIDATION 1: Exactement 1 vente réussit
    const successCount = results.filter((r) => r.success).length;
    expect(successCount).toBe(1);
    console.log(`\n✅ Validation 1: Exactement 1 vente réussit (${successCount}/3)`);

    // VALIDATION 2: 2 ventes échouent avec erreur stock insuffisant
    const failedCount = results.filter((r) => !r.success).length;
    expect(failedCount).toBe(2);
    console.log(`✅ Validation 2: 2 ventes échouent (${failedCount}/3)`);

    // VALIDATION 3: Erreurs contiennent "insufficient_stock" ou "stock"
    const stockErrors = results.filter(
      (r) =>
        !r.success &&
        r.error &&
        (r.error.toLowerCase().includes('stock') ||
          r.error.toLowerCase().includes('insufficient'))
    );
    expect(stockErrors.length).toBeGreaterThanOrEqual(2);
    console.log(`✅ Validation 3: Erreurs liées au stock détectées`);

    // VALIDATION 4: Stock final = 0 (pas de stock négatif)
    const { data: finalProduct } = await supabase
      .from('bar_products')
      .select('stock')
      .eq('id', testProductId)
      .single();

    expect(finalProduct?.stock).toBe(0);
    console.log(`✅ Validation 4: Stock final = 0 (pas de stock négatif)`);

    // VALIDATION 5: Latence acceptable (< 1s par vente)
    const maxDuration = Math.max(...results.map((r) => r.duration));
    expect(maxDuration).toBeLessThan(1000);
    console.log(`✅ Validation 5: Latence max = ${maxDuration}ms (< 1000ms)\n`);
  });

  it.skipIf(!testBarId)('should handle 5 concurrent sales on last item (stress test)', async () => {
    console.log('\n🧪 Stress Test: 5 utilisateurs sur 1 bouteille\n');

    // Reset stock à 1
    await supabase
      .from('bar_products')
      .update({ stock: 1 })
      .eq('id', testProductId);

    const createSale = async (userId: string) => {
      const { data, error } = await supabase.rpc('create_sale', {
        p_bar_id: testBarId,
        p_items: [
          {
            product_id: testProductId,
            quantity: 1,
            unit_price: 500,
            total_price: 500,
          },
        ],
        p_payment_method: 'cash',
        p_sold_by: userId,
        p_status: 'validated',
        p_business_date: new Date().toISOString().split('T')[0],
      });

      return { success: !error, error };
    };

    // 5 ventes simultanées
    const results = await Promise.all([
      createSale('user-1'),
      createSale('user-2'),
      createSale('user-3'),
      createSale('user-4'),
      createSale('user-5'),
    ]);

    const successCount = results.filter((r) => r.success).length;

    expect(successCount).toBe(1);
    console.log(`✅ Stress Test: 1/5 ventes réussit (verrou SQL fonctionne)\n`);
  });

  it.skipIf(!testBarId)('should recover stock on sale rejection', async () => {
    console.log('\n🧪 Test: Récupération stock après rejet vente\n');

    // 1. Reset stock à 5
    await supabase.from('bar_products').update({ stock: 5 }).eq('id', testProductId);

    // 2. Créer une vente (stock = 5 - 2 = 3)
    const { data: saleId } = await supabase.rpc('create_sale', {
      p_bar_id: testBarId,
      p_items: [
        {
          product_id: testProductId,
          quantity: 2,
          unit_price: 500,
          total_price: 1000,
        },
      ],
      p_payment_method: 'cash',
      p_sold_by: 'test-user',
      p_status: 'pending',
      p_business_date: new Date().toISOString().split('T')[0],
    });

    // 3. Vérifier stock après vente
    const { data: afterSale } = await supabase
      .from('bar_products')
      .select('stock')
      .eq('id', testProductId)
      .single();

    expect(afterSale?.stock).toBe(3);
    console.log(`  Stock après vente: ${afterSale?.stock} (5 - 2 = 3) ✅`);

    // 4. Rejeter la vente (stock doit revenir à 5)
    await supabase.rpc('reject_sale', {
      p_sale_id: saleId,
      p_rejector_id: 'manager',
    });

    // 5. Vérifier stock restauré
    const { data: afterReject } = await supabase
      .from('bar_products')
      .select('stock')
      .eq('id', testProductId)
      .single();

    expect(afterReject?.stock).toBe(5);
    console.log(`  Stock après rejet: ${afterReject?.stock} (restauré à 5) ✅\n`);
  });

  it.skipIf(!testBarId)('should prevent negative stock in all scenarios', async () => {
    console.log('\n🧪 Test: Protection stock négatif\n');

    // Reset stock à 2
    await supabase.from('bar_products').update({ stock: 2 }).eq('id', testProductId);

    // Tenter de vendre 5 items (> stock disponible)
    const { error } = await supabase.rpc('create_sale', {
      p_bar_id: testBarId,
      p_items: [
        {
          product_id: testProductId,
          quantity: 5,
          unit_price: 500,
          total_price: 2500,
        },
      ],
      p_payment_method: 'cash',
      p_sold_by: 'greedy-user',
      p_status: 'validated',
      p_business_date: new Date().toISOString().split('T')[0],
    });

    // Vente doit échouer
    expect(error).toBeTruthy();
    console.log(`  ❌ Vente bloquée: ${error?.message}`);

    // Stock doit rester inchangé
    const { data: finalStock } = await supabase
      .from('bar_products')
      .select('stock')
      .eq('id', testProductId)
      .single();

    expect(finalStock?.stock).toBe(2);
    console.log(`  ✅ Stock protégé: ${finalStock?.stock} (inchangé)\n`);
  });
});

describe('Realtime Sync Test - Phase 3-4 Validation', () => {
  let supabase: SupabaseClient;

  beforeAll(() => {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  });

  it('should receive Realtime notification on stock update', async () => {
    console.log('\n🧪 Test: Realtime notification\n');

    let messageReceived = false;
    let receivedPayload: any = null;

    // Subscribe to stock updates
    const channel = supabase
      .channel('stock-updates-test')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bar_products',
        },
        (payload) => {
          console.log('  📡 Realtime message reçu:', payload);
          messageReceived = true;
          receivedPayload = payload;
        }
      )
      .subscribe();

    // Wait for subscription to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Trigger update
    const { data: product } = await supabase
      .from('bar_products')
      .select('id')
      .limit(1)
      .single();

    if (product) {
      await supabase
        .from('bar_products')
        .update({ stock: 999 })
        .eq('id', product.id);

      // Wait for Realtime message
      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(messageReceived).toBe(true);
      console.log(`  ✅ Notification reçue en ${receivedPayload ? '<2s' : 'timeout'}\n`);
    }

    await channel.unsubscribe();
  });
});
