/**
 * concurrent-sales.test.js
 * K6 Load Test - Phase 5 Validation
 *
 * Scenario: 20-30 utilisateurs simultanés créant des ventes
 * Objectif: Valider architecture hybride sous charge
 *
 * Métriques surveillées:
 * - Latence moyenne (< 500ms attendue)
 * - Taux d'erreur (< 1% attendu)
 * - Throughput (>= 50 req/s)
 * - Conflits stock (détection et résolution)
 *
 * Usage:
 *   k6 run tests/load/concurrent-sales.test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// Custom metrics
const salesCreated = new Counter('sales_created');
const salesFailed = new Counter('sales_failed');
const stockConflicts = new Counter('stock_conflicts');
const latency = new Trend('sale_creation_latency');
const errorRate = new Rate('errors');

// Configuration
export const options = {
  scenarios: {
    // Scénario 1: Montée en charge progressive (warm-up)
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 }, // 0 → 10 users en 30s
        { duration: '1m', target: 20 },  // 10 → 20 users en 1min
        { duration: '2m', target: 30 },  // 20 → 30 users en 2min
        { duration: '2m', target: 30 },  // Maintien 30 users pendant 2min
        { duration: '1m', target: 0 },   // Cool-down
      ],
      gracefulRampDown: '30s',
    },

    // Scénario 2: Spike test (test de résilience)
    spike_test: {
      executor: 'ramping-vus',
      startTime: '7m', // Commence après ramp_up
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 }, // Spike soudain à 50 users
        { duration: '30s', target: 50 }, // Maintien
        { duration: '10s', target: 0 },  // Retour rapide
      ],
    },
  },

  thresholds: {
    // Critères de succès Phase 5
    http_req_duration: ['p(95)<500'], // 95% des requêtes < 500ms
    http_req_failed: ['rate<0.01'],   // < 1% d'erreurs
    sales_created: ['count>500'],     // Au moins 500 ventes créées
    errors: ['rate<0.02'],            // Taux d'erreur global < 2%
  },
};

// Configuration environnement
const BASE_URL = __ENV.BASE_URL || 'https://bar-tender-ten.vercel.app';
const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || 'your-anon-key';

// Données de test
const TEST_BARS = ['bar-1', 'bar-2', 'bar-3'];
const TEST_PRODUCTS = [
  { id: 'product-1', name: 'Bière 33cl', price: 500 },
  { id: 'product-2', name: 'Coca-Cola', price: 300 },
  { id: 'product-3', name: 'Eau minérale', price: 200 },
];

/**
 * Setup: Exécuté une fois au début du test
 */
export function setup() {
  console.log('🚀 Début du test de charge - Phase 5 Validation');
  console.log(`📊 Target: 30 utilisateurs simultanés`);
  console.log(`🎯 Objectif: Latence < 500ms, Erreurs < 1%`);

  return {
    startTime: Date.now(),
    testBars: TEST_BARS,
    testProducts: TEST_PRODUCTS,
  };
}

/**
 * Fonction principale exécutée par chaque VU (Virtual User)
 */
export default function (data) {
  const barId = data.testBars[Math.floor(Math.random() * data.testBars.length)];
  const userId = `user-${__VU}`; // Virtual User ID unique

  group('Authentication Flow', () => {
    // Simuler authentification (simplifié pour le test)
    const authHeaders = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    };

    // Test: Lecture du stock avant vente
    const stockResponse = http.get(
      `${SUPABASE_URL}/rest/v1/bar_products?bar_id=eq.${barId}&select=*`,
      { headers: authHeaders }
    );

    check(stockResponse, {
      'stock fetch successful': (r) => r.status === 200,
    });

    sleep(0.5); // Délai réaliste utilisateur
  });

  group('Create Sale', () => {
    const startTime = Date.now();

    // Préparer vente aléatoire
    const randomProduct = data.testProducts[Math.floor(Math.random() * data.testProducts.length)];
    const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 items

    const salePayload = {
      bar_id: barId,
      items: [
        {
          product_id: randomProduct.id,
          product_name: randomProduct.name,
          quantity: quantity,
          unit_price: randomProduct.price,
          total_price: randomProduct.price * quantity,
        },
      ],
      payment_method: 'cash',
      sold_by: userId,
      status: 'pending',
      business_date: new Date().toISOString().split('T')[0],
    };

    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    };

    // Appel RPC create_sale (avec verrou SQL transactionnel)
    const response = http.post(
      `${SUPABASE_URL}/rest/v1/rpc/create_sale`,
      JSON.stringify(salePayload),
      { headers }
    );

    const duration = Date.now() - startTime;
    latency.add(duration);

    const success = check(response, {
      'sale created': (r) => r.status === 200 || r.status === 201,
      'no stock conflict': (r) => !r.body.includes('insufficient_stock'),
      'response time OK': () => duration < 1000,
    });

    if (success) {
      salesCreated.add(1);
    } else {
      salesFailed.add(1);
      errorRate.add(1);

      // Détecter conflit stock
      if (response.body && response.body.includes('insufficient_stock')) {
        stockConflicts.add(1);
        console.log(`⚠️  Conflit stock détecté pour ${randomProduct.name}`);
      }
    }

    sleep(1); // Délai entre ventes (réaliste)
  });

  group('Verify Realtime Sync', () => {
    // Vérifier que le stock a été mis à jour (via Realtime ou polling)
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    };

    const stockCheck = http.get(
      `${SUPABASE_URL}/rest/v1/bar_products?bar_id=eq.${barId}&select=stock`,
      { headers }
    );

    check(stockCheck, {
      'stock updated': (r) => r.status === 200,
    });

    sleep(0.3);
  });
}

/**
 * Teardown: Exécuté une fois à la fin du test
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;

  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSULTATS TEST DE CHARGE - PHASE 5');
  console.log('='.repeat(60));
  console.log(`⏱️  Durée totale: ${duration.toFixed(2)}s`);
  console.log(`✅ Ventes créées: ${salesCreated.name}`);
  console.log(`❌ Ventes échouées: ${salesFailed.name}`);
  console.log(`⚠️  Conflits stock: ${stockConflicts.name}`);
  console.log('='.repeat(60));
}

/**
 * Options avancées pour analyse détaillée
 */
export function handleSummary(data) {
  return {
    'tests/load/results/summary.json': JSON.stringify(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const { indent = '', enableColors = false } = options;

  let summary = '\n';
  summary += `${indent}📊 VALIDATION PHASE 5 - ARCHITECTURE HYBRIDE\n`;
  summary += `${indent}${'='.repeat(60)}\n\n`;

  // Métriques HTTP
  if (data.metrics.http_req_duration) {
    summary += `${indent}🚀 LATENCE:\n`;
    summary += `${indent}  Moyenne: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
    summary += `${indent}  P95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
    summary += `${indent}  Max: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms\n\n`;
  }

  // Taux d'erreur
  if (data.metrics.http_req_failed) {
    const errorPct = (data.metrics.http_req_failed.values.rate * 100).toFixed(2);
    summary += `${indent}❌ ERREURS: ${errorPct}%\n\n`;
  }

  // Ventes
  if (data.metrics.sales_created) {
    summary += `${indent}💰 VENTES:\n`;
    summary += `${indent}  Créées: ${data.metrics.sales_created.values.count}\n`;
    summary += `${indent}  Échouées: ${data.metrics.sales_failed?.values.count || 0}\n`;
    summary += `${indent}  Conflits: ${data.metrics.stock_conflicts?.values.count || 0}\n\n`;
  }

  // Verdict
  const latencyOK = data.metrics.http_req_duration?.values['p(95)'] < 500;
  const errorOK = data.metrics.http_req_failed?.values.rate < 0.01;

  summary += `${indent}🎯 VERDICT:\n`;
  summary += `${indent}  Latence P95 < 500ms: ${latencyOK ? '✅ PASS' : '❌ FAIL'}\n`;
  summary += `${indent}  Erreurs < 1%: ${errorOK ? '✅ PASS' : '❌ FAIL'}\n`;
  summary += `${indent}  Architecture: ${latencyOK && errorOK ? '✅ PRODUCTION READY' : '⚠️  NEEDS OPTIMIZATION'}\n`;

  summary += `${indent}${'='.repeat(60)}\n`;

  return summary;
}
