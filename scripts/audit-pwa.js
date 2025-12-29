/**
 * PWA Pre-Implementation Audit Script
 *
 * Analyzes the application to inform PWA implementation decisions:
 * - Chunk sizes and critical paths
 * - Supabase endpoint usage
 * - Route criticality
 * - Cache recommendations
 *
 * Usage: node scripts/audit-pwa.js
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// ============================================
// 1. ANALYZE BUILD OUTPUT (chunks, sizes)
// ============================================

function analyzeBuildOutput() {
  const distPath = join(projectRoot, 'dist');
  const assetsPath = join(distPath, 'assets');

  if (!readdirSync(distPath).length) {
    console.log('⚠️  No build found. Running build first...');
    return null;
  }

  const chunks = [];
  const files = readdirSync(assetsPath);

  for (const file of files) {
    const filePath = join(assetsPath, file);
    const stats = statSync(filePath);
    const ext = extname(file);

    if (ext === '.js') {
      const content = readFileSync(filePath, 'utf-8');
      chunks.push({
        name: file,
        size: stats.size,
        sizeKB: (stats.size / 1024).toFixed(2),
        type: file.includes('vendor-') ? 'vendor' :
              file.includes('index-') ? 'main' :
              file.includes('Page-') ? 'page' :
              file.includes('Layout-') ? 'layout' : 'chunk',
        isCritical: file.includes('index-') || file.includes('Layout-'),
        hasReactQuery: content.includes('@tanstack/react-query'),
        hasSupabase: content.includes('supabase'),
        hasRechart: content.includes('recharts'),
        hasXlsx: content.includes('xlsx')
      });
    } else if (ext === '.css') {
      chunks.push({
        name: file,
        size: stats.size,
        sizeKB: (stats.size / 1024).toFixed(2),
        type: 'css',
        isCritical: true
      });
    }
  }

  // Sort by size descending
  chunks.sort((a, b) => b.size - a.size);

  return {
    totalChunks: chunks.length,
    totalSize: chunks.reduce((sum, c) => sum + c.size, 0),
    totalSizeKB: (chunks.reduce((sum, c) => sum + c.size, 0) / 1024).toFixed(2),
    totalSizeMB: (chunks.reduce((sum, c) => sum + c.size, 0) / 1024 / 1024).toFixed(2),
    chunks,
    critical: chunks.filter(c => c.isCritical),
    vendors: chunks.filter(c => c.type === 'vendor'),
    pages: chunks.filter(c => c.type === 'page'),
    css: chunks.filter(c => c.type === 'css')
  };
}

// ============================================
// 2. SCAN SUPABASE ENDPOINT USAGE
// ============================================

function scanSupabaseEndpoints(dir = join(projectRoot, 'src')) {
  const endpoints = new Set();
  const patterns = [
    /\.from\(['"`](\w+)['"`]\)/g,  // supabase.from('table')
    /\.rpc\(['"`](\w+)['"`]/g,     // supabase.rpc('function')
    /\/rest\/v1\/(\w+)/g            // Direct REST calls
  ];

  function scanFile(filePath) {
    try {
      const content = readFileSync(filePath, 'utf-8');

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          endpoints.add(match[1]);
        }
      }
    } catch (err) {
      // Ignore read errors
    }
  }

  function walkDir(currentDir) {
    const files = readdirSync(currentDir);

    for (const file of files) {
      const filePath = join(currentDir, file);
      const stat = statSync(filePath);

      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        walkDir(filePath);
      } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
        scanFile(filePath);
      }
    }
  }

  walkDir(dir);
  return Array.from(endpoints).sort();
}

// ============================================
// 3. ANALYZE ROUTES
// ============================================

function analyzeRoutes() {
  const routesFile = join(projectRoot, 'src', 'routes', 'index.tsx');
  const content = readFileSync(routesFile, 'utf-8');

  // Extract lazy loaded pages
  const lazyMatches = content.matchAll(/const (\w+) = lazyWithRetry\(\(\) => import\(['"`](.+?)['"`]\)/g);
  const routes = [];

  for (const match of lazyMatches) {
    const [, componentName, importPath] = match;
    routes.push({
      component: componentName,
      path: importPath,
      isAdmin: importPath.includes('/admin/'),
      isAuth: importPath.includes('Login') || importPath.includes('Password'),
      isCritical: ['DashboardPage', 'InventoryPage', 'SalesHistoryPage', 'HomePage'].includes(componentName)
    });
  }

  return {
    total: routes.length,
    critical: routes.filter(r => r.isCritical),
    admin: routes.filter(r => r.isAdmin),
    auth: routes.filter(r => r.isAuth),
    regular: routes.filter(r => !r.isAdmin && !r.isAuth),
    routes
  };
}

// ============================================
// 4. ANALYZE INDEXEDDB USAGE
// ============================================

function analyzeIndexedDB() {
  const indexedDBFile = join(projectRoot, 'src', 'services', 'storage', 'IndexedDBService.ts');

  try {
    const content = readFileSync(indexedDBFile, 'utf-8');

    // Extract store names
    const storeMatches = content.matchAll(/objectStore\(['"`](\w+)['"`]/g);
    const stores = new Set();

    for (const match of storeMatches) {
      stores.add(match[1]);
    }

    return {
      enabled: true,
      dbName: 'BarTenderBenin',
      stores: Array.from(stores).sort()
    };
  } catch (err) {
    return { enabled: false };
  }
}

// ============================================
// 5. GENERATE RECOMMENDATIONS
// ============================================

function generateRecommendations(buildAnalysis, routes, endpoints) {
  const recommendations = {
    precache: [],
    runtimeCache: [],
    exclude: [],
    cacheStrategies: {}
  };

  if (!buildAnalysis) {
    return recommendations;
  }

  // Critical chunks to precache (< 100 KB)
  const criticalChunks = buildAnalysis.critical
    .filter(c => c.size < 100 * 1024)
    .map(c => c.name);

  recommendations.precache = [
    '/index.html',
    '/manifest.json',
    '/offline.html',
    ...criticalChunks
  ];

  // Runtime cache for larger chunks
  const largeChunks = buildAnalysis.chunks
    .filter(c => c.size >= 100 * 1024)
    .map(c => c.name);

  recommendations.runtimeCache = largeChunks;

  // Exclude source maps
  recommendations.exclude = ['**/*.map'];

  // Cache strategies
  recommendations.cacheStrategies = {
    'app-shell': {
      pattern: '/',
      strategy: 'NetworkFirst',
      maxAgeSeconds: 24 * 60 * 60
    },
    'static-assets': {
      pattern: /\.(?:js|css|woff2?)$/,
      strategy: 'CacheFirst',
      maxAgeSeconds: 7 * 24 * 60 * 60
    },
    'supabase-api': {
      pattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/,
      strategy: 'NetworkFirst',
      networkTimeoutSeconds: 5,
      maxAgeSeconds: 15 * 60, // 15 min (aligned with discussion)
      maxEntries: 100
    },
    'images': {
      pattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
      strategy: 'CacheFirst',
      maxAgeSeconds: 30 * 24 * 60 * 60,
      maxEntries: 50
    }
  };

  // Calculate total precache size
  const precacheSize = buildAnalysis.chunks
    .filter(c => criticalChunks.includes(c.name))
    .reduce((sum, c) => sum + c.size, 0);

  recommendations.estimatedPrecacheSize = {
    bytes: precacheSize,
    kb: (precacheSize / 1024).toFixed(2),
    mb: (precacheSize / 1024 / 1024).toFixed(2)
  };

  return recommendations;
}

// ============================================
// 6. MAIN AUDIT FUNCTION
// ============================================

async function runAudit() {
  console.log('🔍 Starting PWA Pre-Implementation Audit...\n');

  const report = {
    timestamp: new Date().toISOString(),
    version: JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8')).version,
    audit: {}
  };

  // 1. Build Analysis
  console.log('📦 Analyzing build output...');
  const buildAnalysis = analyzeBuildOutput();

  if (buildAnalysis) {
    console.log(`   ✓ Found ${buildAnalysis.totalChunks} chunks (${buildAnalysis.totalSizeMB} MB)`);
    console.log(`   ✓ Critical chunks: ${buildAnalysis.critical.length}`);
    console.log(`   ✓ Vendor chunks: ${buildAnalysis.vendors.length}`);
    console.log(`   ✓ Page chunks: ${buildAnalysis.pages.length}`);
  } else {
    console.log('   ⚠️  Build not found - recommendations will be limited');
  }
  report.audit.build = buildAnalysis;

  // 2. Supabase Endpoints
  console.log('\n🔌 Scanning Supabase endpoint usage...');
  const endpoints = scanSupabaseEndpoints();
  console.log(`   ✓ Found ${endpoints.length} unique endpoints`);
  report.audit.supabaseEndpoints = endpoints;

  // 3. Routes
  console.log('\n🛣️  Analyzing routes...');
  const routesAnalysis = analyzeRoutes();
  console.log(`   ✓ Total routes: ${routesAnalysis.total}`);
  console.log(`   ✓ Critical routes: ${routesAnalysis.critical.length}`);
  console.log(`   ✓ Admin routes: ${routesAnalysis.admin.length}`);
  console.log(`   ✓ Auth routes: ${routesAnalysis.auth.length}`);
  report.audit.routes = routesAnalysis;

  // 4. IndexedDB
  console.log('\n💾 Analyzing IndexedDB usage...');
  const indexedDB = analyzeIndexedDB();
  if (indexedDB.enabled) {
    console.log(`   ✓ Database: ${indexedDB.dbName}`);
    console.log(`   ✓ Stores: ${indexedDB.stores.length}`);
  } else {
    console.log('   ⚠️  IndexedDB service not found');
  }
  report.audit.indexedDB = indexedDB;

  // 5. Recommendations
  console.log('\n💡 Generating recommendations...');
  const recommendations = generateRecommendations(buildAnalysis, routesAnalysis, endpoints);
  console.log(`   ✓ Precache candidates: ${recommendations.precache.length}`);
  if (buildAnalysis) {
    console.log(`   ✓ Estimated precache size: ${recommendations.estimatedPrecacheSize.mb} MB`);
  }
  console.log(`   ✓ Runtime cache patterns: ${recommendations.runtimeCache.length}`);
  console.log(`   ✓ Cache strategies defined: ${Object.keys(recommendations.cacheStrategies).length}`);
  report.recommendations = recommendations;

  // 6. Save Report
  const reportPath = join(projectRoot, 'pwa-audit-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Audit complete! Report saved to: ${relative(projectRoot, reportPath)}`);

  // 7. Print Summary
  printSummary(report);

  return report;
}

// ============================================
// 7. PRINT SUMMARY
// ============================================

function printSummary(report) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 PWA AUDIT SUMMARY');
  console.log('='.repeat(80));

  if (report.audit.build) {
    console.log('\n🎯 CRITICAL FINDINGS:');
    console.log(`   • Total bundle size: ${report.audit.build.totalSizeMB} MB`);
    console.log(`   • Precache budget: ${report.recommendations.estimatedPrecacheSize.mb} MB`);
    console.log(`   • Critical chunks to precache: ${report.recommendations.precache.length - 3} files`); // -3 for html/manifest/offline
    console.log(`   • Large chunks (runtime cache): ${report.recommendations.runtimeCache.length} files`);

    console.log('\n📦 TOP 5 LARGEST CHUNKS:');
    const top5 = report.audit.build.chunks.slice(0, 5);
    top5.forEach((chunk, i) => {
      console.log(`   ${i + 1}. ${chunk.name.padEnd(40)} ${chunk.sizeKB.padStart(8)} KB ${chunk.isCritical ? '⭐' : ''}`);
    });
  }

  console.log('\n🔌 SUPABASE ENDPOINTS (to cache):');
  report.audit.supabaseEndpoints.slice(0, 10).forEach(ep => {
    console.log(`   • ${ep}`);
  });
  if (report.audit.supabaseEndpoints.length > 10) {
    console.log(`   ... and ${report.audit.supabaseEndpoints.length - 10} more`);
  }

  console.log('\n🛣️  ROUTES BREAKDOWN:');
  console.log(`   • Critical routes (must precache): ${report.audit.routes.critical.length}`);
  report.audit.routes.critical.forEach(r => {
    console.log(`     - ${r.component}`);
  });
  console.log(`   • Admin routes (preload on demand): ${report.audit.routes.admin.length}`);
  console.log(`   • Regular routes (runtime cache): ${report.audit.routes.regular.length}`);

  if (report.audit.indexedDB.enabled) {
    console.log('\n💾 INDEXEDDB STORES:');
    report.audit.indexedDB.stores.forEach(store => {
      console.log(`   • ${store}`);
    });
  }

  console.log('\n💡 KEY RECOMMENDATIONS:');
  console.log('   1. Precache only critical chunks (< 100 KB each)');
  console.log('   2. Use NetworkFirst for Supabase API with 15min TTL');
  console.log('   3. Implement Background Sync for write operations');
  console.log('   4. Total offline capability: ~2-3 MB cache budget');
  console.log('   5. Monitor quota usage (target < 50 MB total)');

  console.log('\n' + '='.repeat(80));
  console.log('📝 Next Steps:');
  console.log('   1. Review pwa-audit-report.json for detailed analysis');
  console.log('   2. Adjust vite.config.ts with recommended cache strategies');
  console.log('   3. Install vite-plugin-pwa: npm install -D vite-plugin-pwa');
  console.log('   4. Configure Workbox with selective precaching');
  console.log('='.repeat(80) + '\n');
}

// ============================================
// RUN AUDIT
// ============================================

runAudit().catch(err => {
  console.error('❌ Audit failed:', err);
  process.exit(1);
});
