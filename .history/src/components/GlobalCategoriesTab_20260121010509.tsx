import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, Loader2 } from 'lucide-react';
import { CategoriesService } from '../services/supabase/categories.service';
import { GlobalCategory } from '../types';
import { useFeedback } from '../hooks/useFeedback';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Modal, ConfirmModal } from './ui/Modal';

export function GlobalCategoriesTab() {
    const [categories, setCategories] = useState<GlobalCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<GlobalCategory | null>(null);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [categoryToDelete, setCategoryToDelete] = useState<GlobalCategory | null>(null);
    const { showSuccess, showError } = useFeedback();

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        color: '#3B82F6',
        icon: '📦',
        orderIndex: 0
    });

    useEffect(() => {
        loadCategories();
    }, []);

    const loadCategories = async () => {
        try {
            setLoading(true);
            const data = await CategoriesService.getGlobalCategories();
            setCategories(data);
        } catch (error: any) {
            showError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (category?: GlobalCategory) => {
        if (category) {
            setEditingCategory(category);
            setFormData({
                name: category.name,
                color: category.color,
                icon: category.icon || '📦',
                orderIndex: category.orderIndex || 0
            });
        } else {
            setEditingCategory(null);
            setFormData({
                name: '',
                color: '#3B82F6',
                icon: '📦',
                orderIndex: categories.length + 1
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name) {
            showError('Le nom est requis');
            return;
        }

        try {
            if (editingCategory) {
                await CategoriesService.updateGlobalCategory(editingCategory.id, {
                    name: formData.name,
                    color: formData.color,
                    icon: formData.icon,
                    order_index: formData.orderIndex
                } as any);
                showSuccess('Catégorie mise à jour');
            } else {
                await CategoriesService.createGlobalCategory({
                    name: formData.name,
                    color: formData.color,
                    icon: formData.icon,
                    order_index: formData.orderIndex,
                    is_system: true
                } as any);
                showSuccess('Catégorie créée');
            }
            setIsModalOpen(false);
            loadCategories();
        } catch (error: any) {
            showError(error.message);
        }
    };

    const handleDeleteClick = (category: GlobalCategory) => {
        setCategoryToDelete(category);
        setDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!categoryToDelete) return;

        try {
            await CategoriesService.deleteGlobalCategory(categoryToDelete.id);
            showSuccess('Catégorie supprimée');
            setDeleteModalOpen(false);
            setCategoryToDelete(null);
            loadCategories();
        } catch (error: any) {
            // Check if error is due to RESTRICT constraint (products using this category)
            const errorMessage = error.message?.toLowerCase() || '';
            if (errorMessage.includes('restrict') || errorMessage.includes('constraint') || errorMessage.includes('fk_global_products_category')) {
                showError('Cette catégorie ne peut pas être supprimée car elle est utilisée par des produits. Supprimez d\'abord les produits qui la référencent.');
            } else {
                showError(error.message);
            }
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-800">Liste des Catégories ({categories.length})</h3>
                <Button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-4 py-2"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Nouvelle Catégorie
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categories.map((category) => (
                        <div
                            key={category.id}
                            className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between group hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-center gap-4">
                                <div
                                    className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl shadow-inner"
                                    style={{ backgroundColor: `${category.color}20` }}
                                >
                                    {category.icon || '📦'}
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900">{category.name}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: category.color }}
                                        />
                                        <span className="text-xs text-gray-500">Ordre: {category.orderIndex}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                    onClick={() => handleOpenModal(category)}
                                    variant="ghost"
                                    size="icon"
                                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                    onClick={() => handleDeleteClick(category)}
                                    variant="ghost"
                                    size="icon"
                                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <Modal
                    open={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title={editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
                    size="md"
                    footer={
                        <div className="flex justify-end gap-3 mt-8">
                            <Button
                                onClick={() => setIsModalOpen(false)}
                                variant="secondary"
                                className="px-4 py-2 text-gray-700 rounded-lg font-medium"
                            >
                                Annuler
                            </Button>
                            <Button
                                onClick={handleSave}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                Enregistrer
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="categoryName">Nom</Label>
                            <Input
                                id="categoryName"
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Ex: Bières"
                            />
                        </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <Label htmlFor="categoryIcon">Icône (Emoji)</Label>
                                                            <Input
                                                                id="categoryIcon"
                                                                type="text"
                                                                value={formData.icon}
                                                                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                                                                className="text-center text-xl"
                                                                placeholder="🍺"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label htmlFor="categoryOrderIndex">Ordre</Label>
                                                            <Input
                                                                id="categoryOrderIndex"
                                                                type="number"
                                                                value={formData.orderIndex}
                                                                onChange={(e) => setFormData({ ...formData, orderIndex: parseInt(e.target.value) })}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Couleur</label>
                                                        <div className="flex gap-2 flex-wrap">
                                                            {['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'].map((color) => (
                                                                <Button
                                                                    key={color}
                                                                    onClick={() => setFormData({ ...formData, color })}
                                                                    variant="ghost"
                                                                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 p-0 ${formData.color === color ? 'border-gray-900 scale-110' : 'border-transparent'
                                                                        }`}
                                                                    style={{ backgroundColor: color }}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>                    </div>
                </Modal>
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                open={deleteModalOpen}
                onClose={() => {
                    setDeleteModalOpen(false);
                    setCategoryToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                title="Supprimer la catégorie"
                description="Êtes-vous sûr de vouloir supprimer cette catégorie ?"
                requireConfirmation={true}
                confirmationValue={categoryToDelete?.name || ''}
                confirmationPlaceholder={categoryToDelete?.name}
                confirmText="Supprimer"
                cancelText="Annuler"
                variant="danger"
            />
        </div>
    );
}
