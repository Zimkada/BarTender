import { useState, useEffect } from 'react';
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
import { PromotionsService } from '../services/supabase/promotions.service';
import { Promotion, PromotionStatus, PromotionType } from '../types';
import { useNotifications } from '../components/Notifications';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PromotionForm } from '../components/promotions/PromotionForm';
import { PromotionsAnalytics } from '../components/promotions/PromotionsAnalytics';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select, SelectOption } from '../components/ui/Select';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';
import { motion, AnimatePresence } from 'framer-motion';
import { useViewport } from '../hooks/useViewport';

/**
 * PromotionsPage - Page de gestion des promotions
 * Route: /promotions
 */
export default function PromotionsPage() {
    const { currentBar } = useBarContext();
    const { showNotification } = useNotifications();
    const { isMobile } = useViewport();
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<PromotionStatus | 'all'>('all');
    const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
    const [activeTab, setActiveTab] = useState<'list' | 'analytics' | 'new'>('list');

    // Guide ID for promotions
    const promotionsGuideId = 'manage-promotions';

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
            case 'active': return 'bg-green-100/80 text-green-800 border-green-200';
            case 'scheduled': return 'bg-blue-100/80 text-blue-800 border-blue-200';
            case 'expired': return 'bg-gray-100/80 text-gray-800 border-gray-200';
            case 'paused': return 'bg-amber-100/80 text-amber-800 border-amber-200';
            case 'draft': return 'bg-purple-100/80 text-purple-800 border-purple-200';
            default: return 'bg-gray-100/80 text-gray-800 border-gray-200';
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

    const activeCount = promotions.filter(p => p.status === 'active').length;

    if (!currentBar) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <p className="text-gray-500">Sélectionnez un bar pour gérer les promotions</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <TabbedPageHeader
                title={
                    <div className="flex items-center gap-3">
                        {isMobile ? 'Promotions' : 'Gestion des Promotions'}
                        <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse"></span>
                            {activeCount} active{activeCount > 1 ? 's' : ''}
                        </span>
                    </div>
                }
                subtitle="Optimisez vos ventes avec des offres stratégiques"
                icon={<Gift size={24} className="text-amber-500" />}
                tabs={[
                    { id: 'list', label: isMobile ? 'Catalogue' : 'Catalogue d\'Offres', icon: List },
                    { id: 'analytics', label: 'Analyses', icon: BarChart3 },
                    { id: 'new', label: isMobile ? 'Nouveau' : 'Nouvelle Promotion', icon: Plus }
                ]}
                activeTab={activeTab}
                onTabChange={(id) => setActiveTab(id as 'list' | 'analytics' | 'new')}
                guideId={promotionsGuideId}
            />

            {activeTab === 'analytics' && (
                <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-xl border border-white/20 overflow-hidden min-h-[600px]">
                    <PromotionsAnalytics />
                </div>
            )}

            {activeTab === 'list' && (
                <>
                    {/* Toolbar Premium */}
                    <div className="bg-white/60 backdrop-blur-md rounded-2xl shadow-sm border border-white/40 p-3 sm:p-4 mb-8 flex flex-col sm:flex-row gap-4 justify-between items-center transition-all hover:bg-white/80">
                        <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full" data-guide="promotions-search">
                            <div className="flex-1 relative group">
                                <Input
                                    type="text"
                                    placeholder="Rechercher une promotion..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    leftIcon={<Search size={20} className="text-amber-500/60" />}
                                    className="bg-white/50 border-white/20 focus:border-amber-500/50 rounded-xl pl-11 h-12 transition-all w-full"
                                />
                            </div>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <div className="p-3 bg-amber-50 rounded-xl text-amber-600 hidden sm:block border border-amber-100">
                                    <Filter size={18} />
                                </div>
                                <Select
                                    options={statusFilterOptions}
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as any)}
                                    className="bg-white/50 border-white/20 rounded-xl flex-1 h-12"
                                />
                            </div>
                            <Button
                                onClick={() => { setSelectedPromotion(null); setActiveTab('new'); }}
                                className="flex w-full sm:w-auto items-center justify-center bg-gradient-to-r from-amber-500 to-orange-600 text-white border-0 shadow-lg shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 font-bold px-6 h-12 rounded-xl"
                            >
                                <Plus size={20} className="mr-2" />
                                Créer
                            </Button>
                        </div>
                    </div>

                    {/* Content */}
                    {isLoading ? (
                        <div className="flex flex-col justify-center items-center h-96 gap-4">
                            <div className="relative">
                                <div className="animate-spin rounded-full h-16 w-16 border-4 border-amber-100 border-t-amber-500"></div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Gift size={24} className="text-amber-500 animate-pulse" />
                                </div>
                            </div>
                            <p className="text-gray-400 font-medium animate-pulse">Chargement de vos offres...</p>
                        </div>
                    ) : filteredPromotions.length === 0 ? (
                        <div className="bg-white/60 backdrop-blur-sm rounded-[2.5rem] border-2 border-dashed border-amber-200 p-12 sm:p-20 text-center">
                            <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner shadow-amber-200/50">
                                <Gift size={48} className="text-amber-500" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-3">Aucune promotion trouvée</h2>
                            <p className="text-gray-500 mb-10 max-w-md mx-auto">Boostez vos ventes aujourd'hui ! Créez une offre attractive pour vos clients en quelques secondes.</p>
                            <Button
                                onClick={() => { setSelectedPromotion(null); setActiveTab('new'); }}
                                className="bg-amber-500 hover:bg-amber-600 text-white px-8 py-6 h-auto rounded-2xl font-bold transition-all shadow-lg shadow-amber-500/20"
                            >
                                <Plus size={24} className="mr-2" />
                                Créer ma première promotion
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 px-1 overflow-visible">
                            <AnimatePresence>
                                {filteredPromotions.map((promo) => (
                                    <motion.div
                                        key={promo.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        whileHover={{ y: -8 }}
                                        className="relative group h-full"
                                    >
                                        {/* Digital Ticket Decoration */}
                                        <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-50 border-r border-gray-100 z-10 hidden sm:block shadow-inner"></div>
                                        <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-50 border-l border-gray-100 z-10 hidden sm:block shadow-inner"></div>

                                        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm group-hover:shadow-2xl group-hover:border-amber-100 transition-all duration-300 overflow-hidden flex flex-col h-full">
                                            <div className="p-6 sm:p-8 flex-1">
                                                <div className="flex justify-between items-start mb-6">
                                                    <div className={`px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2 ${getStatusColor(promo.status)}`}>
                                                        <span className={`w-2 h-2 rounded-full ${promo.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-current opacity-50'}`}></span>
                                                        {promo.status === 'active' ? 'ACTIVE' :
                                                            promo.status === 'scheduled' ? 'PROGRAMMÉE' :
                                                                promo.status === 'paused' ? 'EN PAUSE' :
                                                                    promo.status === 'expired' ? 'EXPIRÉE' : 'BROUILLON'}
                                                    </div>

                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            onClick={() => handleToggleStatus(promo)}
                                                            variant="ghost"
                                                            size="icon"
                                                            className="w-10 h-10 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl"
                                                        >
                                                            {promo.status === 'active' ? <Pause size={18} /> : <Play size={18} />}
                                                        </Button>
                                                        <Button
                                                            onClick={() => { setSelectedPromotion(promo); setActiveTab('new'); }}
                                                            variant="ghost"
                                                            size="icon"
                                                            className="w-10 h-10 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl"
                                                        >
                                                            <Edit size={18} />
                                                        </Button>
                                                        <Button
                                                            onClick={() => handleDelete(promo.id)}
                                                            variant="ghost"
                                                            size="icon"
                                                            className="w-10 h-10 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl"
                                                        >
                                                            <Trash2 size={18} />
                                                        </Button>
                                                    </div>
                                                </div>

                                                <h3 className="text-xl font-black text-gray-800 mb-3 leading-tight group-hover:text-amber-600 transition-colors uppercase tracking-tight">{promo.name}</h3>
                                                <p className="text-gray-500 text-sm mb-8 line-clamp-2 leading-relaxed">{promo.description || 'Optimisez vos ventes avec cette offre exclusive.'}</p>

                                                <div className="space-y-4">
                                                    {/* Type & Value */}
                                                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:bg-amber-50 group-hover:border-amber-100 transition-colors">
                                                        <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-amber-500 shadow-sm">
                                                            {getTypeIcon(promo.type)}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-gray-900 text-sm">{getTypeLabel(promo.type)}</div>
                                                            <div className="text-xs text-amber-600 font-bold">
                                                                {(promo.type === 'pourcentage' || promo.type === 'percentage') && `-${promo.discountPercentage}%`}
                                                                {(promo.type === 'reduction_vente' || promo.type === 'fixed_discount') && `-${promo.discountAmount} FCFA TOTAL`}
                                                                {promo.type === 'reduction_produit' && `-${promo.discountAmount} FCFA/UNITÉ`}
                                                                {promo.type === 'majoration_produit' && `+${promo.discountAmount} FCFA/UNITÉ`}
                                                                {(promo.type === 'prix_special' || promo.type === 'special_price') && `${promo.specialPrice} FCFA UNITÉ`}
                                                                {(promo.type === 'lot' || promo.type === 'bundle') && `${promo.bundleQuantity} pour ${promo.bundlePrice} FCFA`}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Validity */}
                                                    <div className="flex items-center gap-4 px-2">
                                                        <div className="w-10 h-10 flex items-center justify-center text-gray-400">
                                                            <Calendar size={20} />
                                                        </div>
                                                        <div>
                                                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Validité</div>
                                                            <div className="text-xs font-semibold text-gray-600">
                                                                Du {format(new Date(promo.startDate), 'dd MMM yyyy', { locale: fr })}
                                                                {promo.endDate ? ` au ${format(new Date(promo.endDate), 'dd MMM yyyy', { locale: fr })}` : ' (Illimité)'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Footer with usage dots decoration */}
                                            <div className="relative">
                                                <div className="absolute top-0 left-0 right-0 border-t border-dashed border-gray-200"></div>
                                                <div className="px-8 py-5 flex justify-between items-center bg-slate-50/50">
                                                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Usage Total</span>
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="text-2xl font-black text-gray-900 leading-none">{promo.currentUses || 0}</span>
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase">Fois</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'new' && (
                <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-xl border border-white/20 overflow-hidden h-[calc(100vh-12rem)]">
                    <PromotionForm
                        isOpen={true}
                        onClose={() => setActiveTab('list')}
                        onSave={() => {
                            loadPromotions();
                            setActiveTab('list');
                        }}
                        initialData={selectedPromotion}
                    />
                </div>
            )}
        </div>
    );
}
