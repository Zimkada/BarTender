import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, DollarSign, Clock, Building2, MapPin, Mail, Phone, ShieldCheck, CheckCircle, AlertCircle, GitBranch, UtensilsCrossed } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNotifications } from '../components/Notifications';
import { Factor } from '@supabase/supabase-js';
import { useSettings } from '../hooks/useSettings';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { RadioGroup, RadioGroupItem } from '../components/ui/Radio';
import { Checkbox } from '../components/ui/Checkbox';
import { ConfirmationModal } from '../components/common/ConfirmationModal';
import { ServerMappingsManager } from '../components/ServerMappingsManager';
import { WaBarLinkSection } from '../components/WaBarLinkSection';
import { FEATURES } from '../config/features';
import { useViewport } from '../hooks/useViewport';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';
import { ThemeSelector } from '../components/ThemeSelector';
import { motion } from 'framer-motion';
import { getErrorMessage } from '../utils/errorHandler';

// Feature Flag
const ENABLE_DYNAMIC_THEMING = import.meta.env.VITE_ENABLE_THEMING === 'true';

const currencyOptions = [
    { code: 'FCFA', symbol: 'FCFA', name: 'Franc CFA (XOF)' },
    { code: 'XAF', symbol: 'FCFA', name: 'Franc CFA (XAF)' },
    { code: 'NGN', symbol: '₦', name: 'Naira' },
    { code: 'GHS', symbol: '₵', name: 'Cedi' },
];

/**
 * SettingsPage - Page des paramètres
 * Route: /settings
 * Refactoré : Utilisation stricte du Design System (Vision 2026)
 */
export default function SettingsPage() {
    const navigate = useNavigate();
    const { settings, updateSettings } = useSettings();
    const { currentBar, updateBar } = useBarContext();
    const { showNotification } = useNotifications();
    const { isMobile } = useViewport();
    const { currentSession, hasPermission } = useAuth();

    // Guide ID for settings
    const settingsGuideId = 'manage-settings';

    // Rôles
    // 🛡️ Par permission, jamais par rôle brut (MATRICE_RBAC_CUISINIER §5.1bis).
    // L'onglet 'bar' est réservé au propriétaire de l'établissement : canCreateBars
    // a exactement ce profil (super_admin + promoteur), contrairement à
    // canManageBarInfo que le gérant possède aussi.
    const isPromoteur = hasPermission('canCreateBars');

    // Redirection automatique pour les non-promoteurs (qui n'ont pas accès à l'onglet par défaut 'bar')
    const [activeTab, setActiveTab] = useState<'bar' | 'operational' | 'security'>(() =>
        // Si l'onglet 'bar' est masqué (non-propriétaire), forcer 'operational'.
        // ⚠️ Dérivé de la MÊME permission que isPromoteur : les deux ne peuvent plus diverger.
        hasPermission('canCreateBars') ? 'bar' : 'operational'
    );

    // États 2FA
    const [isMfaEnabled, setIsMfaEnabled] = useState(false);
    const [mfaStep, setMfaStep] = useState<'idle' | 'enroll' | 'verify'>('idle');
    const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
    const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
    const [mfaSecret, setMfaSecret] = useState<string | null>(null);
    const [verifyCode, setVerifyCode] = useState('');
    const [mfaError, setMfaError] = useState('');

    const [mfaLoading, setMfaLoading] = useState(false);

    // Vérifier état MFA
    useEffect(() => {
        const checkMfaStatus = async () => {
            if (currentSession?.userId) {
                try {
                    const { data, error } = await supabase.auth.mfa.listFactors();
                    if (error) {
                        setMfaError(error.message);
                        return;
                    }
                    const totpFactor = data.all.find((f: Factor) => f.factor_type === 'totp' && f.status === 'verified');
                    setIsMfaEnabled(!!totpFactor);
                    if (totpFactor) setMfaFactorId(totpFactor.id);
                } catch (err) {
                    const errMessage = getErrorMessage(err);
                    if (errMessage.includes('Auth session missing')) {
                        setMfaError("Session expirée. Veuillez vous reconnecter.");
                    } else {
                        setMfaError(errMessage || "Erreur lors de la vérification MFA");
                    }
                }
            }
        };
        checkMfaStatus();
    }, [currentSession?.userId]);

    // Charger les membres du bar pour ServerMappingsManager
    useEffect(() => {
        const controller = new AbortController();
        let isMounted = true;

        const loadBarMembers = async () => {
            if (!currentBar?.id) return;
            try {
                const { data, error } = await supabase
                    .from('bar_members')
                    .select('user_id, role')
                    .eq('bar_id', currentBar.id)
                    .eq('is_active', true)
                    .abortSignal(controller.signal);

                if (error) {
                    if (error.code === 'ABORT') return;
                    throw error;
                }

                // Enrichir avec les noms des utilisateurs - Limitation des requêtes en cascade
                const userIds = (data || []).map(m => m.user_id).filter(Boolean) as string[];

                if (userIds.length === 0) {
                    if (isMounted) setBarMembers([]);
                    return;
                }

                const { data: users, error: userError } = await supabase
                    .from('users')
                    .select('id, name')
                    .in('id', userIds)
                    .abortSignal(controller.signal);

                if (userError) throw userError;

                const validMembers = (data || []).map(member => {
                    const user = users?.find(u => u.id === member.user_id);
                    return {
                        userId: member.user_id!,
                        name: user?.name || 'Inconnu',
                        role: member.role || 'serveur'
                    };
                });

                if (isMounted) {
                    // Optimisation : Utiliser une comparaison de longueur et d'IDs au lieu de JSON.stringify
                    setBarMembers(prev => {
                        const hasChanged = prev.length !== validMembers.length ||
                            validMembers.some((m, idx) => m.userId !== prev[idx]?.userId || m.role !== prev[idx]?.role);
                        return hasChanged ? validMembers : prev;
                    });
                }
            } catch (error) {
                // AbortError remonte quand la requête est annulée par le cleanup du useEffect
                if (error instanceof Error && error.name === 'AbortError') return;
                console.error('[SettingsPage] Error loading bar members:', error);
            }
        };

        loadBarMembers();

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [currentBar?.id]);

    // États Bar
    const [barName, setBarName] = useState(currentBar?.name ?? '');
    const [barAddress, setBarAddress] = useState(currentBar?.address ?? '');
    const [barPhone, setBarPhone] = useState(currentBar?.phone ?? '');
    const [barEmail, setBarEmail] = useState(currentBar?.email ?? '');
    const [barMembers, setBarMembers] = useState<Array<{ userId: string; name: string; role: string }>>([]);

    // États Settings
    const [tempSettings, setTempSettings] = useState(settings);
    const [tempCloseHour, setTempCloseHour] = useState(currentBar?.closingHour ?? 6);
    const [tempConsignmentExpirationDays, setTempConsignmentExpirationDays] = useState(currentBar?.settings?.consignmentExpirationDays ?? 7);
    const [tempSupplyFrequency, setTempSupplyFrequency] = useState(currentBar?.settings?.supplyFrequency ?? 7);
    const [tempOperatingMode, setTempOperatingMode] = useState<'full' | 'simplified'>(currentBar?.settings?.operatingMode ?? 'full');
    const [tempCostDisplayMethod, setTempCostDisplayMethod] = useState<'cump' | 'last_cost'>(currentBar?.settings?.costDisplayMethod ?? 'cump');
    /**
     * ⭐ RESTAURATION (§3) — jusqu'ici le drapeau se posait UNIQUEMENT en base :
     * il était lu partout (routes, menus, queries) et réglable nulle part.
     *
     * ⚠️ `=== true` et non un booléen laxiste : `undefined` doit valoir `false`.
     * Tous les bars existants sont purs, et le §3 exige qu'ils le restent —
     * l'application doit leur être STRICTEMENT identique.
     */
    const [tempHasRestaurant, setTempHasRestaurant] = useState(currentBar?.settings?.hasRestaurant === true);
    // ⭐ Confirmation à la DÉSACTIVATION seulement : activer est sans risque,
    //    désactiver fait disparaître trois écrans (§3).
    const [showRestaurantOffConfirm, setShowRestaurantOffConfirm] = useState(false);

    // BUG #3 FIX (Ajusté) : Synchronisation UNIQUEMENT lors du changement de BarId
    // On évite de synchroniser operatingMode ici car cela écrase les choix de l'utilisateur lors de refreshBars()
    useEffect(() => {
        if (currentBar) {
            setBarName(currentBar.name ?? '');
            setBarAddress(currentBar.address ?? '');
            setBarPhone(currentBar.phone ?? '');
            setBarEmail(currentBar.email ?? '');
            setTempCloseHour(currentBar.closingHour ?? 6);
            setTempConsignmentExpirationDays(currentBar.settings?.consignmentExpirationDays ?? 7);
            setTempSupplyFrequency(currentBar.settings?.supplyFrequency ?? 7);
            setTempOperatingMode(currentBar.settings?.operatingMode ?? 'full');
            setTempCostDisplayMethod(currentBar.settings?.costDisplayMethod ?? 'cump');
            setTempHasRestaurant(currentBar.settings?.hasRestaurant === true);
        }
    }, [currentBar?.id]); // ⚡ Retiré currentBar?.settings?.operatingMode des dépendances pour éviter le revert permanent

    // Tabs configuration
    // Tabs configuration - Filtrage par rôle pour sécurité robustesse
    const tabs = [
        // 1. Infos Bar: Réservé au Promoteur (Propriétaire)
        ...(isPromoteur ? [{
            id: 'bar' as const,
            label: isMobile ? 'Infos Bar' : 'Informations Bar',
            icon: Building2
        }] : []),

        // 2. Opérationnel: Visible par Gérants et Promoteurs
        {
            id: 'operational' as const,
            label: 'Fonctionnement',
            icon: Clock
        },

        // 3. Sécurité: Réservé au Promoteur (car 2FA risque de lockout sur emails fictifs des employés)
        ...(isPromoteur ? [{
            id: 'security' as const,
            label: 'Sécurité',
            icon: ShieldCheck
        }] : [])
    ];

    // Fonctions MFA
    const handleEnrollMfa = async () => {
        setMfaLoading(true);
        setMfaError('');
        try {
            const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
            if (error) throw error;
            setQrCodeSvg(data.totp.qr_code);
            setMfaSecret(data.totp.secret);
            setMfaFactorId(data.id);
            setMfaStep('verify');
            showNotification('success', 'Scannez le QR code et entrez le code de vérification.');
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            setMfaError(errorMessage);
            showNotification('error', `Erreur d'inscription 2FA: ${errorMessage}`);
        } finally {
            setMfaLoading(false);
        }
    };

    const handleVerifyMfa = async () => {
        if (!mfaFactorId || !verifyCode) {
            setMfaError('Veuillez entrer le code de vérification.');
            return;
        }
        setMfaLoading(true);
        setMfaError('');
        try {
            const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: verifyCode });
            if (error) throw error;
            setIsMfaEnabled(true);
            setMfaStep('idle');
            setQrCodeSvg(null);
            setMfaSecret(null);
            setVerifyCode('');
            showNotification('success', 'Authentification à deux facteurs activée avec succès !');
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            setMfaError(errorMessage);
            showNotification('error', `Erreur de vérification 2FA: ${errorMessage}`);
        } finally {
            setMfaLoading(false);
        }
    };

    const handleUnenrollMfa = async () => {
        if (!mfaFactorId) {
            setMfaError('Facteur 2FA introuvable.');
            return;
        }
        setMfaLoading(true);
        setMfaError('');
        try {
            const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
            if (error) throw error;
            setIsMfaEnabled(false);
            setMfaStep('idle');
            setMfaFactorId(null);
            showNotification('success', 'Authentification à deux facteurs désactivée.');
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            setMfaError(errorMessage);
            showNotification('error', `Erreur de désactivation 2FA: ${errorMessage}`);
        } finally {
            setMfaLoading(false);
        }
    };

    /**
     * ⛔⛔ L'ÉCHEC D'ENREGISTREMENT ÉTAIT SILENCIEUX — défaut trouvé à la revue
     * du 14/08/2026, PRÉEXISTANT à la case « restauration ».
     *
     * `updateBar` RELANCE l'erreur en cas d'échec serveur (BarContext.tsx:502)
     * après avoir correctement annulé sa mise à jour optimiste. Sans `try/catch`
     * ici, la promesse rejetée partait dans le handler global
     * `unhandledrejection` de `main.tsx` : ni notification de succès, ni
     * notification d'erreur, pas de navigation. Du point de vue du promoteur :
     * « j'ai cliqué Enregistrer et il ne s'est rien passé ».
     *
     * ⚠️ Le succès ne s'annonce plus qu'APRÈS l'écriture. Annoncer avant, c'est
     * affirmer un fait qu'on ne connaît pas encore.
     *
     * ⭐ Hors ligne n'est PAS un échec : `updateBar` met l'opération en file
     * (`UPDATE_BAR`) et retourne normalement. Ce chemin passe donc par la
     * branche de succès, ce qui est correct — l'écriture aura bien lieu.
     */
    const handleSave = async () => {
        updateSettings(tempSettings);

        if (!currentBar) {
            showNotification('success', 'Paramètres enregistrés');
            navigate(-1);
            return;
        }

        try {
            // ⭐ FIX CRITIQUE: Attendre la fin de updateBar() avant de naviguer
            // Sinon les updates optimistes sont perdues lors du navigate()
            await updateBar(currentBar.id, {
                name: barName.trim(),
                address: barAddress.trim() || undefined,
                phone: barPhone.trim() || undefined,
                email: barEmail.trim() || undefined,
                settings: {
                    ...currentBar.settings,
                    consignmentExpirationDays: tempConsignmentExpirationDays,
                    supplyFrequency: tempSupplyFrequency,
                    operatingMode: tempOperatingMode,
                    costDisplayMethod: tempCostDisplayMethod,
                    /**
                     * ⚠️ ÉCRIT PAR LE PROMOTEUR SEUL. L'onglet « Infos Bar » qui porte
                     * cette case n'est rendu que si `isPromoteur` — un gérant n'y accède
                     * pas, donc `tempHasRestaurant` garde la valeur lue en base et la
                     * réécrit à l'identique. Aucun écrasement possible.
                     */
                    hasRestaurant: tempHasRestaurant,
                },
                closingHour: tempCloseHour,
            });

            showNotification('success', 'Paramètres enregistrés');
            navigate(-1);
        } catch (error) {
            /**
             * ⭐ ON RESTE SUR LA PAGE, volontairement : la saisie du promoteur est
             * intacte dans les états `temp*`, il peut réessayer sans tout ressaisir.
             * Naviguer en arrière lui ferait perdre ses modifications.
             */
            showNotification('error', `Enregistrement échoué : ${getErrorMessage(error)}`);
        }
    };

    if (!currentBar || !currentSession) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <p className="text-muted-foreground">Sélectionnez un bar pour accéder aux paramètres</p>
            </div>
        );
    }

    // Sécurité : interdire l'accès à qui ne gère pas les paramètres, même par URL directe
    // 🛡️ Par permission, jamais par rôle brut (MATRICE_RBAC_CUISINIER §6) : un futur
    // rôle sans canManageSettings est refusé par défaut, au lieu d'être autorisé.
    if (!hasPermission('canManageSettings')) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 px-4">
                <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-full">
                    <ShieldCheck size={48} className="text-red-500 dark:text-red-400" />
                </div>
                <h2 className="text-h2 text-foreground">Accès non autorisé</h2>
                <p className="text-body-sm text-muted-foreground max-w-md">
                    L'accès aux paramètres est réservé aux gérants et aux propriétaires.
                    Veuillez contacter votre administrateur si nécessaire.
                </p>
                <Button onClick={() => navigate('/')} variant="outline" className="mt-4">
                    Retour à l'accueil
                </Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-brand-subtle">
            <TabbedPageHeader
                title="Paramètres"
                subtitle="Personnalisez votre établissement et sécurisez votre compte."
                icon={<SettingsIcon size={24} />}
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={(id) => setActiveTab(id as 'bar' | 'operational' | 'security')}
                guideId={settingsGuideId}
                hideSubtitleOnMobile={true}
            />

            <div className="max-w-7xl mx-auto space-y-6 pb-32 px-4">
                {/* Contenu - Utilisation de Card pour l'encapsulation */}
                <Card className="p-6 space-y-8" data-guide="settings-content">

                    {/* Onglet Sécurité (Protégé : Promoteur uniquement) */}
                    {activeTab === 'security' && isPromoteur && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-3 pb-4 border-b border-border">
                                <div className="w-10 h-10 rounded-lg bg-brand-subtle text-brand-primary flex items-center justify-center flex-shrink-0">
                                    <ShieldCheck size={20} />
                                </div>
                                <div>
                                    <h3 className="text-h3 text-foreground">Authentification à deux facteurs (2FA)</h3>
                                    <p className="text-body-sm text-muted-foreground">Sécurisez l'accès à votre compte.</p>
                                </div>
                            </div>

                            {isMfaEnabled ? (
                                <Alert variant="success" className="border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-950/30">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-green-800 dark:text-green-400 font-semibold">
                                            <CheckCircle size={20} />
                                            <span>La protection 2FA est active</span>
                                        </div>
                                        <p className="text-body-sm text-green-700 dark:text-green-300">Votre compte est sécurisé par application d'authentification.</p>
                                        <Button
                                            onClick={handleUnenrollMfa}
                                            disabled={mfaLoading}
                                            variant="destructive"
                                            size="sm"
                                        >
                                            {mfaLoading ? 'Désactivation...' : 'Désactiver la protection'}
                                        </Button>
                                    </div>
                                </Alert>
                            ) : (
                                <div className="space-y-6">
                                    {mfaStep === 'idle' && (
                                        <div className="bg-muted rounded-2xl p-6 border border-border text-center space-y-4">
                                            <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto shadow-sm">
                                                <AlertCircle size={32} className="text-muted-foreground" />
                                            </div>
                                            <div className="space-y-2">
                                                <h4 className="text-h3 text-foreground">La 2FA n'est pas activée</h4>
                                                <p className="text-body-sm text-muted-foreground max-w-sm mx-auto">
                                                    Protégez votre compte contre les accès non autorisés en activant la double authentification.
                                                </p>
                                            </div>
                                            <Button
                                                onClick={handleEnrollMfa}
                                                disabled={mfaLoading}
                                                className="w-full sm:w-auto"
                                            >
                                                {mfaLoading ? 'Préparation...' : 'Activer maintenant'}
                                            </Button>
                                        </div>
                                    )}

                                    {mfaStep === 'verify' && (
                                        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4">
                                            <div className="text-center space-y-4">
                                                <h4 className="text-h3 text-foreground">1. Scannez le QR Code</h4>
                                                {qrCodeSvg && (
                                                    <div className="bg-card p-4 rounded-lg border inline-block mx-auto">
                                                        <div dangerouslySetInnerHTML={{ __html: qrCodeSvg }} className="w-48 h-48" />
                                                    </div>
                                                )}
                                                {mfaSecret && (
                                                    <div className="text-caption text-center space-y-1">
                                                        <p className="text-muted-foreground">Impossible de scanner ? Entrez ce code :</p>
                                                        <code className="bg-muted px-2 py-1 rounded font-mono select-all tabular-nums">{mfaSecret}</code>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="border-t border-border pt-6 space-y-4">
                                                <h4 className="text-h3 text-foreground text-center">2. Entrez le code de validation</h4>
                                                <Input
                                                    type="text"
                                                    value={verifyCode}
                                                    onChange={(e) => setVerifyCode(e.target.value)}
                                                    placeholder="000 000"
                                                    maxLength={6}
                                                    className="text-center text-2xl tracking-[0.5em] font-mono tabular-nums h-14"
                                                />
                                                <div className="flex gap-3 pt-2">
                                                    <Button
                                                        onClick={() => setMfaStep('idle')}
                                                        variant="ghost"
                                                        className="flex-1"
                                                    >
                                                        Annuler
                                                    </Button>
                                                    <Button
                                                        onClick={handleVerifyMfa}
                                                        disabled={mfaLoading || verifyCode.length !== 6}
                                                        className="flex-1"
                                                    >
                                                        {mfaLoading ? 'Vérification...' : 'Confirmer'}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {mfaError && (
                                <Alert variant="destructive" title="Erreur d'authentification">
                                    {mfaError}
                                </Alert>
                            )}
                        </div>
                    )}

                    {/* Onglet Bar (Protégé : Promoteur uniquement) */}
                    {activeTab === 'bar' && isPromoteur && (
                        <div className="grid gap-6">
                            <Input
                                label="Nom de l'établissement"
                                value={barName}
                                onChange={(e) => setBarName(e.target.value)}
                                placeholder="Ex: Le Privilège"
                                leftIcon={<Building2 size={18} />}
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Input
                                    label="Numéro de téléphone"
                                    type="tel"
                                    value={barPhone}
                                    onChange={(e) => setBarPhone(e.target.value)}
                                    placeholder="Ex: 0197000000"
                                    leftIcon={<Phone size={18} />}
                                />
                                <Input
                                    label="Adresse email"
                                    type="email"
                                    value={barEmail}
                                    onChange={(e) => setBarEmail(e.target.value)}
                                    placeholder="contact@bar.com"
                                    leftIcon={<Mail size={18} />}
                                />
                            </div>

                            <Input
                                label="Adresse géographique"
                                value={barAddress}
                                onChange={(e) => setBarAddress(e.target.value)}
                                placeholder="Ex: Quartier Haie Vice, Cotonou"
                                leftIcon={<MapPin size={18} />}
                            />

                            {/*
                              * ⭐ RESTAURATION (§3) — la case qui MANQUAIT.
                              *
                              * Le drapeau `hasRestaurant` commande trois écrans (Service,
                              * Plats, Ingrédients), le rôle cuisinier et toutes les requêtes
                              * cuisine. Il était lu partout et réglable NULLE PART : un bar
                              * ne pouvait devenir bar-resto que par une écriture en base.
                              *
                              * ⛔ Onglet « Infos Bar », donc PROMOTEUR seul : faire de la
                              * restauration change la nature de l'établissement, au même
                              * titre que son nom ou son adresse. Ce n'est pas un réglage
                              * d'exploitation quotidienne.
                              */}
                            <div className="pt-2">
                                <hr className="border-border mb-6" />
                                <label className="block text-h3 text-foreground mb-4">Activité de l'établissement</label>
                                <label
                                    className={`flex gap-4 p-4 rounded-xl cursor-pointer border transition-all ${tempHasRestaurant
                                        ? 'bg-brand-subtle border-brand-primary shadow-sm'
                                        : 'bg-card border-border hover:border-brand-primary/40 hover:bg-brand-subtle'
                                        }`}
                                >
                                    <Checkbox
                                        checked={tempHasRestaurant}
                                        onCheckedChange={(checked) => {
                                            // ⭐ Activer est immédiat ; DÉSACTIVER passe par une
                                            //    confirmation — trois écrans disparaissent.
                                            if (checked === true) {
                                                setTempHasRestaurant(true);
                                            } else {
                                                setShowRestaurantOffConfirm(true);
                                            }
                                        }}
                                        className="mt-1"
                                    />
                                    <div className="space-y-1">
                                        <div className="text-body font-semibold text-foreground flex items-center gap-2">
                                            <UtensilsCrossed size={16} className="text-brand-primary" />
                                            Cet établissement fait aussi de la restauration
                                        </div>
                                        <p className="text-body-sm text-foreground/80">
                                            Ajoute la carte des plats, les ingrédients et la file de production.
                                            Un bar qui ne sert que des boissons n'a pas besoin de cette option.
                                        </p>
                                        {/*
                                          * ⭐ RASSURER SUR LA BASCULE (§20, terrain du 16/08/2026).
                                          * Un bar-restau alterne : certains soirs le gérant tient seul
                                          * le téléphone, d'autres les serveurs ont leur compte. La
                                          * restauration suit les DEUX modes — le dire évite de croire
                                          * qu'on s'enferme dans l'un d'eux en cochant.
                                          */}
                                        <p className="text-body-sm text-foreground/60 italic">
                                            Fonctionne dans les deux modes : en mode simplifié, le gérant
                                            enregistre lui-même les plats.
                                        </p>
                                    </div>
                                </label>
                            </div>

                            {/* THEME SELECTOR SECTION (Feature Flagged) */}
                            {ENABLE_DYNAMIC_THEMING && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="pt-2"
                                >
                                    <hr className="border-border mb-6" />
                                    <ThemeSelector />
                                </motion.div>
                            )}
                        </div>
                    )}

                    {/* Onglet Opérationnel */}
                    {activeTab === 'operational' && (
                        <div className="space-y-8">
                            {/* Section Heures & Délais */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <label className="text-body-sm font-medium text-foreground/80 mb-2 flex items-center gap-2">
                                        <Clock size={16} className="text-brand-primary" />
                                        Heure de clôture journalière
                                    </label>
                                    <Select
                                        value={tempCloseHour.toString()}
                                        onChange={(e) => setTempCloseHour(Number(e.target.value))}
                                        options={Array.from({ length: 24 }, (_, i) => ({
                                            value: i.toString(),
                                            label: `${i.toString().padStart(2, '0')}h00`
                                        }))}
                                        helperText="Heure de fin de votre journée comptable (ex: 06h00 pour un maquis)."
                                    />
                                </div>

                                <div>
                                    <label className="block text-body-sm font-medium text-foreground/80 mb-2">
                                        Expiration des consignations
                                    </label>
                                    <Select
                                        value={tempConsignmentExpirationDays.toString()}
                                        onChange={(e) => setTempConsignmentExpirationDays(Number(e.target.value))}
                                        options={[
                                            { value: '7', label: '7 jours (Standard)' },
                                            { value: '14', label: '14 jours - 2 semaines' },
                                            { value: '30', label: '30 jours - 1 mois' },
                                        ]}
                                        helperText="Délai avant que les produits consignés retournent en stock."
                                    />
                                </div>

                                <div>
                                    <label className="block text-body-sm font-medium text-foreground/80 mb-2">
                                        Fréquence approvisionnement
                                    </label>
                                    <Select
                                        value={tempSupplyFrequency.toString()}
                                        onChange={(e) => setTempSupplyFrequency(Number(e.target.value))}
                                        options={[
                                            { value: '7', label: '7 jours (Standard)' },
                                            { value: '14', label: '14 jours - 2 semaines' },
                                            { value: '30', label: '30 jours - 1 mois' },
                                        ]}
                                        helperText="Fréquence de réapprovisionnement automatique."
                                    />
                                </div>

                                <div>
                                    <label className="block text-body-sm font-medium text-foreground/80 mb-2">
                                        Méthode de coût (inventaire)
                                    </label>
                                    <Select
                                        value={tempCostDisplayMethod}
                                        onChange={(e) => setTempCostDisplayMethod(e.target.value as 'cump' | 'last_cost')}
                                        options={[
                                            { value: 'cump', label: 'Coût moyen pondéré (CUMP)' },
                                            { value: 'last_cost', label: 'Dernier coût d\'achat' },
                                        ]}
                                        helperText="Méthode de calcul du coût affiché dans l'inventaire. La comptabilité utilise toujours le CUMP."
                                    />
                                </div>
                            </div>

                            <hr className="border-border" />

                            {/* Section Devise */}
                            <div>
                                <label className="text-body-sm font-medium text-foreground/80 mb-3 flex items-center gap-2">
                                    <DollarSign size={16} className="text-brand-primary" />
                                    Devise principale
                                </label>
                                <RadioGroup
                                    value={tempSettings.currency}
                                    onValueChange={(value) => {
                                        const currency = currencyOptions.find(c => c.code === value);
                                        if (currency) {
                                            setTempSettings({
                                                ...tempSettings,
                                                currency: currency.code,
                                                currencySymbol: currency.symbol,
                                            });
                                        }
                                    }}
                                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
                                >
                                    {currencyOptions.map((currency) => (
                                        <label
                                            key={currency.code}
                                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${tempSettings.currency === currency.code
                                                ? 'bg-brand-subtle border-brand-primary shadow-sm'
                                                : 'bg-card border-border hover:border-brand-primary/40 hover:bg-brand-subtle'
                                                }`}
                                        >
                                            <RadioGroupItem value={currency.code} id={currency.code} />
                                            <div>
                                                <div className="text-body-sm font-semibold text-foreground">{currency.code}</div>
                                                <div className="text-caption text-muted-foreground">{currency.name}</div>
                                            </div>
                                        </label>
                                    ))}
                                </RadioGroup>
                            </div>

                            <hr className="border-border" />

                            {/* Section Mode opérationnel */}
                            <div>
                                <label className="block text-h3 text-foreground mb-4">Mode de fonctionnement</label>
                                <RadioGroup
                                    value={tempOperatingMode}
                                    onValueChange={(value: 'full' | 'simplified') => setTempOperatingMode(value)}
                                    className="grid grid-cols-1 md:grid-cols-2 gap-3"
                                >
                                    <label className={`flex gap-4 p-4 rounded-xl cursor-pointer border transition-all ${tempOperatingMode === 'full'
                                        ? 'bg-brand-subtle border-brand-primary shadow-sm'
                                        : 'bg-card border-border hover:border-brand-primary/40 hover:bg-brand-subtle'
                                        }`}>
                                        <RadioGroupItem value="full" className="mt-1" />
                                        <div className="space-y-1">
                                            <div className="text-body font-semibold text-foreground">Mode complet</div>
                                            <p className="text-body-sm text-foreground/80">Chaque serveur a son propre compte et gère ses tables. Idéal pour les grands établissements structurés.</p>
                                        </div>
                                    </label>

                                    <label className={`flex gap-4 p-4 rounded-xl cursor-pointer border transition-all ${tempOperatingMode === 'simplified'
                                        ? 'bg-brand-subtle border-brand-primary shadow-sm'
                                        : 'bg-card border-border hover:border-brand-primary/40 hover:bg-brand-subtle'
                                        }`}>
                                        <RadioGroupItem value="simplified" className="mt-1" />
                                        <div className="space-y-1">
                                            <div className="text-body font-semibold text-foreground">Mode simplifié</div>
                                            <p className="text-body-sm text-foreground/80">Le gérant centralise les commandes et sélectionne le serveur. Idéal pour les maquis et petits bars.</p>
                                        </div>
                                    </label>
                                </RadioGroup>
                            </div>

                            {tempOperatingMode === 'simplified' && FEATURES.ENABLE_SWITCHING_MODE && (
                                <div className="bg-muted rounded-xl p-3 md:p-6 border border-border animate-in fade-in zoom-in-95 duration-300">
                                    <div className="flex items-center gap-2 mb-4">
                                        <GitBranch size={20} className="text-brand-primary" />
                                        <h4 className="text-h3 text-foreground">Configuration du mode switching</h4>
                                    </div>
                                    <ServerMappingsManager
                                        barId={currentBar.id}
                                        barMembers={barMembers}
                                        enabled={FEATURES.SHOW_SWITCHING_MODE_UI}
                                    />
                                </div>
                            )}

                            <hr className="border-border" />

                            {/*
                              * ⭐ WHATSAPP ANALYSTE (whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §4/§9)
                              * Visible en Fonctionnement, pas Sécurité/Infos Bar : request_wa_bar_link
                              * autorise promoteur ET gérant à parts égales (contrairement à isPromoteur
                              * seul), donc cette section suit la visibilité du tab qui l'héberge.
                              */}
                            <WaBarLinkSection barId={currentBar.id} />
                        </div>
                    )}
                </Card>

                {/* Footer Actions — sticky en mobile */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/95 backdrop-blur-md border-t border-border md:static md:bg-transparent md:border-0 md:p-0 z-50">
                    <div className="max-w-7xl mx-auto flex flex-col-reverse sm:flex-row gap-3">
                        <Button
                            onClick={() => navigate(-1)}
                            variant="secondary"
                            size="lg"
                            className="w-full sm:flex-1 h-12"
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={handleSave}
                            variant="default"
                            size="lg"
                            className="w-full sm:flex-1 h-12"
                        >
                            Enregistrer les modifications
                        </Button>
                    </div>
                </div>
            </div>

            {/*
              * ⚠️ DÉSACTIVER NE SUPPRIME RIEN (§3) — et le message doit le dire.
              *
              * Un promoteur qui décoche cette case craint légitimement de perdre sa
              * carte et ses ventes de plats. Le drapeau MASQUE les écrans, il n'efface
              * ni les recettes, ni l'historique, ni la comptabilité. Le taire ferait
              * renoncer à un réglage inoffensif — ou pire, désactiver sans le savoir.
              */}
            <ConfirmationModal
                isOpen={showRestaurantOffConfirm}
                onClose={() => setShowRestaurantOffConfirm(false)}
                onConfirm={() => {
                    setTempHasRestaurant(false);
                    setShowRestaurantOffConfirm(false);
                }}
                title="Désactiver la restauration ?"
                message={
                    "Les écrans Service, Plats et Ingrédients disparaîtront du menu. " +
                    "Vos plats, vos recettes et vos ventes déjà enregistrées sont CONSERVÉS : " +
                    "ils restent visibles en comptabilité, et réactiver l'option les retrouvera intacts."
                }
                confirmLabel="Désactiver"
                cancelLabel="Annuler"
            />
        </div>
    );
}
