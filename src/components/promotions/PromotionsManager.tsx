import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus,
    Search,
    Filter,
    Calendar,
    Tag,
    Percent,
    Gift,
    DollarSign,
    XCircle,
    Trash2,
    Edit,
    Play,
    Pause,
    BarChart3,
    List
} from 'lucide-react';
import { useBarContext } from '../../context/BarContext';
import { PromotionsService } from '../../services/supabase/promotions.service';
import { Promotion, PromotionStatus, PromotionType } from '../../types';
import { useNotifications } from '../Notifications';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { EnhancedButton } from '../EnhancedButton';
import { PromotionForm } from './PromotionForm';
import { PromotionsAnalytics } from './PromotionsAnalytics';

interface PromotionsManagerProps {
    isOpen: boolean;
    onClose: () => void;
}

export function PromotionsManager({ isOpen, onClose }: PromotionsManagerProps) {
    const { currentBar } = useBarContext();
    const { showNotification } = useNotifications();
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<PromotionStatus | 'all'>('all');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
    const [view, setView] = useState<'list' | 'analytics'>('list');

    useEffect(() => {
        if (isOpen && currentBar) {
            loadPromotions();
        }
    }, [isOpen, currentBar]);

    const loadPromotions = async () => {
        if (!currentBar) return;
        setIsLoading(true);
        try {
            const data = await PromotionsService.getAllPromotions(currentBar.id);
            setPromotions(data);
        } catch (error) {
            console.error('Erreur chargement promotions:', error);
            showNotification('error', 'Impossible de charger les promotions');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette promotion ?')) return;
        try {
            await PromotionsService.deletePromotion(id);
            showNotification('success', 'Promotion supprimée');
            loadPromotions();
        } catch (error) {
            showNotification('error', 'Erreur lors de la suppression');
        }
    };

    const handleToggleStatus = async (promotion: Promotion) => {
        const newStatus = promotion.status === 'active' ? 'paused' : 'active';
        try {
            await PromotionsService.updatePromotion(promotion.id, { status: newStatus });
            showNotification('success', `Promotion ${newStatus === 'active' ? 'activée' : 'mise en pause'}`);
            loadPromotions();
        } catch (error) {
            showNotification('error', 'Erreur lors de la mise à jour du statut');
        }
    };

    const getStatusColor = (status: PromotionStatus) => {
        switch (status) {
            case 'active': return 'bg-green-100 text-green-800';
            case 'scheduled': return 'bg-blue-100 text-blue-800';
            case 'expired': return 'bg-gray-100 text-gray-800';
            case 'paused': return 'bg-amber-100 text-amber-800';
            case 'draft': return 'bg-purple-100 text-purple-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getTypeIcon = (type: PromotionType) => {
        switch (type) {
            case 'percentage': return <Percent size={18} />;
            case 'fixed_discount': return <DollarSign size={18} />;
            case 'bundle': return <Gift size={18} />;
            case 'special_price': return <Tag size={18} />;
        }
    };

    const getTypeLabel = (type: PromotionType) => {
        switch (type) {
            case 'percentage': return 'Pourcentage';
            case 'fixed_discount': return 'Réduction fixe';
            case 'bundle': return 'Offre groupée';
            case 'special_price': return 'Prix spécial';
        }
    };

    const filteredPromotions = promotions.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            >
                {/* Header */}
                <div className="p-6 border-b border-amber-200 flex justify-between items-center bg-gradient-to-r from-amber-500 to-amber-500 text-white">
                    <div className="flex items-center gap-4">
                        <div>
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <Gift className="text-white" />
                                Gestion des Promotions
                            </h2>
                            <p className="text-amber-100 text-sm mt-1">Créez et gérez vos offres spéciales</p>
                        </div>

                        {/* View Switcher */}
                        <div className="flex bg-amber-700/30 p-1 rounded-lg backdrop-blur-sm ml-8">
                            <button
                                onClick={() => setView('list')}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'list'
                                        ? 'bg-white text-amber-600 shadow-sm'
                                        : 'text-amber-100 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                <List size={16} />
                                Liste
                            </button>
                            <button
                                onClick={() => setView('analytics')}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'analytics'
                                        ? 'bg-white text-amber-600 shadow-sm'
                                        : 'text-amber-100 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                <BarChart3 size={16} />
                                Analytics
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                            <XCircle size={24} className="text-white" />
                        </button>
                    </div>
                </div>

                {view === 'analytics' ? (
                    <div className="flex-1 overflow-y-auto bg-gray-50">
                        <PromotionsAnalytics />
                    </div>
                ) : (
                    <>
                        {/* Toolbar */}
                        <div className="p-4 border-b border-amber-200 flex flex-wrap gap-4 justify-between items-center bg-white">
                            <div className="flex gap-4 flex-1">
                                <div className="relative flex-1 max-w-md">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                    <input
                                        type="text"
                                        placeholder="Rechercher une promotion..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Filter size={20} className="text-gray-400" />
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value as any)}
                                        className="border border-gray-200 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                                    >
                                        <option value="all">Tous les statuts</option>
                                        <option value="active">Actives</option>
                                        <option value="scheduled">Programmées</option>
                                        <option value="paused">En pause</option>
                                        <option value="expired">Expirées</option>
                                        <option value="draft">Brouillons</option>
                                    </select>
                                </div>
                            </div>
                            <EnhancedButton
                                variant="primary"
                                onClick={() => {
                                    setSelectedPromotion(null);
                                    setShowCreateModal(true);
                                }}
                                icon={<Plus size={20} />}
                            >
                                Nouvelle Promotion
                            </EnhancedButton>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-amber-50 to-amber-50">
                            {isLoading ? (
                                <div className="flex justify-center items-center h-64">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
                                </div>
                            ) : filteredPromotions.length === 0 ? (
                                <div className="text-center py-20">
                                    <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <Gift size={48} className="text-amber-500" />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-800 mb-2">Aucune promotion trouvée</h3>
                                    <p className="text-gray-500 mb-6">Commencez par créer votre première offre spéciale !</p>
                                    <EnhancedButton
                                        variant="primary"
                                        onClick={() => {
                                            setSelectedPromotion(null);
                                            setShowCreateModal(true);
                                        }}
                                        icon={<Plus size={20} />}
                                    >
                                        Créer une promotion
                                    </EnhancedButton>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {filteredPromotions.map((promo) => (
                                        <motion.div
                                            key={promo.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
                                        >
                                            <div className="p-5 flex-1">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${getStatusColor(promo.status)}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${promo.status === 'active' ? 'bg-green-500' : 'bg-current'}`}></span>
                                                        {promo.status === 'active' ? 'Active' :
                                                            promo.status === 'scheduled' ? 'Programmée' :
                                                                promo.status === 'paused' ? 'En pause' :
                                                                    promo.status === 'expired' ? 'Expirée' : 'Brouillon'}
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => handleToggleStatus(promo)}
                                                            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                                            title={promo.status === 'active' ? 'Mettre en pause' : 'Activer'}
                                                        >
                                                            {promo.status === 'active' ? <Pause size={18} /> : <Play size={18} />}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedPromotion(promo);
                                                                setShowCreateModal(true);
                                                            }}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Modifier"
                                                        >
                                                            <Edit size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(promo.id)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Supprimer"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <h3 className="text-lg font-bold text-gray-800 mb-2">{promo.name}</h3>
                                                <p className="text-gray-500 text-sm mb-4 line-clamp-2">{promo.description || 'Aucune description'}</p>

                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                                                            {getTypeIcon(promo.type)}
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-gray-900">{getTypeLabel(promo.type)}</div>
                                                            <div className="text-xs text-gray-500">
                                                                {promo.type === 'percentage' && `-${promo.discountPercentage}%`}
                                                                {promo.type === 'fixed_discount' && `-${promo.discountAmount} FCFA`}
                                                                {promo.type === 'special_price' && `${promo.specialPrice} FCFA`}
                                                                {promo.type === 'bundle' && `${promo.bundleQuantity} pour ${promo.bundlePrice} FCFA`}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                                                            <Calendar size={16} />
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-gray-900">Validité</div>
                                                            <div className="text-xs text-gray-500">
                                                                Du {format(new Date(promo.startDate), 'dd MMM yyyy', { locale: fr })}
                                                                {promo.endDate ? ` au ${format(new Date(promo.endDate), 'dd MMM yyyy', { locale: fr })}` : ' (Illimité)'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-sm">
                                                <span className="text-gray-500">Utilisations:</span>
                                                <span className="font-semibold text-gray-900">{promo.currentUses || 0}</span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </motion.div>

            <PromotionForm
                isOpen={showCreateModal}
                onClose={() => {
                    setShowCreateModal(false);
                    setSelectedPromotion(null);
                }}
                onSave={loadPromotions}
                initialData={selectedPromotion}
            />
        </div>
    );
}
