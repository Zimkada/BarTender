#!/usr/bin/env node

/**
 * Générateur d'icône PWA basé sur l'icône source
 *
 * Modifications:
 * - Fond transparent (pas orange)
 * - Verre ÉLARGI pour contenir le BarChart
 * - Ajouter une manche au verre
 * - Quelques petites bulles dans la bière
 */

const fs = require('fs');
const path = require('path');

// Créer le SVG de l'icône
function generateSVG() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Dégradé pour la bière -->
    <linearGradient id="beerGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#F59E0B;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#D97706;stop-opacity:1" />
    </linearGradient>

    <!-- Ombre portée -->
    <filter id="shadow">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.2"/>
    </filter>
  </defs>

  <g filter="url(#shadow)">

    <!-- Verre ÉLARGI (sans manche d'abord) -->
    <rect x="100" y="140" width="280" height="300" rx="10" ry="10"
          fill="none" stroke="#D1D5DB" stroke-width="8"/>

    <!-- Bière (remplissage) - PLUS HAUTE -->
    <rect x="108" y="180" width="264" height="252" rx="6" ry="6"
          fill="url(#beerGradient)"/>

    <!-- BarChart à l'intérieur du verre - 3 barres plus visibles -->
    <g opacity="0.85">
      <rect x="160" y="340" width="45" height="75" fill="#FFA500" rx="4"/>
      <rect x="230" y="310" width="45" height="105" fill="#FFA500" rx="4"/>
      <rect x="300" y="335" width="45" height="80" fill="#FFA500" rx="4"/>
    </g>

    <!-- LineChart avec 3 points -->
    <g opacity="0.9">
      <polyline points="170,280 240,250 310,290"
                fill="none"
                stroke="#FFFFFF"
                stroke-width="6"
                stroke-linecap="round"
                stroke-linejoin="round"/>
      <circle cx="170" cy="280" r="7" fill="#FFFFFF"/>
      <circle cx="240" cy="250" r="7" fill="#FFFFFF"/>
      <circle cx="310" cy="290" r="7" fill="#FFFFFF"/>
    </g>

    <!-- Quelques petites bulles -->
    <circle cx="130" cy="380" r="3" fill="#FFFFFF" opacity="0.6">
      <animate attributeName="cy" values="380;360;340;320;300;280;260;240" dur="4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.6;0.7;0.8;0.7;0.5;0.3;0.1;0" dur="4s" repeatCount="indefinite"/>
    </circle>
    <circle cx="200" cy="400" r="2.5" fill="#FFFFFF" opacity="0.5">
      <animate attributeName="cy" values="400;380;360;340;320;300;280;260;240" dur="4.5s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.5;0.6;0.7;0.6;0.5;0.3;0.1;0" dur="4.5s" repeatCount="indefinite"/>
    </circle>
    <circle cx="280" cy="390" r="3" fill="#FFFFFF" opacity="0.6">
      <animate attributeName="cy" values="390;370;350;330;310;290;270;250;240" dur="4.2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.6;0.7;0.8;0.7;0.6;0.4;0.2;0" dur="4.2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="350" cy="385" r="2.5" fill="#FFFFFF" opacity="0.5">
      <animate attributeName="cy" values="385;365;345;325;305;285;265;245;240" dur="4.3s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.5;0.6;0.7;0.6;0.5;0.3;0.1;0" dur="4.3s" repeatCount="indefinite"/>
    </circle>

    <!-- Mousse en haut -->
    <ellipse cx="240" cy="230" rx="135" ry="40" fill="#FFFFFF" opacity="0.95"/>
    <ellipse cx="210" cy="220" rx="65" ry="25" fill="#FFFFFF" opacity="0.9"/>
    <ellipse cx="270" cy="225" rx="60" ry="23" fill="#FFFFFF" opacity="0.85"/>
    <ellipse cx="240" cy="215" rx="50" ry="20" fill="#FFFFFF" opacity="1"/>

    <!-- Reflet sur le verre (effet transparent) -->
    <path d="M 115 160 Q 120 200 122 240 L 125 300 Q 127 350 128 400"
          fill="none"
          stroke="#FFFFFF"
          stroke-width="8"
          opacity="0.3"
          stroke-linecap="round"/>

    <!-- Manche du verre (côté droit) - PLUS LONGUE -->
    <path d="M 380 200 Q 450 200 470 250 Q 480 290 480 320 Q 480 350 470 390 Q 450 440 380 440"
          fill="none"
          stroke="#D1D5DB"
          stroke-width="16"
          opacity="0.8"/>
    <path d="M 380 200 Q 450 200 470 250 Q 480 290 480 320 Q 480 350 470 390 Q 450 440 380 440"
          fill="none"
          stroke="#FFFFFF"
          stroke-width="6"
          opacity="0.2"/>
  </g>
</svg>`;
}

// Sauvegarder le SVG
const svgContent = generateSVG();
const outputPath = path.join(__dirname, '..', 'public', 'icons', 'icon-base.svg');

// Créer le dossier si nécessaire
const iconsDir = path.dirname(outputPath);
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(outputPath, svgContent);

console.log('✅ Icône SVG générée avec succès:', outputPath);
console.log('\n📋 Prochaine étape:');
console.log('   Régénérer les PNG: node scripts/generate-png-icons.cjs');
