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
            case 'active': return 'bg-green-50 text-green-700 border-green-200';
            case 'scheduled': return 'bg-brand-subtle text-brand-primary border-brand-subtle';
            case 'expired': return 'bg-muted text-muted-foreground border-border';
            case 'paused': return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'draft': return 'bg-muted text-foreground/70 border-border';
            default: return 'bg-muted text-muted-foreground border-border';
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
                <p className="text-muted-foreground">Sélectionnez un bar pour gérer les promotions</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <TabbedPageHeader
                title={
                    <div className="flex items-center gap-3">
                        {isMobile ? 'Promotions' : 'Promotions'}
                        {activeCount > 0 && (
                            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-medium bg-green-50 text-green-700 border border-green-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                {activeCount} active{activeCount > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                }
                subtitle="Créez des offres stratégiques et analysez leur impact sur votre chiffre d'affaires."
                icon={<Gift size={24} aria-hidden="true" />}
                hideSubtitleOnMobile={true}
                tabs={[
                    { id: 'list', label: isMobile ? 'Catalogue' : 'Catalogue', icon: List },
                    { id: 'analytics', label: 'Analyses', icon: BarChart3 },
                    { id: 'new', label: isMobile ? 'Créer' : 'Nouvelle promotion', icon: Plus }
                ]}
                activeTab={activeTab}
                onTabChange={(id) => setActiveTab(id as 'list' | 'analytics' | 'new')}
                guideId={promotionsGuideId}
            />

            {activeTab === 'analytics' && (
                <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden min-h-[600px]">
                    <PromotionsAnalytics />
                </div>
            )}

            {activeTab === 'list' && (
                <>
                    {/* Toolbar */}
                    <div className="bg-card rounded-2xl shadow-sm border border-border p-3 sm:p-4 mb-6 flex flex-col sm:flex-row gap-3 items-center">
                        <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full" data-guide="promotions-search">
                            <div className="flex-1 relative">
                                <Input
                                    type="text"
                                    placeholder="Rechercher une promotion..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    leftIcon={<Search size={18} className="text-muted-foreground" />}
                                    className="border-border rounded-xl h-11 w-full"
                                />
                            </div>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <Select
                                    options={statusFilterOptions}
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as any)}
                                    className="border-border rounded-xl flex-1 h-11"
                                />
                            </div>
                            <Button
                                onClick={() => { setSelectedPromotion(null); setActiveTab('new'); }}
                                className="flex w-full sm:w-auto items-center justify-center gap-2 h-11 rounded-xl px-5"
                            >
                                <Plus size={17} />
                                Créer
                            </Button>
                        </div>
                    </div>

                    {/* Content */}
                    {isLoading ? (
                        <div className="flex justify-center items-center h-48">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
                        </div>
                    ) : filteredPromotions.length === 0 ? (
                        <div className="bg-card rounded-2xl border border-dashed border-border p-12 text-center flex flex-col items-center">
                            <div className="w-16 h-16 bg-brand-subtle rounded-2xl flex items-center justify-center mx-auto mb-5">
                                <Gift size={28} className="text-brand-primary" aria-hidden="true" />
                            </div>
                            <h2 className="text-h2 text-foreground mb-2">Aucune promotion trouvée</h2>
                            <p className="text-body-sm text-muted-foreground mb-7 max-w-sm mx-auto">Boostez vos ventes en créant une offre attractive pour vos clients.</p>
                            <Button
                                onClick={() => { setSelectedPromotion(null); setActiveTab('new'); }}
                                className="gap-2 rounded-xl px-6"
                            >
                                <Plus size={18} />
                                Créer ma première promotion
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            <AnimatePresence>
                                {filteredPromotions.map((promo) => (
                                    <motion.div
                                        key={promo.id}
                                        layout
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        className="group relative h-full"
                                    >
                                        <div className="bg-card rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col h-full">
                                            <div className="p-5 flex-1">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className={`px-3 py-1 rounded-full text-caption font-semibold border flex items-center gap-1.5 ${getStatusColor(promo.status)}`}>
                                                        {promo.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>}
                                                        {promo.status === 'active' ? 'Active' :
                                                            promo.status === 'scheduled' ? 'Programmée' :
                                                                promo.status === 'paused' ? 'En pause' :
                                                                    promo.status === 'expired' ? 'Expirée' : 'Brouillon'}
                                                    </div>

                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            onClick={() => handleToggleStatus(promo)}
                                                            variant="ghost"
                                                            size="icon"
                                                            className="w-8 h-8 text-muted-foreground hover:text-brand-primary hover:bg-brand-subtle rounded-lg"
                                                            aria-label={promo.status === 'active' ? 'Mettre en pause' : 'Activer'}
                                                        >
                                                            {promo.status === 'active' ? <Pause size={15} /> : <Play size={15} />}
                                                        </Button>
                                                        <Button
                                                            onClick={() => { setSelectedPromotion(promo); setActiveTab('new'); }}
                                                            variant="ghost"
                                                            size="icon"
                                                            className="w-8 h-8 text-muted-foreground hover:text-brand-primary hover:bg-brand-subtle rounded-lg"
                                                            aria-label="Modifier"
                                                        >
                                                            <Edit size={15} />
                                                        </Button>
                                                        <Button
                                                            onClick={() => handleDelete(promo.id)}
                                                            variant="ghost"
                                                            size="icon"
                                                            className="w-8 h-8 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg"
                                                            aria-label="Supprimer"
                                                        >
                                                            <Trash2 size={15} />
                                                        </Button>
                                                    </div>
                                                </div>

                                                <h2 className="text-body font-semibold text-foreground mb-1.5 leading-tight">{promo.name}</h2>
                                                <p className="text-caption text-muted-foreground mb-5 line-clamp-2">{promo.description || 'Optimisez vos ventes avec cette offre exclusive.'}</p>

                                                <div className="space-y-3">
                                                    {/* Type & Value */}
                                                    <div className="flex items-center gap-3 bg-muted p-3 rounded-xl border border-border">
                                                        <div className="w-9 h-9 rounded-lg bg-brand-subtle flex items-center justify-center text-brand-primary flex-shrink-0" aria-hidden="true">
                                                            {getTypeIcon(promo.type)}
                                                        </div>
                                                        <div>
                                                            <div className="text-body-sm font-medium text-foreground">{getTypeLabel(promo.type)}</div>
                                                            <div className="text-caption text-brand-primary font-semibold tabular-nums">
                                                                {(promo.type === 'pourcentage' || promo.type === 'percentage') && `-${promo.discountPercentage}%`}
                                                                {(promo.type === 'reduction_vente' || promo.type === 'fixed_discount') && `-${promo.discountAmount} FCFA total`}
                                                                {promo.type === 'reduction_produit' && `-${promo.discountAmount} FCFA/unité`}
                                                                {promo.type === 'majoration_produit' && `+${promo.discountAmount} FCFA/unité`}
                                                                {(promo.type === 'prix_special' || promo.type === 'special_price') && `${promo.specialPrice} FCFA/unité`}
                                                                {(promo.type === 'lot' || promo.type === 'bundle') && `${promo.bundleQuantity} pour ${promo.bundlePrice} FCFA`}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Validity */}
                                                    <div className="flex items-center gap-3 px-1">
                                                        <Calendar size={15} className="text-muted-foreground flex-shrink-0" aria-hidden="true" />
                                                        <div>
                                                            <div className="text-micro text-muted-foreground">Validité</div>
                                                            <div className="text-caption font-medium text-foreground/70">
                                                                Du {format(new Date(promo.startDate), 'dd MMM yyyy', { locale: fr })}
                                                                {promo.endDate ? ` au ${format(new Date(promo.endDate), 'dd MMM yyyy', { locale: fr })}` : ' (illimité)'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Footer */}
                                            <div className="border-t border-dashed border-border px-5 py-3 flex justify-between items-center bg-muted/50">
                                                <span className="text-micro text-muted-foreground">Usage total</span>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-h3 font-semibold text-foreground tabular-nums">{promo.currentUses || 0}</span>
                                                    <span className="text-caption text-muted-foreground">fois</span>
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
                <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                    <PromotionForm
                        isOpen={true}
                        onClose={() => setActiveTab('list')}
                        onSave={() => {
                            loadPromotions();
                            setActiveTab('list');
                        }}
                        onCancel={() => setActiveTab('list')}
                        promotion={selectedPromotion}
                    />
                </div>
            )}
        </div>
    );
}
