import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UploadCloud, FileText, AlertTriangle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { useAppContext } from '../context/AppContext';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from './EnhancedButton';

interface ProductImportProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProductImport({ isOpen, onClose }: ProductImportProps) {
  const { addProduct, categories, addCategory } = useAppContext();
  const { showSuccess, showError } = useFeedback();
  const [importedProducts, setImportedProducts] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
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

    let successCount = 0;
    let errorCount = 0;
    const newCategoryNames = new Set<string>();
    let localCategories = [...categories]; // Copie locale pour la session d'import

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

        let categoryId = '';
        if (categoryName) {
          let category = localCategories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
          
          if (category) {
            categoryId = category.id;
          } else {
            const newCategory = addCategory({ name: categoryName, color: '#888888' }); // Couleur par défaut pour les nouvelles catégories
            if (newCategory) {
              categoryId = newCategory.id;
              localCategories.push(newCategory); // Ajouter à la liste locale pour les prochaines itérations
              newCategoryNames.add(newCategory.name);
            }
          }
        }

        if (!categoryId) {
          categoryId = localCategories[0]?.id || ''; // Fallback si aucune catégorie n'est trouvée ou créée
        }

        const productData = {
          name: String(nom),
          volume: String(volume),
          price: Number(prix),
          stock: Number(stock),
          categoryId: categoryId,
          alertThreshold: Number(seuilAlerte),
        };

        addProduct(productData);
        successCount++;
      } catch (e: any) {
        showError(e.message);
        errorCount++;
      }
    });

    if (successCount > 0) {
      let successMessage = `${successCount} produit(s) importé(s) avec succès.`;
      if (newCategoryNames.size > 0) {
        successMessage += ` Nouvelles catégories créées : ${[...newCategoryNames].join(', ')}.`;
      }
      showSuccess(successMessage);
    }
    
    if (errorCount === 0) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
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
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <UploadCloud className="w-6 h-6 text-orange-500" />
              <h2 className="text-xl font-bold text-gray-800">Importer des Produits</h2>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
              <X size={24} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Instructions */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-orange-800">
                  <p className="font-semibold mb-2">Format du fichier Excel (.xlsx)</p>
                  <p>Votre fichier doit contenir les colonnes suivantes :</p>
                  <ul className="list-disc list-inside mt-1 font-mono text-xs bg-orange-100 p-2 rounded">
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
              className={`p-12 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-orange-500 bg-orange-50' : 'border-gray-300 hover:border-orange-400'
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              {isDragActive ? (
                <p className="text-orange-600 font-semibold">Déposez le fichier ici...</p>
              ) : (
                <div>
                  <p className="font-semibold text-gray-700">Glissez-déposez votre fichier ici</p>
                  <p className="text-sm text-gray-500 mt-1">ou cliquez pour sélectionner</p>
                </div>
              )}
            </div>

            {/* File Info & Preview */}
            {fileName && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-6 h-6 text-gray-600" />
                    <div>
                      <p className="font-medium text-gray-800">{fileName}</p>
                      <p className="text-sm text-gray-600">{importedProducts.length} produit(s) détecté(s)</p>
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
          <div className="p-6 border-t border-gray-200 bg-gray-50">
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
