# Migration Manuelle - Refactoring UI SalesHistory

## Objectif
Restructurer l'interface de `SalesHistory.tsx` pour :
1.  Supprimer la sidebar (gain d'espace)
2.  Déplacer les filtres en haut (cohérence mobile/desktop)
3.  Ajouter un sélecteur de limite pour les Top Produits

---

## Étape 1 : Ajouter l'état `topProductsLimit`

**Fichier :** `src/components/SalesHistory.tsx`  
**Lieu :** Au début du composant, avec les autres `useState` (vers ligne 100)

```typescript
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('excel');
  
  // NOUVEAU : Limite Top Produits
  const [topProductsLimit, setTopProductsLimit] = useState<number>(5);
```

---

## Étape 2 : Mettre à jour le chargement des données

**Fichier :** `src/components/SalesHistory.tsx`  
**Lieu :** `useEffect` de chargement des top products (vers ligne 110)

```typescript
  // Load top products from SQL view - ONLY when in Analytics view
  useEffect(() => {
    if (!currentBar || !isOpen || viewMode !== 'analytics') return;

    const loadTopProducts = async () => {
      setIsLoadingTopProducts(true);
      try {
        // Utiliser topProductsLimit au lieu de 5
        const products = await AnalyticsService.getTopProducts(currentBar.id, startDate, endDate, topProductsLimit);
        setTopProductsData(products);
      } catch (error) {
        console.error('Error loading top products:', error);
        setTopProductsData([]);
      } finally {
        setIsLoadingTopProducts(false);
      }
    };

    loadTopProducts();
  }, [currentBar, startDate, endDate, isOpen, viewMode, topProductsLimit]); // Ajouter topProductsLimit aux dépendances
```

---

## Étape 3 : Refactoring du Layout Desktop

**Fichier :** `src/components/SalesHistory.tsx`  
**Lieu :** Section `/* ==================== VERSION DESKTOP ==================== */` (vers ligne 793)

### 3.1 Supprimer la Sidebar
Supprimer tout le bloc `div className="w-80 border-r border-amber-200..."` qui contient les statistiques et les filtres actuels.

### 3.2 Créer la nouvelle Barre de Filtres (sous le Header)

Insérer ce code juste après le Header Desktop (après la div `bg-gradient-to-r...`) et avant le contenu principal :

```tsx
                {/* Barre de filtres Desktop */}
                <div className="bg-white border-b border-amber-200 p-4 flex items-center gap-4 flex-wrap">
                  
                  {/* Recherche */}
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="ID vente ou produit..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-amber-200 rounded-lg bg-gray-50 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>

                  {/* Filtres de date */}
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    {SALES_HISTORY_FILTERS.map(filter => (
                      <button
                        key={filter}
                        onClick={() => setTimeRange(filter)}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${timeRange === filter
                          ? 'bg-white text-amber-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                          }`}
                      >
                        {TIME_RANGE_CONFIGS[filter].label}
                      </button>
                    ))}
                  </div>

                  {/* Date Range Custom */}
                  {isCustom && (
                    <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
                      <input
                        type="date"
                        value={customRange.start}
                        onChange={(e) => updateCustomRange('start', e.target.value)}
                        className="p-1.5 bg-transparent text-sm outline-none"
                      />
                      <span className="text-gray-400">-</span>
                      <input
                        type="date"
                        value={customRange.end}
                        onChange={(e) => updateCustomRange('end', e.target.value)}
                        className="p-1.5 bg-transparent text-sm outline-none"
                      />
                    </div>
                  )}

                  <div className="flex-1"></div>

                  {/* Sélecteur Limite Top Produits (Visible seulement en Analytics) */}
                  {viewMode === 'analytics' && (
                    <div className="flex items-center gap-2 mr-4">
                      <span className="text-sm text-gray-600">Top:</span>
                      <select
                        value={topProductsLimit}
                        onChange={(e) => setTopProductsLimit(Number(e.target.value))}
                        className="bg-gray-50 border border-amber-200 text-gray-700 text-sm rounded-lg focus:ring-amber-500 focus:border-amber-500 block p-2"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                  )}

                  {/* Mode d'affichage */}
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    {[
                      { value: 'list', icon: Users, label: 'Liste' },
                      { value: 'cards', icon: Eye, label: 'Détails' },
                      { value: 'analytics', icon: TrendingUp, label: 'Analytics' }
                    ].map(mode => {
                      const Icon = mode.icon;
                      return (
                        <button
                          key={mode.value}
                          onClick={() => setViewMode(mode.value as ViewMode)}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${viewMode === mode.value
                            ? 'bg-white text-amber-600 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                          <Icon size={16} />
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
```

---

## Étape 4 : Mise à jour Mobile

**Fichier :** `src/components/SalesHistory.tsx`  
**Lieu :** Section Mobile (vers ligne 646)

Ajouter le sélecteur de limite dans la section filtres mobile :

```tsx
                  {/* ... après les filtres de date ... */}
                  
                  {/* Sélecteur Limite Top Produits Mobile */}
                  {viewMode === 'analytics' && (
                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-amber-100 mb-3">
                      <span className="text-sm text-gray-600">Nombre de produits top:</span>
                      <select
                        value={topProductsLimit}
                        onChange={(e) => setTopProductsLimit(Number(e.target.value))}
                        className="bg-gray-50 border border-amber-200 text-gray-700 text-sm rounded-lg p-1.5"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                    </div>
                  )}
```

---

## Vérification

1.  **Desktop** : Plus de sidebar, filtres en haut, propre et spacieux.
2.  **Analytics** : Le changement de limite (5 -> 10) recharge bien les données.
3.  **Mobile** : Le sélecteur est accessible et fonctionne.
