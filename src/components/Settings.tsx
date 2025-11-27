import React, { useState, useEffect } from 'react';
import { X, Settings as SettingsIcon, DollarSign, Clock, Users, Plus, Trash2, Building2, Mail, Phone, MapPin, ShieldCheck, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase'; // Import supabase for MFA calls
import { useNotifications } from './Notifications'; // Import useNotifications for feedback
import { useSettings } from '../hooks/useSettings';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const currencyOptions = [
  { code: 'FCFA', symbol: 'FCFA', name: 'Franc CFA' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'Dollar US' },
  { code: 'GBP', symbol: '£', name: 'Livre Sterling' },
];

export function Settings({ isOpen, onClose }: SettingsProps) {
  const { settings, updateSettings } = useSettings();
  const { currentBar, updateBar } = useBarContext();
  const { currentSession } = useAuth();

  // Onglets
  const [activeTab, setActiveTab] = useState<'bar' | 'operational' | 'general' | 'security'>('bar');

  // États pour la 2FA
  const [isMfaEnabled, setIsMfaEnabled] = useState(false);
  const [mfaStep, setMfaStep] = useState<'idle' | 'enroll' | 'verify'>('idle'); // idle, enroll (show QR), verify (enter code)
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null); // Factor ID from enroll
  const [mfaSecret, setMfaSecret] = useState<string | null>(null); // Manual setup key
  const [verifyCode, setVerifyCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  const { showNotification } = useNotifications(); // For user feedback

  // Vérifier l'état initial de la 2FA
  useEffect(() => {
    const checkMfaStatus = async () => {
      if (currentSession?.userId) {
        try {
          const { data, error } = await supabase.auth.mfa.listFactors();
          if (error) {
            console.error('Error listing MFA factors:', error);
            setMfaError(error.message);
            return;
          }
          const totpFactor = data.all.find((f: any) => f.factor_type === 'totp' && f.status === 'verified');
          setIsMfaEnabled(!!totpFactor);
          if (totpFactor) {
            setMfaFactorId(totpFactor.id);
          }
        } catch (err: any) {
          console.error('Exception checking MFA status:', err);
          if (err.message?.includes('Auth session missing')) {
            setMfaError("Session expirée. Veuillez vous reconnecter pour gérer la sécurité.");
          } else {
            setMfaError(err.message || "Erreur lors de la vérification MFA");
          }
        }
      }
    };
    checkMfaStatus();
  }, [currentSession?.userId, isOpen]); // Re-check when modal opens or user changes

  // Infos Bar
  const [barName, setBarName] = useState(currentBar?.name ?? '');
  const [barAddress, setBarAddress] = useState(currentBar?.address ?? '');
  const [barPhone, setBarPhone] = useState(currentBar?.phone ?? '');
  const [barEmail, setBarEmail] = useState(currentBar?.email ?? '');

  // Settings
  const [tempSettings, setTempSettings] = useState(settings);
  const [tempCloseHour, setTempCloseHour] = useState(currentBar?.settings?.businessDayCloseHour ?? 6);
  const [tempConsignmentExpirationDays, setTempConsignmentExpirationDays] = useState(currentBar?.settings?.consignmentExpirationDays ?? 7);
  const [tempSupplyFrequency, setTempSupplyFrequency] = useState(currentBar?.settings?.supplyFrequency ?? 7);
  const [tempOperatingMode, setTempOperatingMode] = useState<'full' | 'simplified'>(
    currentBar?.settings?.operatingMode ?? 'full'
  );
  const [tempServersList, setTempServersList] = useState<string[]>(
    currentBar?.settings?.serversList ?? []
  );
  const [newServerName, setNewServerName] = useState('');

  // Fonctions de gestion de la 2FA
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
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: mfaFactorId,
        code: verifyCode,
      });
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

  const handleAddServer = () => {
    if (newServerName.trim() && !tempServersList.includes(newServerName.trim())) {
      setTempServersList([...tempServersList, newServerName.trim()]);
      setNewServerName('');
    }
  };

  const handleRemoveServer = (serverName: string) => {
    setTempServersList(tempServersList.filter(s => s !== serverName));
  };

  const handleSave = () => {
    updateSettings(tempSettings);

    // Mettre à jour le bar actuel (infos + settings)
    if (currentBar) {
      updateBar(currentBar.id, {
        name: barName.trim(),
        address: barAddress.trim() || undefined,
        phone: barPhone.trim() || undefined,
        email: barEmail.trim() || undefined,
        settings: {
          ...currentBar.settings,
          businessDayCloseHour: tempCloseHour,
          consignmentExpirationDays: tempConsignmentExpirationDays,
          supplyFrequency: tempSupplyFrequency,
          operatingMode: tempOperatingMode,
          serversList: tempOperatingMode === 'simplified' ? tempServersList : undefined,
        }
      });
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="bg-white rounded-lg w-full max-w-md max-h-[85vh] md:max-h-[90vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SettingsIcon size={24} />
                <div>
                  <h2 className="text-xl font-bold">Paramètres</h2>
                  <p className="text-amber-100 text-sm">Configuration du bar</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Onglets */}
            <div className="flex border-b bg-amber-50/50">
              <button
                onClick={() => setActiveTab('bar')}
                className={`flex-1 py-3 px-4 font-medium text-sm transition-colors ${activeTab === 'bar'
                  ? 'bg-white text-amber-600 border-b-2 border-amber-600'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                <Building2 className="w-4 h-4 inline mr-2" />
                Informations
              </button>
              <button
                onClick={() => setActiveTab('operational')}
                className={`flex-1 py-3 px-4 font-medium text-sm transition-colors ${activeTab === 'operational'
                  ? 'bg-white text-amber-600 border-b-2 border-amber-600'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                <Users className="w-4 h-4 inline mr-2" />
                Opérationnel
              </button>
              <button
                onClick={() => setActiveTab('general')}
                className={`flex-1 py-3 px-4 font-medium text-sm transition-colors ${activeTab === 'general'
                  ? 'bg-white text-amber-600 border-b-2 border-amber-600'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                <DollarSign className="w-4 h-4 inline mr-2" />
                Général
              </button>
              <button
                onClick={() => setActiveTab('security')}
                className={`flex-1 py-3 px-4 font-medium text-sm transition-colors ${activeTab === 'security'
                  ? 'bg-white text-amber-600 border-b-2 border-amber-600'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                <ShieldCheck className="w-4 h-4 inline mr-2" />
                Sécurité
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Onglet Sécurité */}
              {activeTab === 'security' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <ShieldCheck size={20} className="text-amber-500" />
                    Authentification à deux facteurs (2FA)
                  </h3>
                  <p className="text-sm text-gray-600">
                    Ajoutez une couche de sécurité supplémentaire à votre compte avec la 2FA.
                    Vous aurez besoin d'une application d'authentification (ex: Google Authenticator, Authy).
                  </p>

                  {isMfaEnabled ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2 text-green-700 font-medium">
                        <CheckCircle size={20} />
                        <span>2FA est activée</span>
                      </div>
                      <p className="text-sm text-green-800">
                        Votre compte est protégé par l'authentification à deux facteurs.
                      </p>
                      <button
                        onClick={handleUnenrollMfa}
                        disabled={mfaLoading}
                        className="w-full py-2 px-4 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {mfaLoading ? 'Désactivation...' : 'Désactiver la 2FA'}
                      </button>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                      {mfaStep === 'idle' && (
                        <>
                          <div className="flex items-center gap-2 text-amber-700 font-medium">
                            <AlertCircle size={20} />
                            <span>2FA est désactivée</span>
                          </div>
                          <p className="text-sm text-amber-800">
                            Activez la 2FA pour une sécurité renforcée de votre compte.
                          </p>
                          <button
                            onClick={handleEnrollMfa}
                            disabled={mfaLoading}
                            className="w-full py-2 px-4 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {mfaLoading ? 'Activation...' : 'Activer la 2FA'}
                          </button>
                        </>
                      )}

                      {mfaStep === 'verify' && (
                        <>
                          <h4 className="text-md font-semibold text-gray-800">Étape 1: Configurez votre application</h4>
                          <p className="text-sm text-gray-600">
                            Scannez le QR code ci-dessous avec votre application d'authentification (ex: Google Authenticator).
                            Si vous ne pouvez pas le scanner, copiez la clé manuellement.
                          </p>

                          {qrCodeSvg && (
                            <div className="flex flex-col items-center justify-center bg-white p-4 rounded-lg border border-gray-200">
                              <div dangerouslySetInnerHTML={{ __html: qrCodeSvg }} className="w-40 h-40" />
                              {mfaSecret && (
                                <div className="mt-4 text-center">
                                  <p className="text-xs text-gray-500 mb-1">Clé manuelle (copier/coller) :</p>
                                  <code className="bg-gray-100 text-gray-800 px-3 py-1 rounded-md text-sm break-all">
                                    {mfaSecret}
                                  </code>
                                </div>
                              )}
                            </div>
                          )}

                          <h4 className="text-md font-semibold text-gray-800 mt-6">Étape 2: Vérifiez le code</h4>
                          <p className="text-sm text-gray-600">
                            Entrez le code à 6 chiffres généré par votre application d'authentification.
                          </p>
                          <input
                            type="text"
                            value={verifyCode}
                            onChange={(e) => setVerifyCode(e.target.value)}
                            placeholder="XXXXXX"
                            maxLength={6}
                            className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-center text-xl tracking-widest"
                          />
                          {mfaError && (
                            <p className="text-red-500 text-sm mt-2">{mfaError}</p>
                          )}
                          <button
                            onClick={handleVerifyMfa}
                            disabled={mfaLoading || verifyCode.length !== 6}
                            className="w-full py-2 px-4 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {mfaLoading ? 'Vérification...' : 'Vérifier et Activer'}
                          </button>
                          <button
                            onClick={() => setMfaStep('idle')}
                            disabled={mfaLoading}
                            className="w-full py-2 px-4 mt-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Annuler
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {mfaError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2"
                    >
                      <AlertCircle size={20} />
                      <span className="text-sm">{mfaError}</span>
                    </motion.div>
                  )}
                </div>
              )}

              {/* Onglet Informations du Bar */}
              {activeTab === 'bar' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nom du bar *
                    </label>
                    <input
                      type="text"
                      value={barName}
                      onChange={(e) => setBarName(e.target.value)}
                      className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="Ex: Le Privilège"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <MapPin size={16} className="text-amber-500" />
                      Adresse
                    </label>
                    <input
                      type="text"
                      value={barAddress}
                      onChange={(e) => setBarAddress(e.target.value)}
                      className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="Ex: Cotonou, Bénin"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Phone size={16} className="text-amber-500" />
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={barPhone}
                      onChange={(e) => setBarPhone(e.target.value)}
                      className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="Ex: 0197000000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Mail size={16} className="text-amber-500" />
                      Email
                    </label>
                    <input
                      type="email"
                      value={barEmail}
                      onChange={(e) => setBarEmail(e.target.value)}
                      className="w-full px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="Ex: contact@leprivilege.bj"
                    />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900">
                      <strong>💡 Info:</strong> Ces informations apparaîtront sur vos reçus et factures.
                      Gardez-les à jour pour une communication professionnelle.
                    </p>
                  </div>
                </>
              )}

              {/* Onglet Opérationnel */}
              {activeTab === 'operational' && (
                <>
                  {/* Heure de clôture */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <Clock size={16} className="text-amber-500" />
                      Heure de clôture de la journée commerciale
                    </label>
                    <p className="text-xs text-gray-600 mb-3">
                      Les ventes après minuit seront comptabilisées dans la journée précédente jusqu'à cette heure.
                    </p>
                    <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <input
                        type="range"
                        min="0"
                        max="23"
                        value={tempCloseHour}
                        onChange={(e) => setTempCloseHour(Number(e.target.value))}
                        className="flex-1 h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                      <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-amber-200 min-w-[80px] justify-center">
                        <Clock size={18} className="text-amber-500" />
                        <span className="text-lg font-bold text-gray-800">
                          {tempCloseHour.toString().padStart(2, '0')}h
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Durée expiration consignations */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <Clock size={16} className="text-amber-500" />
                      Durée d'expiration des consignations
                    </label>
                    <p className="text-xs text-gray-600 mb-3">
                      Nombre de jours avant qu'un produit consigné non réclamé ne redevienne disponible à la vente.
                    </p>
                    <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <input
                        type="range"
                        min="1"
                        max="30"
                        value={tempConsignmentExpirationDays}
                        onChange={(e) => setTempConsignmentExpirationDays(Number(e.target.value))}
                        className="flex-1 h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                      <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-amber-200 min-w-[90px] justify-center">
                        <span className="text-lg font-bold text-gray-800">
                          {tempConsignmentExpirationDays} jour(s)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Fréquence d'approvisionnement */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <Clock size={16} className="text-amber-500" />
                      Fréquence d'approvisionnement
                    </label>
                    <p className="text-xs text-gray-600 mb-3">
                      Nombre de jours de stock que vous souhaitez maintenir pour vos suggestions de commande.
                    </p>
                    <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <input
                        type="range"
                        min="1"
                        max="30"
                        value={tempSupplyFrequency}
                        onChange={(e) => setTempSupplyFrequency(Number(e.target.value))}
                        className="flex-1 h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                      <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-amber-200 min-w-[90px] justify-center">
                        <span className="text-lg font-bold text-gray-800">
                          {tempSupplyFrequency} jour(s)
                        </span>
                      </div>
                    </div>
                  </div>


                  {/* Mode de fonctionnement */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <Users size={16} className="text-amber-500" />
                      Mode de fonctionnement
                    </label>
                    <div className="space-y-3">
                      <motion.label
                        whileHover={{ scale: 1.02 }}
                        className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors border border-amber-100"
                      >
                        <input
                          type="radio"
                          name="operatingMode"
                          value="full"
                          checked={tempOperatingMode === 'full'}
                          onChange={() => setTempOperatingMode('full')}
                          className="mt-1 text-amber-500 focus:ring-amber-400"
                        />
                        <div className="flex-1">
                          <div className="text-gray-800 font-medium">Mode Complet</div>
                          <div className="text-gray-600 text-xs mt-1">
                            Chaque serveur a son propre compte et enregistre ses ventes.
                          </div>
                        </div>
                      </motion.label>

                      <motion.label
                        whileHover={{ scale: 1.02 }}
                        className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors border border-amber-100"
                      >
                        <input
                          type="radio"
                          name="operatingMode"
                          value="simplified"
                          checked={tempOperatingMode === 'simplified'}
                          onChange={() => setTempOperatingMode('simplified')}
                          className="mt-1 text-amber-500 focus:ring-amber-400"
                        />
                        <div className="flex-1">
                          <div className="text-gray-800 font-medium">Mode Simplifié</div>
                          <div className="text-gray-600 text-xs mt-1">
                            Le gérant enregistre les ventes et sélectionne le serveur concerné.
                          </div>
                        </div>
                      </motion.label>
                    </div>
                  </div>

                  {/* Liste serveurs (mode simplifié) */}
                  {tempOperatingMode === 'simplified' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                        <Users size={16} className="text-amber-500" />
                        Liste des serveurs
                      </label>
                      <p className="text-xs text-gray-600 mb-3">
                        Ajoutez les noms de vos serveurs pour attribution des ventes.
                      </p>

                      <div className="flex gap-2 mb-3">
                        <input
                          type="text"
                          value={newServerName}
                          onChange={(e) => setNewServerName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddServer()}
                          placeholder="Nom du serveur"
                          className="flex-1 px-3 py-2 bg-white border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
                        />
                        <motion.button
                          onClick={handleAddServer}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-2"
                        >
                          <Plus size={16} />
                          Ajouter
                        </motion.button>
                      </div>

                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {tempServersList.length === 0 ? (
                          <p className="text-gray-500 text-xs text-center py-4">
                            Aucun serveur ajouté.
                          </p>
                        ) : (
                          tempServersList.map((serverName, index) => (
                            <motion.div
                              key={index}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-center justify-between p-2 bg-white rounded-lg border border-amber-100"
                            >
                              <span className="text-sm text-gray-700">{serverName}</span>
                              <button
                                onClick={() => handleRemoveServer(serverName)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </motion.div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Onglet Général */}
              {activeTab === 'general' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <DollarSign size={16} className="text-amber-500" />
                    Devise
                  </label>
                  <div className="space-y-2">
                    {currencyOptions.map((currency) => (
                      <motion.label
                        key={currency.code}
                        whileHover={{ scale: 1.02 }}
                        className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors border border-amber-100"
                      >
                        <input
                          type="radio"
                          name="currency"
                          value={currency.code}
                          checked={tempSettings.currency === currency.code}
                          onChange={(e) => setTempSettings({
                            ...tempSettings,
                            currency: e.target.value,
                            currencySymbol: currency.symbol,
                          })}
                          className="text-amber-500 focus:ring-amber-400"
                        />
                        <div>
                          <div className="text-gray-800 font-medium">{currency.name}</div>
                          <div className="text-gray-600 text-sm">{currency.symbol}</div>
                        </div>
                      </motion.label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="p-6 border-t border-amber-100 bg-white">
              <div className="flex gap-3">
                <motion.button
                  onClick={onClose}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
                >
                  Annuler
                </motion.button>
                <motion.button
                  onClick={handleSave}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors"
                >
                  Enregistrer
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
