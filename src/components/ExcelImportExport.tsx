import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  X,
  Package,
  BarChart3,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from './EnhancedButton';
import { RoleBasedComponent } from './RoleBasedComponent';
import { getSaleDate } from '../utils/saleHelpers';


interface ExcelImportExportProps {
  isOpen: boolean;
  onClose: () => void;
}

type ExportType = 'products' | 'sales' | 'inventory' | 'users';

export function ExcelImportExport({ isOpen, onClose }: ExcelImportExportProps) {
  const { 
    products, 
    categories,
    sales,
    addProduct,
  } = useAppContext();
  const { users, hasPermission } = useAuth();
  const { showSuccess, showError, setLoading, isLoading } = useFeedback();
  
  const [dragActive, setDragActive] = useState(false);
  const [importData, setImportData] = useState<Record<string, unknown>[]>([]);
  const [importPreview, setImportPreview] = useState(false);
  const [importType, setImportType] = useState<'products' | 'sales'>('products');

  // Export vers Excel
  const exportToExcel = async (type: ExportType) => {
    setLoading(`export-${type}`, true);
    
    try {
      let data: unknown[] = [];
      let filename = '';
      
      switch (type) {
        case 'products':
          data = products.map(product => ({
            'Nom': product.name,
            'Volume': product.volume,
            'Prix (FCFA)': product.price,
            'Stock': product.stock,
            'Catégorie': categories.find(c => c.id === product.categoryId)?.name || 'N/A',
            'Seuil d\'alerte': product.alertThreshold,
            'Date création': new Date(product.createdAt).toLocaleDateString('fr-FR')
          }));
          filename = `produits_${new Date().toISOString().split('T')[0]}.xlsx`;
          break;
          
        case 'sales':
          data = sales
            .filter(sale => sale.status === 'validated')
            .flatMap(sale => {
              const saleDate = getSaleDate(sale);
              return sale.items.map(item => ({
                'Date': saleDate.toLocaleDateString('fr-FR'),
                'Heure': saleDate.toLocaleTimeString('fr-FR'),
                'Produit': item.product.name,
                'Volume': item.product.volume,
                'Quantité': item.quantity,
                'Prix unitaire': item.product.price,
                'Total': item.product.price * item.quantity,
                'Statut': sale.status,
                'Devise': sale.currency
              }));
            });
          filename = `ventes_${new Date().toISOString().split('T')[0]}.xlsx`;
          break;
          
        case 'inventory':
          data = products.map(product => ({
            'Produit': product.name,
            'Volume': product.volume,
            'Stock actuel': product.stock,
            'Seuil d\'alerte': product.alertThreshold,
            'Statut': product.stock <= product.alertThreshold ? 'CRITIQUE' : 'OK',
            'Valeur stock': product.price * product.stock
          }));
          filename = `inventaire_${new Date().toISOString().split('T')[0]}.xlsx`;
          break;
          
        case 'users':
          if (!hasPermission('canManageUsers')) {
            showError('Permission insuffisante');
            return;
          }
          data = users.map(user => ({
            'Nom': user.name,
            'Téléphone': user.phone,
            'Email': user.email || 'N/A',
            'Actif': user.isActive ? 'Oui' : 'Non',
            'Première connexion': user.firstLogin ? 'En attente' : 'Effectuée',
            'Date création': new Date(user.createdAt).toLocaleDateString('fr-FR')
          }));
          filename = `utilisateurs_${new Date().toISOString().split('T')[0]}.xlsx`;
          break;
      }
      
      // Créer le workbook Excel
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      
      // Auto-ajuster la largeur des colonnes
      const colWidths = data.length > 0 ? Object.keys(data[0] as object).map(key => ({
        wch: Math.max(
          key.length,
          ...data.map(row => String((row as Record<string, unknown>)[key] ?? '').length)
        ) + 2
      })) : [];
      ws['!cols'] = colWidths;
      
      // Ajouter la feuille au workbook
      XLSX.utils.book_append_sheet(wb, ws, type);
      
      // Télécharger le fichier
      XLSX.writeFile(wb, filename);
      
      showSuccess(`📊 ${type} exporté vers Excel`);
    } catch {
      showError('❌ Erreur lors de l\'export');
    } finally {
      setLoading(`export-${type}`, false);
    }
  };

  // Gestion du drag & drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/)) {
      showError('Format non supporté. Utilisez XLS ou XLSX');
      return;
    }

    setLoading('import', true);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Prendre la première feuille
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convertir en JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
      
      if (jsonData.length === 0) {
        showError('Fichier Excel vide');
        return;
      }

      setImportData(jsonData);
      setImportPreview(true);
      showSuccess(`${jsonData.length} lignes prêtes à importer`);
    } catch {
      showError('❌ Erreur lors de la lecture du fichier Excel');
    } finally {
      setLoading('import', false);
    }
  };

  const confirmImport = async () => {
    setLoading('confirmImport', true);
    
    try {
      let imported = 0;
      let errors = 0;

      for (const row of importData) {
        try {
          if (importType === 'products') {
            // Validation des champs requis
            if (!row.Nom || !row.Volume || !row['Prix (FCFA)'] || row.Stock === undefined) {
              continue;
            }

            // Trouver la catégorie ou utiliser la première
            const categoryId = categories.find(c => 
              c.name.toLowerCase() === (typeof row.Catégorie === 'string' ? row.Catégorie.toLowerCase() : '')
            )?.id || categories[0]?.id;

            if (!categoryId) {
              errors++;
              continue;
            }

            addProduct({
              name: String(row.Nom),
              volume: String(row.Volume),
              price: Number(row['Prix (FCFA)']) || 0,
              stock: Number(row.Stock) || 0,
              categoryId,
              alertThreshold: Number(row['Seuil d\'alerte']) || 10
            });
            imported++;
          }
        } catch {
          errors++;
        }
      }

      showSuccess(`✅ ${imported} produits importés${errors > 0 ? `, ${errors} erreurs` : ''}`);
      setImportPreview(false);
      setImportData([]);
    } catch {
      showError('❌ Erreur lors de l\'import');
    } finally {
      setLoading('confirmImport', false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-gradient-to-br from-yellow-100 to-amber-100 rounded-2xl w-full max-w-4xl max-h-[85vh] md:max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-orange-200">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-green-600" />
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Import/Export Excel</h2>
                  <p className="text-sm text-gray-600">Gérer vos données au format Excel</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/50"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              {!importPreview ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Export Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <Download size={20} className="text-blue-600" />
                      Exporter vers Excel
                    </h3>
                    
                    <div className="space-y-3">
                      <EnhancedButton
                        onClick={() => exportToExcel('products')}
                        loading={isLoading('export-products')}
                        className="w-full p-4 bg-orange-100 hover:bg-orange-200 border border-orange-300 rounded-xl flex items-center gap-3"
                      >
                        <Package size={20} className="text-orange-600" />
                        <div className="text-left">
                          <p className="font-medium text-gray-800">Produits</p>
                          <p className="text-sm text-gray-600">{products.length} produits</p>
                        </div>
                      </EnhancedButton>

                      <EnhancedButton
                        onClick={() => exportToExcel('sales')}
                        loading={isLoading('export-sales')}
                        className="w-full p-4 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-xl flex items-center gap-3"
                      >
                        <BarChart3 size={20} className="text-blue-600" />
                        <div className="text-left">
                          <p className="font-medium text-gray-800">Ventes</p>
                          <p className="text-sm text-gray-600">{sales.length} ventes</p>
                        </div>
                      </EnhancedButton>

                      <EnhancedButton
                        onClick={() => exportToExcel('inventory')}
                        loading={isLoading('export-inventory')}
                        className="w-full p-4 bg-purple-100 hover:bg-purple-200 border border-purple-300 rounded-xl flex items-center gap-3"
                      >
                        <Package size={20} className="text-purple-600" />
                        <div className="text-left">
                          <p className="font-medium text-gray-800">Inventaire</p>
                          <p className="text-sm text-gray-600">État des stocks</p>
                        </div>
                      </EnhancedButton>

                      {hasPermission('canManageUsers') && (
                        <EnhancedButton
                          onClick={() => exportToExcel('users')}
                          loading={isLoading('export-users')}
                          className="w-full p-4 bg-green-100 hover:bg-green-200 border border-green-300 rounded-xl flex items-center gap-3"
                        >
                          <Users size={20} className="text-green-600" />
                          <div className="text-left">
                            <p className="font-medium text-gray-800">Utilisateurs</p>
                            <p className="text-sm text-gray-600">{users.length} utilisateurs</p>
                          </div>
                        </EnhancedButton>
                      )}
                    </div>
                  </div>

                  {/* Import Section */}
                  <RoleBasedComponent requiredPermission="canAddProducts">
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <Upload size={20} className="text-green-600" />
                        Importer depuis Excel
                      </h3>

                      <div className="space-y-3">
                        <select
                          value={importType}
                          onChange={(e) => setImportType(e.target.value as 'products' | 'sales')}
                          className="w-full p-3 border border-orange-200 rounded-xl bg-white"
                        >
                          <option value="products">Produits</option>
                          <option value="sales" disabled>Ventes (bientôt)</option>
                        </select>

                        <div
                          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                            dragActive 
                              ? 'border-green-400 bg-green-50' 
                              : 'border-gray-300 bg-gray-50'
                          }`}
                          onDragEnter={handleDrag}
                          onDragLeave={handleDrag}
                          onDragOver={handleDrag}
                          onDrop={handleDrop}
                        >
                          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-600 mb-2">
                            Glissez un fichier Excel ici ou
                          </p>
                          <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                            className="hidden"
                            id="file-upload"
                          />
                          <label
                            htmlFor="file-upload"
                            className="text-blue-600 hover:text-blue-700 cursor-pointer font-medium"
                          >
                            cliquez pour parcourir
                          </label>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-blue-700 text-sm">
                            <strong>Colonnes attendues :</strong> Nom, Volume, Prix (FCFA), Stock, Catégorie, Seuil d'alerte
                          </p>
                        </div>
                      </div>
                    </div>
                  </RoleBasedComponent>
                </div>
              ) : (
                /* Import Preview */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-800">
                      Aperçu de l'import ({importData.length} lignes)
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setImportPreview(false)}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                      >
                        Annuler
                      </button>
                      <EnhancedButton
                        onClick={confirmImport}
                        loading={isLoading('confirmImport')}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                      >
                        Confirmer l'import
                      </EnhancedButton>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-orange-100 overflow-hidden">
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="bg-orange-50">
                          <tr>
                            {importData[0] && Object.keys(importData[0]).map(key => (
                              <th key={key} className="p-3 text-left font-medium text-gray-700">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importData.slice(0, 10).map((row, index) => (
                            <tr key={index} className="border-t border-orange-100">
                              {Object.values(row).map((value: unknown, cellIndex) => (
                                <td key={cellIndex} className="p-3 text-gray-700">
                                  {String(value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {importData.length > 10 && (
                      <div className="p-3 bg-gray-50 text-sm text-gray-600">
                        ... et {importData.length - 10} autres lignes
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}