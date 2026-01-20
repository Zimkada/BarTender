import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings as SettingsIcon, DollarSign, Clock, Building2, Mail, Phone, MapPin, ShieldCheck, CheckCircle, AlertCircle, GitBranch } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNotifications } from '../components/Notifications';
import { Factor } from '@supabase/supabase-js'; // Import Factor type
import { useSettings } from '../hooks/useSettings';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { RadioGroup, RadioGroupItem } from '../components/ui/Radio';
import { ServerMappingsManager } from '../components/ServerMappingsManager';
import { FEATURES } from '../config/features';
import { useOnboarding } from '../context/OnboardingContext';
import { useGuide } from '../context/GuideContext';
// import { GuideHeaderButton } from '../components/guide/GuideHeaderButton'; // removed
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';

const currencyOptions = [
    { code: 'FCFA', symbol: 'FCFA', name: 'Franc CFA' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'USD', symbol: '$', name: 'Dollar US' },
    { code: 'GBP', symbol: '£', name: 'Livre Sterling' },
];

/**
 * SettingsPage - Page des paramètres
 * Route: /settings
 * Refactoré de modale vers page
 */
export default function SettingsPage() {
    const navigate = useNavigate();
    const { settings, updateSettings } = useSettings();
    const { currentBar, updateBar } = useBarContext();
    const { currentSession } = useAuth();
    const { isComplete } = useOnboarding();
    const { hasCompletedGuide } = useGuide();
    const { showNotification } = useNotifications();

    // Guide ID for settings - using header button instead
    const settingsGuideId = 'manage-settings';

    // Auto-guide disabled - using GuideHeaderButton in page header instead
    // useAutoGuide(
    //     'manage-settings',
    //     isComplete && !hasCompletedGuide('manage-settings'),
    //     { delay: 1500 }
    // );

    const [activeTab, setActiveTab] = useState<'bar' | 'operational' | 'general' | 'security'>('bar');

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
                } catch (err: unknown) {
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

    // ✨ NOUVEAU: Charger les membres du bar pour ServerMappingsManager
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
        { id: 'bar' as const, label: 'Bar', icon: Building2 },
        { id: 'operational' as const, label: 'Opérationnel', icon: Clock },
        { id: 'general' as const, label: 'Général', icon: SettingsIcon },
        { id: 'security' as const, label: 'Sécurité', icon: ShieldCheck }
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
        } catch (error: unknown) {
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
        } catch (error: unknown) {
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
        } catch (error: unknown) {
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
        <div className="max-w-2xl mx-auto">
            {/* Header Standardisé */}
            <TabbedPageHeader
                title="Paramètres"
                subtitle="Configuration du bar"
                icon={<SettingsIcon size={24} />}
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={(id) => setActiveTab(id as any)}
                guideId={settingsGuideId}
                hideSubtitleOnMobile={true}
            />

            {/* Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6 space-y-6" data-guide="settings-content">
                {/* Onglet Sécurité */}
                {activeTab === 'security' && (
                    <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                            <ShieldCheck size={20} className="text-amber-500" />
                            Authentification à deux facteurs (2FA)
                        </h3>
                        <p className="text-sm text-gray-600">
                            Ajoutez une couche de sécurité supplémentaire avec une application d'authentification.
                        </p>

                        {isMfaEnabled ? (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                                <div className="flex items-center gap-2 text-green-700 font-medium">
                                    <CheckCircle size={20} />
                                    <span>2FA est activée</span>
                                </div>
                                <Button
                                    onClick={handleUnenrollMfa}
                                    disabled={mfaLoading}
                                    variant="destructive"
                                    className="w-full py-2 px-4 rounded-lg font-medium"
                                >
                                    {mfaLoading ? 'Désactivation...' : 'Désactiver la 2FA'}
                                </Button>
                            </div>
                        ) : (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                                {mfaStep === 'idle' && (
                                    <>
                                        <div className="flex items-center gap-2 text-amber-700 font-medium">
                                            <AlertCircle size={20} />
                                            <span>2FA est désactivée</span>
                                        </div>
                                        <Button
                                            onClick={handleEnrollMfa}
                                            disabled={mfaLoading}
                                            variant="default"
                                            className="w-full py-2 px-4 rounded-lg font-medium"
                                        >
                                            {mfaLoading ? 'Activation...' : 'Activer la 2FA'}
                                        </Button>
                                    </>
                                )}

                                {mfaStep === 'verify' && (
                                    <>
                                        <h4 className="font-semibold text-gray-800">Configurez votre application</h4>
                                        {qrCodeSvg && (
                                            <div className="flex flex-col items-center bg-white p-4 rounded-lg border">
                                                <div dangerouslySetInnerHTML={{ __html: qrCodeSvg }} className="w-40 h-40" />
                                                {mfaSecret && (
                                                    <code className="mt-2 bg-gray-100 px-3 py-1 rounded text-sm break-all">{mfaSecret}</code>
                                                )}
                                            </div>
                                        )}
                                        <Input
                                            type="text"
                                            value={verifyCode}
                                            onChange={(e) => setVerifyCode(e.target.value)}
                                            placeholder="Code à 6 chiffres"
                                            maxLength={6}
                                            className="text-center text-xl tracking-widest"
                                        />
                                        <Button
                                            onClick={handleVerifyMfa}
                                            disabled={mfaLoading || verifyCode.length !== 6}
                                            variant="default"
                                            className="w-full py-2 rounded-lg font-medium"
                                        >
                                            {mfaLoading ? 'Vérification...' : 'Vérifier et Activer'}
                                        </Button>
                                        <Button
                                            onClick={() => setMfaStep('idle')}
                                            variant="secondary"
                                            className="w-full py-2 rounded-lg"
                                        >
                                            Annuler
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}
                        {mfaError && (
                            <Alert show={!!mfaError} variant="destructive">
                                {mfaError}
                            </Alert>
                        )}
                    </div>
                )}

                {/* Onglet Bar */}
                {activeTab === 'bar' && (
                    <>
                        <div>
                            <Input
                                label="Nom du bar *"
                                type="text"
                                value={barName}
                                onChange={(e) => setBarName(e.target.value)}
                                placeholder="Ex: Le Privilège"
                            />
                        </div>
                        <div>
                            <Input
                                label="Adresse"
                                leftIcon={<MapPin size={16} className="text-amber-500" />}
                                type="text"
                                value={barAddress}
                                onChange={(e) => setBarAddress(e.target.value)}
                                placeholder="Ex: Cotonou, Bénin"
                            />
                        </div>
                        <div>
                            <Input
                                label="Téléphone"
                                leftIcon={<Phone size={16} className="text-amber-500" />}
                                type="tel"
                                value={barPhone}
                                onChange={(e) => setBarPhone(e.target.value)}
                                placeholder="Ex: 0197000000"
                            />
                        </div>
                        <div>
                            <Input
                                label="Email"
                                leftIcon={<Mail size={16} className="text-amber-500" />}
                                type="email"
                                value={barEmail}
                                onChange={(e) => setBarEmail(e.target.value)}
                                placeholder="Ex: contact@leprivilege.bj"
                            />
                        </div>
                    </>
                )}

                {/* Onglet Opérationnel */}
                {activeTab === 'operational' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                <Clock size={16} className="text-amber-500" /> Heure de clôture
                            </label>
                            <p className="text-xs text-gray-600 mb-3">
                                Heure de fin de journée commerciale (ex: 06h pour bars de nuit).
                            </p>
                            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl">
                                <input
                                    type="range"
                                    min="0"
                                    max="23"
                                    value={tempCloseHour}
                                    onChange={(e) => setTempCloseHour(Number(e.target.value))}
                                    className="flex-1 accent-amber-500"
                                />
                                <span className="text-lg font-bold bg-white px-4 py-2 rounded-lg border">
                                    {tempCloseHour.toString().padStart(2, '0')}h
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Expiration consignations</label>
                            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl">
                                <input
                                    type="range"
                                    min="1"
                                    max="30"
                                    value={tempConsignmentExpirationDays}
                                    onChange={(e) => setTempConsignmentExpirationDays(Number(e.target.value))}
                                    className="flex-1 accent-amber-500"
                                />
                                <span className="text-lg font-bold bg-white px-4 py-2 rounded-lg border">
                                    {tempConsignmentExpirationDays} jour(s)
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Fréquence approvisionnement</label>
                            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl">
                                <input
                                    type="range"
                                    min="1"
                                    max="30"
                                    value={tempSupplyFrequency}
                                    onChange={(e) => setTempSupplyFrequency(Number(e.target.value))}
                                    className="flex-1 accent-amber-500"
                                />
                                <span className="text-lg font-bold bg-white px-4 py-2 rounded-lg border">
                                    {tempSupplyFrequency} jour(s)
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">Mode de fonctionnement</label>
                            <RadioGroup
                                value={tempOperatingMode}
                                onValueChange={(value: 'full' | 'simplified') => setTempOperatingMode(value)}
                                className="space-y-3"
                            >
                                <label htmlFor="operatingModeFull" className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl cursor-pointer hover:bg-amber-100 border">
                                    <RadioGroupItem
                                        value="full"
                                        id="operatingModeFull"
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="font-medium">Mode Complet</div>
                                        <div className="text-xs text-gray-600">Chaque serveur a son propre compte.</div>
                                    </div>
                                </label>
                                <label htmlFor="operatingModeSimplified" className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl cursor-pointer hover:bg-amber-100 border">
                                    <RadioGroupItem
                                        value="simplified"
                                        id="operatingModeSimplified"
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="font-medium">Mode Simplifié</div>
                                        <div className="text-xs text-gray-600">Le gérant sélectionne le serveur.</div>
                                    </div>
                                </label>
                            </RadioGroup>
                        </div>

                        {tempOperatingMode === 'simplified' && (
                            <div className="space-y-6">
                                {/* ✨ NOUVEAU: ServerMappingsManager pour mode switching */}
                                {FEATURES.ENABLE_SWITCHING_MODE && (
                                    <div className="border-t pt-6">
                                        <div className="flex items-center gap-2 mb-2">
                                            <GitBranch size={16} className="text-amber-500" />
                                            <h4 className="text-sm font-medium text-gray-700">Configuration du Mode Switching</h4>
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
                    </>
                )}

                {/* Onglet Général */}
                {activeTab === 'general' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                            <DollarSign size={16} className="text-amber-500" /> Devise
                        </label>
                        <RadioGroup
                            value={tempSettings.currency}
                            onValueChange={(value) => {
                                const selectedCurrency = currencyOptions.find(c => c.code === value);
                                if (selectedCurrency) {
                                    setTempSettings({
                                        ...tempSettings,
                                        currency: selectedCurrency.code,
                                        currencySymbol: selectedCurrency.symbol,
                                    });
                                }
                            }}
                            className="space-y-2"
                        >
                            {currencyOptions.map((currency) => (
                                <label
                                    key={currency.code}
                                    htmlFor={`currency-${currency.code}`}
                                    className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl cursor-pointer hover:bg-amber-100 border"
                                >
                                    <RadioGroupItem
                                        value={currency.code}
                                        id={`currency-${currency.code}`}
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="font-medium">{currency.name}</div>
                                        <div className="text-sm text-gray-600">{currency.symbol}</div>
                                    </div>
                                </label>
                            ))}
                        </RadioGroup>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="mt-6 flex gap-3">
                <Button
                    onClick={() => navigate(-1)}
                    variant="secondary"
                    className="flex-1 py-3"
                >
                    Annuler
                </Button>
                <Button
                    onClick={handleSave}
                    variant="default"
                    className="flex-1 py-3"
                >
                    Enregistrer
                </Button>
            </div>
        </div>
    );
}
