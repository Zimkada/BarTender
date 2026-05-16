import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UploadCloud, FileText, AlertTriangle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { useUnifiedStock } from '../hooks/pivots/useUnifiedStock';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from './EnhancedButton';

interface ProductImportProps {
  isOpen: boolean;
  onClose: () => void;
  inline?: boolean;
  onImportComplete?: () => void; // Added based on the new function signature
}

export function ProductImport({ onClose, isOpen, inline = false }: ProductImportProps) {
  const { currentBar } = useBarContext();
  const { products, categories, addProducts } = useUnifiedStock(currentBar?.id);
  const { addCategories } = useAppContext();
  const { showSuccess, showError } = useFeedback();
  const [importedProducts, setImportedProducts] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        // Lazy load XLSX library only when file is dropped (~300 Kio savings)
        const XLSX = await import('xlsx');

        const data = new Uint8Array(event.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        setImportedProducts(json);
      } catch (e) {
        showError('Erreur lors de la lecture du fichier Excel.');
        console.error(e);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
  });

  const handleImport = () => {
    if (importedProducts.length === 0) {
      showError('Aucun produit à importer.');
      return;
    }

    // 🔒 PROTECTION: Vérifier currentBar AVANT l'import
    if (!currentBar) {
      showError('Aucun bar sélectionné. Impossible d\'importer des produits.');
      return;
    }

    let errorCount = 0;
    const newCategoryNames = new Set<string>();
    const localCategories = [...categories]; // Copie locale pour la session d'import
    const existingProducts = [...products]; // Pour détecter les doublons
    const validProductsToImport: any[] = []; // ✅ Array pour batch import
    const categoriesToCreate = new Set<string>(); // ✅ Collecter catégories à créer
    const categoryCache = new Map<string, string>(); // Map: nom → ID

    // Initialiser cache avec catégories existantes
    categories.forEach(cat => {
      categoryCache.set(cat.name.toLowerCase(), cat.id);
    });

    // 1️⃣ PHASE VALIDATION: Collecter tous les produits valides
    importedProducts.forEach((product, index) => {
      try {
        const normalizedProduct: any = {};
        Object.keys(product).forEach(key => {
          normalizedProduct[key.toLowerCase().trim()] = product[key];
        });

        const nom = normalizedProduct['nom'] || normalizedProduct['name'] || normalizedProduct['produit'];
        const prix = normalizedProduct['prix'] || normalizedProduct['price'];
        const stock = normalizedProduct['stock'] || normalizedProduct['quantite'] || normalizedProduct['quantity'];
        const volume = normalizedProduct['volume'] || normalizedProduct['taille'] || '';
        const categoryName = String(normalizedProduct['categorie'] || normalizedProduct['category'] || normalizedProduct['catégorie'] || '').trim();
        const seuilAlerte = normalizedProduct['seuil alerte'] || normalizedProduct['seuil'] || normalizedProduct['alert'] || 10;

        if (!nom && !prix && !stock) {
          return; // Ignorer lignes vides
        }

        if (!nom || prix === undefined || prix === null || stock === undefined || stock === null) {
          throw new Error(`Ligne ${index + 2}: Nom, Prix, et Stock sont requis.`);
        }

        // ✅ VALIDATION NaN (Bug critique #3)
        const prixNumber = Number(prix);
        const stockNumber = Number(stock);
        const seuilNumber = Number(seuilAlerte);

        if (isNaN(prixNumber) || prixNumber < 0) {
          throw new Error(`Ligne ${index + 2}: Prix invalide (${prix}). Doit être un nombre positif.`);
        }

        if (isNaN(stockNumber) || stockNumber < 0) {
          throw new Error(`Ligne ${index + 2}: Stock invalide (${stock}). Doit être un nombre positif.`);
        }

        if (isNaN(seuilNumber) || seuilNumber < 0) {
          throw new Error(`Ligne ${index + 2}: Seuil d'alerte invalide (${seuilAlerte}). Doit être un nombre positif.`);
        }

        // ✅ DÉTECTION DOUBLONS (Bug critique #5)
        const volumeStr = String(volume).trim();
        const duplicate = existingProducts.find(p =>
          p.name.toLowerCase() === String(nom).toLowerCase() &&
          p.volume.toLowerCase() === volumeStr.toLowerCase() &&
          p.barId === currentBar.id
        );

        if (duplicate) {
          throw new Error(`Ligne ${index + 2}: Produit "${nom}" (${volumeStr || 'sans volume'}) existe déjà. Import ignoré.`);
        }

        // ✅ Vérifier doublons dans le fichier Excel lui-même
        const duplicateInFile = validProductsToImport.find(p =>
          p.name.toLowerCase() === String(nom).toLowerCase() &&
          p.volume.toLowerCase() === volumeStr.toLowerCase()
        );

        if (duplicateInFile) {
          throw new Error(`Ligne ${index + 2}: Produit "${nom}" (${volumeStr || 'sans volume'}) apparaît plusieurs fois dans le fichier. Import ignoré.`);
        }

        // ✅ Collecter les catégories à créer (ne pas créer immédiatement)
        let categoryId = '';
        if (categoryName) {
          const categoryNameLower = categoryName.toLowerCase();

          if (categoryCache.has(categoryNameLower)) {
            categoryId = categoryCache.get(categoryNameLower)!;
          } else {
            // Marquer pour création ultérieure
            categoriesToCreate.add(categoryName);
            categoryId = 'PENDING'; // Temporaire, sera résolu après création batch
          }
        }

        if (!categoryId || categoryId === 'PENDING') {
          categoryId = localCategories[0]?.id || ''; // Fallback si aucune catégorie
        }

        // ✅ FIX CRITIQUE #1: Ajouter barId manquant
        const productData = {
          barId: currentBar.id, // 🔒 CRITIQUE: Multi-tenant isolation
          name: String(nom),
          volume: volumeStr,
          price: prixNumber,
          stock: stockNumber,
          categoryId: categoryId,
          categoryName: categoryName, // ✅ Stocker pour résolution après batch
          alertThreshold: seuilNumber,
        };

        // ✅ AJOUT AU BATCH (au lieu d'appeler addProduct immédiatement)
        validProductsToImport.push(productData);

      } catch (e: any) {
        showError(e.message);
        errorCount++;
      }
    });

    // 2️⃣ PHASE BATCH CATEGORIES: Créer toutes les catégories en UNE SEULE opération
    if (categoriesToCreate.size > 0) {
      const categoriesToAdd = Array.from(categoriesToCreate).map(name => ({
        name,
        color: '#f97316' // Orange par défaut
      }));

      addCategories(categoriesToAdd)
        .then((createdCategories) => {
          // Mettre à jour le cache et localCategories
          createdCategories.forEach((cat: any) => {
            categoryCache.set(cat.name.toLowerCase(), cat.id);
            localCategories.push(cat);
            newCategoryNames.add(cat.name);
          });

          // ✅ Mettre à jour les categoryId PENDING dans validProductsToImport
          validProductsToImport.forEach(product => {
            if (!product.categoryId || product.categoryId === '' || product.categoryId === 'PENDING') {
              const categoryName = product.categoryName;
              if (categoryName) {
                const categoryId = categoryCache.get(categoryName.toLowerCase());
                if (categoryId) {
                  product.categoryId = categoryId;
                }
              }
            }
            // Nettoyer le champ temporaire categoryName
            delete product.categoryName;
          });

          // 3️⃣ PHASE IMPORT ATOMIQUE: Importer TOUS les produits valides en UNE SEULE opération
          if (validProductsToImport.length > 0) {
            addProducts(validProductsToImport);
            let successMessage = `${validProductsToImport.length} produit(s) importé(s) avec succès.`;
            if (newCategoryNames.size > 0) {
              successMessage += ` Nouvelles catégories créées : ${[...newCategoryNames].join(', ')}.`;
            }
            showSuccess(successMessage);
          }

          // Réinitialiser l'état
          if (errorCount === 0) {
            setImportedProducts([]);
            setFileName(null);
            onClose();
          }
        })
        .catch((err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : 'Erreur lors de la création des catégories';
          showError(`Échec de création des catégories: ${errorMessage}`);
          console.error('[ProductImport] Category creation failed:', err);
        });
    } else {
      // Pas de catégories à créer, import direct
      if (validProductsToImport.length > 0) {
        addProducts(validProductsToImport);
        showSuccess(`${validProductsToImport.length} produit(s) importé(s) avec succès.`);
      }

      if (errorCount === 0) {
        setImportedProducts([]);
        setFileName(null);
        onClose();
      }
    }
  };

  if (!isOpen && !inline) return null;

  const content = (
    <div className={`${inline ? '' : 'bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col'}`}>
      {!inline && (
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <UploadCloud className="w-6 h-6 text-amber-500" />
            <h2 className="text-xl font-bold text-foreground">Importer des Produits</h2>
          </div>
          <button onClick={onClose} className="p-2 text-foreground/70 hover:text-foreground/70 rounded-lg">
            <X size={24} />
          </button>
        </div>
      )}

      {/* Body */}
      <div className={`${inline ? '' : 'p-6'} space-y-6`}>
        {/* Instructions */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-2">Format du fichier Excel (.xlsx)</p>
              <p>Votre fichier doit contenir les colonnes suivantes :</p>
              <ul className="list-disc list-inside mt-1 font-mono text-xs bg-amber-100 p-2 rounded">
                <li><strong>Nom</strong> (Requis) - Nom du produit</li>
                <li>Volume (Optionnel) - Ex: 33cl, 1L, etc.</li>
                <li><strong>Prix</strong> (Requis) - Prix de vente en FCFA</li>
                <li><strong>Stock</strong> (Requis) - Quantité en stock</li>
                <li>Categorie (Optionnel) - Nom de la catégorie</li>
                <li>Seuil Alerte (Optionnel, défaut: 10)</li>
              </ul>
              <p className="mt-2 text-xs">
                ℹ️ <strong>Notes:</strong> La première ligne doit être l'en-tête.
                Les lignes vides sont ignorées automatiquement.
                Si la catégorie n'existe pas, elle sera automatiquement créée avec une couleur par défaut.
              </p>
            </div>
          </div>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`p-12 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-amber-500 bg-amber-50' : 'border-border hover:border-amber-400'
            }`}
        >
          <input {...getInputProps()} />
          <UploadCloud className="w-12 h-12 mx-auto text-foreground/70 mb-4" />
          {isDragActive ? (
            <p className="text-amber-600 font-semibold">Déposez le fichier ici...</p>
          ) : (
            <div>
              <p className="font-semibold text-foreground/80">Glissez-déposez votre fichier ici</p>
              <p className="text-sm text-muted-foreground mt-1">ou cliquez pour sélectionner</p>
            </div>
          )}
        </div>

        {/* File Info & Preview */}
        {fileName && (
          <div className="bg-muted rounded-lg p-4 border border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-foreground/70" />
                <div>
                  <p className="font-medium text-foreground">{fileName}</p>
                  <p className="text-sm text-foreground/70">{importedProducts.length} produit(s) détecté(s)</p>
                </div>
              </div>
              <button onClick={() => { setFileName(null); setImportedProducts([]); }} className="text-sm text-red-600 hover:underline">
                Changer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Actions */}
      <div className={`p-6 border-t border-border ${inline ? 'mt-4' : 'bg-muted'}`}>
        <div className="flex justify-end gap-4">
          <EnhancedButton variant="secondary" onClick={onClose}>
            Annuler
          </EnhancedButton>
          <EnhancedButton
            variant="primary"
            onClick={handleImport}
            disabled={importedProducts.length === 0}
          >
            Importer {importedProducts.length > 0 ? `(${importedProducts.length})` : ''}
          </EnhancedButton>
        </div>
      </div>
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          key="product-import-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl"
          >
            {content}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
