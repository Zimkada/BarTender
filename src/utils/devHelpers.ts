// devHelpers.ts - Utilitaires pour développement et tests
// Fonctions accessibles depuis la console du navigateur

import type { Bar } from '../types';

/**
 * Template de données pour créer un nouveau bar
 */
export const BAR_TEMPLATE: Omit<Bar, 'id' | 'createdAt' | 'ownerId'> = {
  name: 'Nouveau Bar',
  address: '123 Rue de Cotonou, Bénin',
  phone: '+229 XX XX XX XX',
  email: 'contact@bar.bj',
  isActive: true,
  closingHour: 6, // ✅ Heure de clôture (propriété directe, pas dans settings)
  settings: {
    currency: 'XOF',
    currencySymbol: ' FCFA',
    timezone: 'Africa/Porto-Novo',
    language: 'fr',
    operatingMode: 'full', // Mode complet (avec comptes serveurs)
    consignmentExpirationDays: 7, // Consignations expirent après 7 jours
  },
};

/**
 * Instructions pour créer un nouveau bar manuellement
 */
export function showBarCreationInstructions(): void {
  console.group('📋 Instructions: Créer un nouveau bar');
  console.log('1. Assurez-vous d\'être connecté en tant que promoteur');
  console.log('2. Copiez le template ci-dessous:');
  console.log('%c', 'font-weight: bold');
  console.log(JSON.stringify(BAR_TEMPLATE, null, 2));
  console.log('\n3. Modifiez les valeurs selon vos besoins');
  console.log('4. Dans la console, tapez:');
  console.log('%cconst barData = { ...votre template modifié };', 'color: #10b981; font-family: monospace');
  console.log('%clocalStorage.setItem("bars-v3", JSON.stringify([barData]));', 'color: #10b981; font-family: monospace');
  console.log('%clocation.reload();', 'color: #10b981; font-family: monospace');
  console.groupEnd();
}

/**
 * Créer un bar de test rapidement
 *
 * @example
 * ```typescript
 * // Dans la console:
 * createTestBar("Bar Test Cotonou")
 * ```
 */
export function createTestBar(name: string = 'Bar Test'): void {
  const barData: Omit<Bar, 'ownerId'> = {
    ...BAR_TEMPLATE,
    id: `bar_${Date.now()}`,
    name,
    createdAt: new Date(),
  };

  try {
    // Lire les bars existants
    const existingBars = JSON.parse(localStorage.getItem('bars-v3') || '[]');

    // Ajouter le nouveau bar
    const updatedBars = [...existingBars, { ...barData, ownerId: 'user1' }]; // user1 = promoteur par défaut

    // Sauvegarder
    localStorage.setItem('bars-v3', JSON.stringify(updatedBars));

    console.log('✅ Bar créé avec succès:', barData);
    console.log('🔄 Rechargez la page pour voir le nouveau bar');
    console.log('   location.reload()');
  } catch (error) {
    console.error('❌ Erreur lors de la création du bar:', error);
  }
}

/**
 * Lister tous les bars
 */
export function listBars(): void {
  try {
    const bars = JSON.parse(localStorage.getItem('bars-v3') || '[]');
    console.table(bars.map((b: Bar) => ({
      ID: b.id,
      Nom: b.name,
      Adresse: b.address,
      Téléphone: b.phone,
      Actif: b.isActive ? '✅' : '❌',
    })));
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

/**
 * Supprimer tous les bars (DANGER!)
 */
export function deleteAllBars(): void {
  if (!confirm('⚠️ ATTENTION: Supprimer TOUS les bars ? Cette action est irréversible !')) {
    return;
  }

  localStorage.removeItem('bars-v3');
  localStorage.removeItem('bar-members-v3');
  console.log('✅ Tous les bars ont été supprimés');
  console.log('🔄 Rechargez la page: location.reload()');
}

/**
 * Helpers de développement exposés globalement (mode dev uniquement)
 */
if (import.meta.env.DEV) {
  (window as any).__bartender = {
    createTestBar,
    listBars,
    deleteAllBars,
    showInstructions: showBarCreationInstructions,
    template: BAR_TEMPLATE,
  };

  console.log('🛠️ [Dev Helpers] Utilitaires disponibles dans window.__bartender:');
  console.log('  - createTestBar(name)   : Créer un bar de test');
  console.log('  - listBars()            : Lister tous les bars');
  console.log('  - deleteAllBars()       : Supprimer tous les bars');
  console.log('  - showInstructions()    : Afficher instructions');
  console.log('  - template              : Template de bar');
}
