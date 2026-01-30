import { useState } from 'react';
import { Palette, Check, RotateCcw, Save, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { THEME_PRESETS, ThemePreset, PRESET_LABELS } from '../types/theme';
import { validateThemeColors } from '../utils/colorUtils';
import { toast } from 'react-hot-toast';

export function ThemeSelector() {
    const { themeConfig, updateTheme, previewTheme, resetPreview, isPreviewMode } = useTheme();
    const [isLoading, setIsLoading] = useState(false);

    const handlePresetClick = (preset: ThemePreset) => {
        // Validation d'accessibilité immédiate (pour l'amber c'est hardcodé valide)
        const primaryColor = THEME_PRESETS[preset as keyof typeof THEME_PRESETS]?.primary;
        if (primaryColor) {
            const { valid, error } = validateThemeColors(primaryColor);
            if (!valid && error) {
                toast(error, { icon: '⚠️' }); // Just warn, don't block
            }
        }

        // Activer l'aperçu
        previewTheme({ preset });
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            // themeConfig contient déjà la version "previewée" grâce au context
            await updateTheme(themeConfig);
            toast.success('Thème mis à jour avec succès !');
            // Note: resetPreview est appelé automatiquement par updateTheme dans le context
        } catch (error) {
            console.error('Failed to save theme:', error);
            toast.error('Erreur lors de la sauvegarde du thème');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancel = () => {
        resetPreview();
        toast('Aperçu annulé', { icon: '↩️' });
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-brand-primary/10 rounded-lg text-brand-primary">
                    <Palette size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Thème de Couleur</h3>
                    <p className="text-sm text-gray-500">Personnalisez l'apparence de votre interface BarTender</p>
                </div>
            </div>

            {/* Grid des Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                {(Object.keys(THEME_PRESETS) as ThemePreset[])
                    .filter(preset => preset !== 'custom')
                    .map(preset => {
                        const colors = THEME_PRESETS[preset as keyof typeof THEME_PRESETS];
                        const isActive = themeConfig.preset === preset;

                        return (
                            <motion.button
                                key={preset}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handlePresetClick(preset)}
                                className={`relative group flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary ${isActive
                                        ? 'border-gray-900 bg-gray-50 shadow-md'
                                        : 'border-gray-100 hover:border-gray-300 bg-white hover:shadow-sm'
                                    }`}
                            >
                                {/* Aperçu des couleurs */}
                                <div className="flex -space-x-2">
                                    <div
                                        className="w-8 h-8 rounded-full border-2 border-white shadow-sm z-30"
                                        style={{ backgroundColor: colors.primary }}
                                    />
                                    <div
                                        className="w-8 h-8 rounded-full border-2 border-white shadow-sm z-20"
                                        style={{ backgroundColor: colors.secondary }}
                                    />
                                    <div
                                        className="w-8 h-8 rounded-full border-2 border-white shadow-sm z-10"
                                        style={{ backgroundColor: colors.accent }}
                                    />
                                </div>

                                {/* Label */}
                                <span className={`text-sm font-medium ${isActive ? 'text-gray-900' : 'text-gray-600'}`}>
                                    {PRESET_LABELS[preset]}
                                </span>

                                {/* Indicateur de sélection */}
                                {isActive && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute -top-2 -right-2 bg-gray-900 text-white rounded-full p-1 shadow-lg"
                                    >
                                        <Check size={12} strokeWidth={3} />
                                    </motion.div>
                                )}
                            </motion.button>
                        );
                    })}
            </div>

            {/* Barre d'action Mode Aperçu */}
            <AnimatePresence>
                {isPreviewMode && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: 10, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3 text-amber-800">
                                <AlertCircle size={20} className="text-amber-600" />
                                <div>
                                    <p className="font-semibold text-sm">Mode Aperçu Actif</p>
                                    <p className="text-xs text-amber-700">Ces changements ne sont pas encore sauvegardés.</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <button
                                    onClick={handleCancel}
                                    disabled={isLoading}
                                    className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                                >
                                    <RotateCcw size={16} />
                                    Annuler
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isLoading}
                                    className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Save size={16} />
                                    )}
                                    {isLoading ? 'Sauvegarde...' : 'Appliquer ce thème'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
