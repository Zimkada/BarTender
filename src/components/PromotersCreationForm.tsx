import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Eye, EyeOff, RefreshCw, Loader, UserPlus
} from 'lucide-react';
import { AuthService } from '../services/supabase/auth.service';
import { Alert } from './ui/Alert';

interface CreatePromoteurData {
    email: string;
    phone: string;
    password: string;
    firstName: string;
    lastName: string;
    barName: string;
    barAddress: string;
    barPhone: string;
}

interface PromotersCreationFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const PromotersCreationForm: React.FC<PromotersCreationFormProps> = ({
    isOpen,
    onClose,
    onSuccess
}) => {
    const [formData, setFormData] = useState<CreatePromoteurData>({
        email: '',
        phone: '',
        password: '',
        firstName: '',
        lastName: '',
        barName: '',
        barAddress: '',
        barPhone: '',
    });

    const [showPassword, setShowPassword] = useState(false);
    const [formErrors, setFormErrors] = useState<Partial<CreatePromoteurData>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const generateSecurePassword = () => {
        const length = 12;
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';

        // Au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
        password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
        password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
        password += '0123456789'[Math.floor(Math.random() * 10)];
        password += '!@#$%^&*'[Math.floor(Math.random() * 8)];

        // Remplir le reste
        for (let i = password.length; i < length; i++) {
            password += charset[Math.floor(Math.random() * charset.length)];
        }

        // Mélanger
        password = password.split('').sort(() => Math.random() - 0.5).join('');

        setFormData(prev => ({ ...prev, password }));
        setShowPassword(true);
    };

    const validateForm = (): boolean => {
        const errors: Partial<CreatePromoteurData> = {};

        // firstName
        if (!formData.firstName.trim()) {
            errors.firstName = 'Le prénom est requis';
        } else if (formData.firstName.length < 2 || formData.firstName.length > 50) {
            errors.firstName = 'Le prénom doit contenir entre 2 et 50 caractères';
        }

        // lastName
        if (!formData.lastName.trim()) {
            errors.lastName = 'Le nom est requis';
        } else if (formData.lastName.length < 2 || formData.lastName.length > 50) {
            errors.lastName = 'Le nom doit contenir entre 2 et 50 caractères';
        }

        // email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!formData.email.trim()) {
            errors.email = 'L\'email est requis';
        } else if (!emailRegex.test(formData.email)) {
            errors.email = 'Email invalide';
        }

        // phone
        const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
        if (!formData.phone.trim()) {
            errors.phone = 'Le téléphone est requis';
        } else if (!phoneRegex.test(formData.phone)) {
            errors.phone = 'Numéro de téléphone invalide (min 10 chiffres)';
        }

        // password
        if (!formData.password) {
            errors.password = 'Le mot de passe est requis';
        } else if (formData.password.length < 8) {
            errors.password = 'Le mot de passe doit contenir au moins 8 caractères';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm()) {
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const signupData = {
                email: formData.email.trim(),
                password: formData.password,
                name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
                phone: formData.phone.trim(),
            };

            await AuthService.createPromoter(signupData);

            setSuccess(true);
            setTimeout(() => {
                resetForm();
                onSuccess();
                onClose();
            }, 1500);

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Erreur lors de la création du promoteur';
            setError(message);
            console.error('Erreur création promoteur:', err);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            email: '',
            phone: '',
            password: '',
            firstName: '',
            lastName: '',
            barName: '',
            barAddress: '',
            barPhone: '',
        });
        setFormErrors({});
        setError(null);
        setSuccess(false);
        setShowPassword(false);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white relative">
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                        <div className="flex items-center gap-3">
                            <UserPlus className="w-8 h-8" />
                            <div>
                                <h2 className="text-2xl font-bold">Créer un Promoteur</h2>
                                <p className="text-purple-100 text-sm">Ajouter un nouveau promoteur à la plateforme</p>
                            </div>
                        </div>
                    </div>

                    {/* Error/Success Alerts */}
                    {error && (
                        <div className="p-4 border-b">
                            <Alert variant="destructive" title="Erreur">
                                {error}
                            </Alert>
                        </div>
                    )}

                    {success && (
                        <div className="p-4 border-b">
                            <Alert variant="success" title="Succès">
                                Promoteur créé avec succès !
                            </Alert>
                        </div>
                    )}

                    {/* Form Fields - Scrollable */}
                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="space-y-4">
                            {/* Grid 2 cols pour firstName/lastName */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Prénom *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.firstName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent ${formErrors.firstName ? 'border-red-500' : 'border-gray-300'
                                            }`}
                                        placeholder="Jean"
                                    />
                                    {formErrors.firstName && (
                                        <p className="text-red-500 text-xs mt-1">{formErrors.firstName}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Nom *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.lastName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent ${formErrors.lastName ? 'border-red-500' : 'border-gray-300'
                                            }`}
                                        placeholder="Dupont"
                                    />
                                    {formErrors.lastName && (
                                        <p className="text-red-500 text-xs mt-1">{formErrors.lastName}</p>
                                    )}
                                </div>
                            </div>

                            {/* Email */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Email *
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent ${formErrors.email ? 'border-red-500' : 'border-gray-300'
                                        }`}
                                    placeholder="jean.dupont@example.com"
                                />
                                {formErrors.email && (
                                    <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>
                                )}
                            </div>

                            {/* Phone */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Téléphone *
                                </label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent ${formErrors.phone ? 'border-red-500' : 'border-gray-300'
                                        }`}
                                    placeholder="+33 6 12 34 56 78"
                                />
                                {formErrors.phone && (
                                    <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>
                                )}
                            </div>

                            {/* Password avec toggle et generate */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Mot de passe *
                                </label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={formData.password}
                                            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                            className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent ${formErrors.password ? 'border-red-500' : 'border-gray-300'
                                                }`}
                                            placeholder="••••••••"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4 text-gray-500" /> : <Eye className="w-4 h-4 text-gray-500" />}
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={generateSecurePassword}
                                        className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 flex items-center gap-2 transition-colors"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        Générer
                                    </button>
                                </div>
                                {formErrors.password && (
                                    <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>
                                )}
                            </div>

                            {/* Divider */}
                            <div className="border-t pt-4">
                                <p className="text-sm text-gray-500 mb-3">Informations du bar (optionnel)</p>
                            </div>

                            {/* barName */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Nom du bar
                                </label>
                                <input
                                    type="text"
                                    value={formData.barName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, barName: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    placeholder="Le Bar de Jean (optionnel)"
                                />
                            </div>

                            {/* barAddress */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Adresse du bar
                                </label>
                                <input
                                    type="text"
                                    value={formData.barAddress}
                                    onChange={(e) => setFormData(prev => ({ ...prev, barAddress: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    placeholder="123 Rue de la Paix, Paris (optionnel)"
                                />
                            </div>

                            {/* barPhone */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Téléphone du bar
                                </label>
                                <input
                                    type="tel"
                                    value={formData.barPhone}
                                    onChange={(e) => setFormData(prev => ({ ...prev, barPhone: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    placeholder="+33 1 23 45 67 89 (optionnel)"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer Buttons */}
                    <div className="p-6 bg-gray-50 border-t flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
                        >
                            {loading && <Loader className="w-4 h-4 animate-spin" />}
                            {loading ? 'Création...' : 'Créer le promoteur'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
