import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, DollarSign, Clock, Building2, Mail, Phone, MapPin, ShieldCheck, CheckCircle, AlertCircle, GitBranch, Palette } from 'lucide-react';
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
import { ServerMappingsManager } from '../components/ServerMappingsManager';
import { FEATURES } from '../config/features';
import { useViewport } from '../hooks/useViewport';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';
import { ThemeSelector } from '../components/ThemeSelector';
import { motion } from 'framer-motion';

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
    const { currentSession } = useAuth();

    // Guide ID for settings
    const settingsGuideId = 'manage-settings';

    const [activeTab, setActiveTab] = useState<'bar' | 'operational' | 'security'>('bar');

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
                } catch (err: any) {
                    if (err.message?.includes('Auth session missing')) {
                        setMfaError("Session expirée. Veuillez vous reconnecter.");
                    } else {
                        setMfaError(err.message || "Erreur lors de la vérification MFA");
                    }
                }
            }
        };
        checkMfaStatus();
    }, [currentSession?.userId]);

    // Charger les membres du bar pour ServerMappingsManager
    useEffect(() => {
        const loadBarMembers = async () => {
            if (!currentBar?.id) return;
            try {
                const { data, error } = await supabase
                    .from('bar_members')
                    .select('user_id, role')
                    .eq('bar_id', currentBar.id)
                    .eq('is_active', true);

                if (error) throw error;

                // Enrichir avec les noms des utilisateurs
                const enrichedMembers = await Promise.all((data || []).map(async (member) => {
                    const { data: user } = await supabase
                        .from('users')
                        .select('name')
                        .eq('id', member.user_id)
                        .single();

                    return {
                        userId: member.user_id,
                        name: user?.name || 'Inconnu',
                        role: member.role
                    };
                }));

                setBarMembers(enrichedMembers);
            } catch (error) {
                console.error('[SettingsPage] Error loading bar members:', error);
            }
        };
        loadBarMembers();
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
    const [tempOperatingMode, setTempOperatingMode] = useState<'full' | 'simplified'>(currentBar?.settings?.operatingMode ?? 'simplified');

    // Tabs configuration
    const tabs = [
        {
            id: 'bar' as const,
            label: isMobile ? 'Infos Bar' : 'Informations Bar',
            icon: Building2
        },
        {
            id: 'operational' as const,
            label: isMobile ? 'Gestion' : 'Configuration de gestion',
            icon: Clock
        },
        {
            id: 'security' as const,
            label: 'Sécurité',
            icon: ShieldCheck
        }
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
        } catch (error: any) {
            setMfaError(error.message);
            showNotification('error', `Erreur d'inscription 2FA: ${error.message}`);
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
        } catch (error: any) {
            setMfaError(error.message);
            showNotification('error', `Erreur de vérification 2FA: ${error.message}`);
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
        } catch (error: any) {
            setMfaError(error.message);
            showNotification('error', `Erreur de désactivation 2FA: ${error.message}`);
        } finally {
            setMfaLoading(false);
        }
    };

    const handleSave = () => {
        updateSettings(tempSettings);
        if (currentBar) {
            updateBar(currentBar.id, {
                name: barName.trim(),
                address: barAddress.trim() || undefined,
                phone: barPhone.trim() || undefined,
                email: barEmail.trim() || undefined,
                settings: {
                    ...currentBar.settings,
                    consignmentExpirationDays: tempConsignmentExpirationDays,
                    supplyFrequency: tempSupplyFrequency,
                    operatingMode: tempOperatingMode,
                },
                closingHour: tempCloseHour,
            });
        }
        showNotification('success', 'Paramètres enregistrés');
        navigate(-1);
    };

    if (!currentBar || !currentSession) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <p className="text-gray-500">Sélectionnez un bar pour accéder aux paramètres</p>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6 pb-20 px-4">
            {/* Header Standardisé */}
            <TabbedPageHeader
                title="Paramètres"
                subtitle="Personnalisez votre établissement, configurez le mode de fonctionnement et sécurisez votre compte."
                icon={<SettingsIcon size={24} />}
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={(id) => setActiveTab(id as any)}
                guideId={settingsGuideId}
                hideSubtitleOnMobile={true}
            />

            {/* Contenu - Utilisation de Card pour l'encapsulation */}
            <Card className="p-6 space-y-8" data-guide="settings-content">

                {/* Onglet Sécurité */}
                {activeTab === 'security' && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                <ShieldCheck size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Authentification à deux facteurs (2FA)</h3>
                                <p className="text-sm text-gray-500">Sécurisez l'accès à votre compte.</p>
                            </div>
                        </div>

                        {isMfaEnabled ? (
                            <Alert variant="success" className="border-green-200 bg-green-50">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-green-800 font-bold">
                                        <CheckCircle size={20} />
                                        <span>La protection 2FA est active</span>
                                    </div>
                                    <p className="text-sm text-green-700">Votre compte est sécurisé par application d'authentification.</p>
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
                                    <div className="bg-gray-50 rounded-xl p-6 border border-gray-100 text-center space-y-4">
                                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                                            <AlertCircle size={32} className="text-gray-400" />
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="font-medium text-gray-900">La 2FA n'est pas activée</h4>
                                            <p className="text-sm text-gray-500 max-w-sm mx-auto">
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
                                    <div className="bg-white border rounded-xl p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4">
                                        <div className="text-center space-y-4">
                                            <h4 className="font-bold text-lg">1. Scannez le QR Code</h4>
                                            {qrCodeSvg && (
                                                <div className="bg-white p-4 rounded-lg border inline-block mx-auto">
                                                    <div dangerouslySetInnerHTML={{ __html: qrCodeSvg }} className="w-48 h-48" />
                                                </div>
                                            )}
                                            {mfaSecret && (
                                                <div className="text-xs text-center space-y-1">
                                                    <p className="text-gray-500">Impossible de scanner ? Entrez ce code :</p>
                                                    <code className="bg-gray-100 px-2 py-1 rounded font-mono select-all">{mfaSecret}</code>
                                                </div>
                                            )}
                                        </div>

                                        <div className="border-t pt-6 space-y-4">
                                            <h4 className="font-bold text-center">2. Entrez le code de validation</h4>
                                            <Input
                                                type="text"
                                                value={verifyCode}
                                                onChange={(e) => setVerifyCode(e.target.value)}
                                                placeholder="000 000"
                                                maxLength={6}
                                                className="text-center text-2xl tracking-[0.5em] font-mono h-14"
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

                {/* Onglet Bar */}
                {activeTab === 'bar' && (
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

                        {/* THEME SELECTOR SECTION (Feature Flagged) */}
                        {ENABLE_DYNAMIC_THEMING && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="pt-2"
                            >
                                <hr className="border-gray-100 mb-6" />
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
                                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
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
                                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                        </div>

                        <hr className="border-gray-100" />

                        {/* Section Devise */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                                <DollarSign size={16} className="text-brand-primary" />
                                Devise Principale
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
                                            ? 'bg-brand-subtle border-brand-primary shadow-sm ring-1 ring-brand-primary'
                                            : 'bg-white border-gray-200 hover:bg-gray-50'
                                            }`}
                                    >
                                        <RadioGroupItem value={currency.code} id={currency.code} />
                                        <div>
                                            <div className="font-bold text-sm text-gray-800">{currency.code}</div>
                                            <div className="text-xs text-gray-500">{currency.name}</div>
                                        </div>
                                    </label>
                                ))}
                            </RadioGroup>
                        </div>

                        <hr className="border-gray-100" />

                        {/* Section Mode Opérationnel */}
                        <div>
                            <label className="block text-lg font-bold text-gray-900 mb-4">Mode de fonctionnement</label>
                            <RadioGroup
                                value={tempOperatingMode}
                                onValueChange={(value: 'full' | 'simplified') => setTempOperatingMode(value)}
                                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                            >
                                <label className={`flex gap-4 p-4 rounded-xl cursor-pointer border-2 transition-all ${tempOperatingMode === 'full'
                                    ? 'bg-brand-subtle border-brand-primary shadow-md'
                                    : 'bg-white border-gray-100 hover:border-gray-200'
                                    }`}>
                                    <RadioGroupItem value="full" className="mt-1" />
                                    <div className="space-y-1">
                                        <div className="font-bold text-gray-900">Mode Complet</div>
                                        <p className="text-sm text-gray-600">Chaque serveur a son propre compte et gère ses tables. Idéal pour les grands établissements structurés.</p>
                                    </div>
                                </label>

                                <label className={`flex gap-4 p-4 rounded-xl cursor-pointer border-2 transition-all ${tempOperatingMode === 'simplified'
                                    ? 'bg-brand-subtle border-brand-primary shadow-md'
                                    : 'bg-white border-gray-100 hover:border-gray-200'
                                    }`}>
                                    <RadioGroupItem value="simplified" className="mt-1" />
                                    <div className="space-y-1">
                                        <div className="font-bold text-gray-900">Mode Simplifié</div>
                                        <p className="text-sm text-gray-600">Le gérant centralise les commandes et sélectionne le serveur. Idéal pour les maquis et petits bars.</p>
                                    </div>
                                </label>
                            </RadioGroup>
                        </div>

                        {tempOperatingMode === 'simplified' && FEATURES.ENABLE_SWITCHING_MODE && (
                            <div className="bg-gray-50 rounded-xl p-3 md:p-6 border border-gray-200 animate-in fade-in zoom-in-95 duration-300">
                                <div className="flex items-center gap-2 mb-4">
                                    <GitBranch size={20} className="text-brand-primary" />
                                    <h4 className="font-bold text-gray-900">Configuration du Mode Switching</h4>
                                </div>
                                <ServerMappingsManager
                                    barId={currentBar.id}
                                    barMembers={barMembers}
                                    enabled={FEATURES.SHOW_SWITCHING_MODE_UI}
                                />
                            </div>
                        )}
                    </div>
                )}
            </Card>

            {/* Footer Actions */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 md:static md:bg-transparent md:border-0 md:p-0 z-20">
                <div className="max-w-3xl mx-auto flex gap-3">
                    <Button
                        onClick={() => navigate(-1)}
                        variant="secondary"
                        size="lg"
                        className="flex-1"
                    >
                        Annuler
                    </Button>
                    <Button
                        onClick={handleSave}
                        variant="default" // Utilise le variant glass/brand par défaut
                        size="lg"
                        className="flex-1 font-bold shadow-brand"
                    >
                        Enregistrer les modifications
                    </Button>
                </div>
            </div>
        </div>
    );
}
