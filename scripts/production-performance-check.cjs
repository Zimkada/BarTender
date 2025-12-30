#!/usr/bin/env node

/**
 * Production Performance Check
 * Vérifie rapidement les aspects critiques de performance
 */

const https = require('https');
const { performance } = require('perf_hooks');

const PRODUCTION_URL = 'https://bar-tender-ten.vercel.app';

async function checkPerformance() {
  console.log('\n🔍 ANALYSE PERFORMANCE PRODUCTION\n');
  console.log('URL:', PRODUCTION_URL);
  console.log('='.repeat(60));

  // 1. Temps de réponse initial
  console.log('\n⏱️  Test de Latence...');
  const startTime = performance.now();

  await new Promise((resolve, reject) => {
    https.get(PRODUCTION_URL, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);

        console.log(`  ✅ Temps de réponse: ${latency}ms`);
        console.log(`  ✅ Status: ${res.statusCode}`);
        console.log(`  ✅ Content-Type: ${res.headers['content-type']}`);

        // 2. Headers de sécurité
        console.log('\n🔒 Headers de Sécurité:');
        const securityHeaders = [
          'strict-transport-security',
          'x-content-type-options',
          'x-frame-options',
          'content-security-policy',
          'x-xss-protection'
        ];

        securityHeaders.forEach(header => {
          const value = res.headers[header];
          const status = value ? '✅' : '❌';
          console.log(`  ${status} ${header}: ${value || 'Missing'}`);
        });

        // 3. Compression
        console.log('\n📦 Compression:');
        const encoding = res.headers['content-encoding'];
        if (encoding) {
          console.log(`  ✅ Content-Encoding: ${encoding}`);
        } else {
          console.log(`  ⚠️  Pas de compression détectée`);
        }

        // 4. Cache headers
        console.log('\n💾 Cache Headers:');
        const cacheControl = res.headers['cache-control'];
        const etag = res.headers['etag'];
        console.log(`  Cache-Control: ${cacheControl || 'Missing'}`);
        console.log(`  ETag: ${etag || 'Missing'}`);

        // 5. Taille HTML
        console.log('\n📄 Taille HTML:');
        const sizeKB = (data.length / 1024).toFixed(2);
        console.log(`  ${sizeKB} KB`);

        // 6. Vérifications PWA basiques
        console.log('\n📱 Vérifications PWA:');
        const hasManifest = data.includes('manifest.json') || data.includes('manifest.webmanifest');
        const hasServiceWorker = data.includes('serviceWorker') || data.includes('service-worker');
        const hasViewport = data.includes('viewport');
        const hasThemeColor = data.includes('theme-color');

        console.log(`  ${hasManifest ? '✅' : '❌'} Manifest déclaré`);
        console.log(`  ${hasServiceWorker ? '✅' : '❌'} Service Worker présent`);
        console.log(`  ${hasViewport ? '✅' : '❌'} Meta viewport`);
        console.log(`  ${hasThemeColor ? '✅' : '❌'} Theme color`);

        resolve();
      });
    }).on('error', reject);
  });

  // 7. Recommandations
  console.log('\n💡 RECOMMANDATIONS:\n');
  console.log('  1. Lance un audit Lighthouse complet dans Chrome DevTools');
  console.log('     → F12 > Lighthouse > Generate Report');
  console.log('  2. Vérifie le score PWA (objectif: > 90/100)');
  console.log('  3. Analyse Network tab pour vérifier le polling optimisé');
  console.log('  4. Teste en mode Incognito pour cache propre');

  console.log('\n✅ Analyse terminée!\n');
}

checkPerformance().catch(error => {
  console.error('\n❌ Erreur:', error.message);
  process.exit(1);
});
