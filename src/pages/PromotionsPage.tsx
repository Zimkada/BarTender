import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    Plus,
    Search,
    Filter,
    Calendar,
    Tag,
    Percent,
    Gift,
    DollarSign,
    Trash2,
    Edit,
    Play,
    Pause,
    BarChart3,
    List
} from 'lucide-react';
import { useBarContext } from '../context/BarContext';
import { useViewport } from '../hooks/useViewport';
import { PromotionsService } from '../services/supabase/promotions.service';
import { Promotion, PromotionStatus, PromotionType } from '../types';
import { useNotifications } from '../components/Notifications';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { EnhancedButton } from '../components/EnhancedButton';
import { PromotionForm } from '../components/promotions/PromotionForm';
import { PromotionsAnalytics } from '../components/promotions/PromotionsAnalytics';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select, SelectOption } from '../components/ui/Select';
import { DropdownMenu } from '../components/ui/DropdownMenu';
// import { useAutoGuide } from '../hooks/useGuideTrigger'; // removed
import { useOnboarding } from '../context/OnboardingContext';
import { useGuide } from '../context/GuideContext';
// import { GuideHeaderButton } from '../components/guide/GuideHeaderButton'; // removed
import { ViewSwitcherPageHeader } from '../components/common/PageHeader/patterns/ViewSwitcherPageHeader';

/**
 * PromotionsPage - Page de gestion des promotions
 * Route: /promotions
 * Refactoré de modale vers page
 */
export default function PromotionsPage() {
    const navigate = useNavigate();
    const { currentBar } = useBarContext();
    const { isMobile } = useViewport();
    const { showNotification } = useNotifications();
    const { isComplete } = useOnboarding();
    const { hasCompletedGuide } = useGuide();
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<PromotionStatus | 'all'>('all');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
    const [view, setView] = useState<'list' | 'analytics'>('list');

    // Trigger promotions guide after onboarding (first visit only)
    // Guide ID for promotions - using header button instead
    const promotionsGuideId = 'manage-promotions';

    // Auto-guide disabled - using GuideHeaderButton in page header instead
    // useAutoGuide(
    //     'manage-promotions',
    //     isComplete && !hasCompletedGuide('manage-promotions'),
    //     { delay: 1500 }
    // );

    // Options pour le filtre de statut
    const statusFilterOptions: SelectOption[] = [
        { value: 'all', label: 'Tous les statuts' },
        { value: 'active', label: 'Actives' },
        { value: 'scheduled', label: 'Programmées' },
        { value: 'paused', label: 'En pause' },
        { value: 'expired', label: 'Expirées' },
        { value: 'draft', label: 'Brouillons' },
    ];

    useEffect(() => {
        if (currentBar) {
            loadPromotions();
        }
    }, [currentBar]);

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
            case 'pourcentage':
            case 'percentage': return <Percent size={18} />;
            case 'reduction_vente':
            case 'fixed_discount':
            case 'reduction_produit':
            case 'majoration_produit': return <DollarSign size={18} />;
            case 'lot':
            case 'bundle': return <Gift size={18} />;
            case 'prix_special':
            case 'special_price': return <Tag size={18} />;
        }
    };

    const getTypeLabel = (type: PromotionType) => {
        switch (type) {
            case 'pourcentage':
            case 'percentage': return 'Pourcentage';
            case 'reduction_vente':
            case 'fixed_discount': return 'Réduction sur vente';
            case 'reduction_produit': return 'Réduction par unité';
            case 'majoration_produit': return 'Majoration par unité';
            case 'lot':
            case 'bundle': return 'Offre groupée';
            case 'prix_special':
            case 'special_price': return 'Prix spécial';
        }
    };

    const filteredPromotions = promotions.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    if (!currentBar) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <p className="text-gray-500">Sélectionnez un bar pour gérer les promotions</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            {/* Header Standardisé */}
            <ViewSwitcherPageHeader
                title="Gestion des Promotions"
                subtitle="Créez et gérez vos offres spéciales"
                icon={<Gift size={24} />}
                guideId={promotionsGuideId}
                view={view}
                onViewChange={(v) => setView(v as any)}
                viewOptions={[
                    { id: 'list', label: 'Liste', icon: List },
                    { id: 'analytics', label: 'Analytics', icon: BarChart3 }
                ]}
                actions={
                    <Button
                        onClick={() => {
                            setEditingPromotion(null);
                            setShowForm(true);
                        }}
                        variant="default"
                        className="bg-white text-amber-600 hover:bg-amber-50"
                        data-guide="promotions-add-btn"
                    >
                        <Plus size={20} className="mr-2" />
                        Nouvelle Promo
                    </Button>
                }
            />

            {view === 'analytics' ? (
                <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6">
                    <PromotionsAnalytics />
                </div>
            ) : (
                <>
                    {/* Toolbar */}
                    <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-4 mb-6 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                        <div className="flex flex-col sm:flex-row gap-4 flex-1 w-full" data-guide="promotions-search">
                            <div className="flex-1">
                                <Input
                                    type="text"
                                    placeholder="Rechercher une promotion..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    leftIcon={<Search size={20} />}
                                />
                            </div>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <Filter size={20} className="text-gray-600" />
                                <Select
                                    options={statusFilterOptions}
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as any)}
                                />
                            </div>
                        </div>
                        <EnhancedButton
                            variant="primary"
                            onClick={() => { setSelectedPromotion(null); setShowCreateModal(true); }}
                            icon={<Plus size={20} />}
                            className="w-full sm:w-auto"
                            data-guide="promotions-create-btn"
                        >
                            Nouvelle Promotion
                        </EnhancedButton>
                    </div>

                    {/* Content */}
                    {isLoading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
                        </div>
                    ) : filteredPromotions.length === 0 ? (
                        <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-12 text-center">
                            <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Gift size={48} className="text-amber-500" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-800 mb-2">Aucune promotion trouvée</h2>
                            <p className="text-gray-500 mb-6">Commencez par créer votre première offre spéciale !</p>
                            <EnhancedButton
                                variant="primary"
                                onClick={() => { setSelectedPromotion(null); setShowCreateModal(true); }}
                                icon={<Plus size={20} />}
                            >
                                Créer une promotion
                            </EnhancedButton>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 px-4 sm:px-0">
                            {filteredPromotions.map((promo) => (
                                <motion.div
                                    key={promo.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
                                    data-guide="promotions-list"
                                >
                                    <div className="p-5 flex-1">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${getStatusColor(promo.status)}`} data-guide="promotions-status">
                                                <span className={`w-1.5 h-1.5 rounded-full ${promo.status === 'active' ? 'bg-green-500' : 'bg-current'}`}></span>
                                                {promo.status === 'active' ? 'Active' :
                                                    promo.status === 'scheduled' ? 'Programmée' :
                                                        promo.status === 'paused' ? 'En pause' :
                                                            promo.status === 'expired' ? 'Expirée' : 'Brouillon'}
                                            </div>
                                            {/* Actions - Desktop buttons or mobile dropdown */}
                                            {!isMobile ? (
                                                <div className="flex gap-1">
                                                    <Button
                                                        onClick={() => handleToggleStatus(promo)}
                                                        variant="ghost"
                                                        size="icon"
                                                        className="p-1.5 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg"
                                                        title={promo.status === 'active' ? 'Pause' : 'Activer'}
                                                    >
                                                        {promo.status === 'active' ? <Pause size={18} /> : <Play size={18} />}
                                                    </Button>
                                                    <Button
                                                        onClick={() => { setSelectedPromotion(promo); setShowCreateModal(true); }}
                                                        variant="ghost"
                                                        size="icon"
                                                        className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                                    >
                                                        <Edit size={18} />
                                                    </Button>
                                                    <Button
                                                        onClick={() => handleDelete(promo.id)}
                                                        variant="ghost"
                                                        size="icon"
                                                        className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                    >
                                                        <Trash2 size={18} />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <DropdownMenu
                                                    items={[
                                                        {
                                                            label: promo.status === 'active' ? 'Pause' : 'Activer',
                                                            icon: promo.status === 'active' ? <Pause size={16} /> : <Play size={16} />,
                                                            onClick: () => handleToggleStatus(promo),
                                                        },
                                                        {
                                                            label: 'Éditer',
                                                            icon: <Edit size={16} />,
                                                            onClick: () => { setSelectedPromotion(promo); setShowCreateModal(true); },
                                                        },
                                                        {
                                                            label: 'Supprimer',
                                                            icon: <Trash2 size={16} />,
                                                            variant: 'danger',
                                                            onClick: () => handleDelete(promo.id),
                                                        },
                                                    ]}
                                                />
                                            )}
                                        </div>

                                        <h2 className="text-lg font-bold text-gray-800 mb-2">{promo.name}</h2>
                                        <p className="text-gray-500 text-sm mb-4 line-clamp-2">{promo.description || 'Aucune description'}</p>

                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                                                    {getTypeIcon(promo.type)}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-gray-900">{getTypeLabel(promo.type)}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {(promo.type === 'pourcentage' || promo.type === 'percentage') && `-${promo.discountPercentage}%`}
                                                        {(promo.type === 'reduction_vente' || promo.type === 'fixed_discount') && `-${promo.discountAmount} FCFA sur vente`}
                                                        {promo.type === 'reduction_produit' && `-${promo.discountAmount} FCFA/unité`}
                                                        {promo.type === 'majoration_produit' && `+${promo.discountAmount} FCFA/unité`}
                                                        {(promo.type === 'prix_special' || promo.type === 'special_price') && `${promo.specialPrice} FCFA`}
                                                        {(promo.type === 'lot' || promo.type === 'bundle') && `${promo.bundleQuantity} pour ${promo.bundlePrice} FCFA`}
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
                </>
            )}

            <PromotionForm
                isOpen={showCreateModal}
                onClose={() => { setShowCreateModal(false); setSelectedPromotion(null); }}
                onSave={loadPromotions}
                initialData={selectedPromotion}
            />
        </div>
    );
}
