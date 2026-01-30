# BarTender Design System (Vision 2026)

> [!IMPORTANT]
> Ce document est la source de vérité pour le développement UI. Il consolide les standards techniques "Vision 2026" et remplace les anciens guides de style.

## 1. Principes Fondamentaux
- **Mobile First :** Interfaces tactiles optimisées (boutons 44px min).
- **Premium Feel :** Utilisation intensive du Glassmorphism et des Gradients.
- **Multi-Tenancy :** Toutes les couleurs de marque sont définies via des variables CSS dynamiques.

## 2. Palette & Theming (CSS Variables)

Le système repose sur des variables CSS définies dans `src/index.css`. Ne jamais hardcoder de couleurs hexadécimales pour les éléments de marque.

| Token | Variable | Usage |
|-------|----------|-------|
| **Brand Primary** | `var(--brand-primary)` | Couleur principale (Boutons, Liens) |
| **Brand Gradient** | `var(--brand-gradient)` | Headers, Boutons CTA (Action principale) |
| **Glass Background** | `glass-button-2026` | Fond translucide pour cartes et boutons secondaires |
| **Action Glass** | `glass-action-button-2026` | Boutons d'action contextuels (Retour, Edit) |

### Exemple d'usage correct
```css
.my-custom-button {
  background: var(--brand-gradient);
  color: white;
}
```

## 3. Typographie

| Style | Classes Tailwind | Usage |
|-------|------------------|-------|
| **Page Title** | `text-2xl font-bold text-gray-900` | Titre principal de page |
| **Section Title** | `text-lg font-bold text-gray-800` | Titre de section / carte |
| **Body** | `text-sm text-gray-600` | Texte standard |
| **Label** | `text-xs font-medium text-gray-500 uppercase tracking-wider` | Libellés de formulaires |

## 4. Composants Core

### Button (`src/components/ui/Button.tsx`)
Utiliser le composant `<Button>` standardisé au lieu de balises HTML natives.

- **Default :** `variant="default"` (Brand Gradient)
- **Glass :** `variant="glass"` (Style Premium translucide)
- **Ghost :** `variant="ghost"` (Actions tertiaires)

```tsx
<Button variant="glass" size="sm">
  <Edit className="w-4 h-4 mr-2" />
  Modifier
</Button>
```

### Select (`src/components/ui/Select.tsx`)
Composant de sélection natif stylisé pour s'intégrer au design system.

```tsx
<Select 
  options={[{ value: '1', label: 'Option 1' }]} 
  variant="default" 
/>
```

## 5. Utilitaires CSS "Vision 2026"
> [!NOTE]
> Ces classes sont définies dans [`src/styles/brand-utilities.css`](file:///c:/Users/HP%20ELITEBOOK/DEV/BarTender/src/styles/brand-utilities.css).
> Pour ajouter une nouvelle classe, modifiez ce fichier CSS puis ajoutez la référence dans `src/theme/constants.ts` pour l'autocomplétion.

Les noms de classes sont sémantiques :
- `.btn-brand` : Bouton principal (Gradient Ambre).
- `.liquid-gold-header` : En-tête principal avec effet de chatoiement.
- `.glass-page-header` : En-tête de page contextuel (Glassmorphism).
- `.scrollbar-bottom` : Barre de défilement horizontale stylisée.

## 6. Exceptions Autorisées & Contextuelles
Certaines zones de l'application dérogent volontairement au Brand Theme pour des raisons sémantiques.

### Zone Administration (Violet vs Or)
- **Contexte :** Pages `Admin`, `AuditLogs`, `TeamManagement`.
- **Règle :** Utilisation de la palette **Indigo/Purple** pour différencier l'environnement technique ("Back-office") de l'environnement métier ("Front-office" en Or/Ambre).
- **Implémentation :** L'usage de classes hardcodées (`bg-indigo-600`) ou de variants spécifiques est accepté ici.

### Actions Sémantiques (Vert Excel / Rouge PDF)
- **Contexte :** Boutons d'export ou actions destructrices.
- **Règle :** L'usage des couleurs fonctionnelles universelles (Vert pour Excel, Rouge pour Supprimer/PDF) prévaut sur la marque.
- **Exemple :** Bouton Export Excel (`bg-green-600`) dans `SalesHistoryPage`.

---
*Dernière mise à jour : 30 Janvier 2026*
