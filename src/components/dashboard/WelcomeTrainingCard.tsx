import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, ArrowRight, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export const WelcomeTrainingCard: React.FC = () => {
    const { currentSession } = useAuth();
    const navigate = useNavigate();
    const [isVisible, setIsVisible] = useState(true);

    // Si l'utilisateur a déjà complété l'onboarding, on n'affiche rien
    // Note: On vérifie aussi s'il n'a pas cliqué sur "Plus tard" dans cette session (local state)
    // Pour une persistance plus longue, on utiliserait localStorage
    if (!currentSession || currentSession.hasCompletedOnboarding) {
        return null;
    }

    const handleStartTour = () => {
        // Rediriger vers l'onboarding en mode training
        navigate('/onboarding?mode=training');
    };

    const handleDismiss = () => {
        setIsVisible(false);
        // Optionnel: Sauvegarder dans localStorage pour ne plus montrer aujourd'hui
        // localStorage.setItem('training_dismissed', Date.now().toString());
    };

    if (!isVisible) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 rounded-2xl p-6 relative overflow-hidden shadow-sm border border-blue-100"
                style={{
                    background: 'linear-gradient(135deg, hsl(210, 100%, 98%) 0%, hsl(220, 100%, 96%) 100%)'
                }}
            >
                {/* Background Decoration */}
                <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-1/4 -translate-y-1/4 pointer-events-none">
                    <GraduationCap size={200} className="text-blue-600" />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">👋</span>
                            <h2 className="text-2xl font-bold text-gray-900">
                                Bienvenue, {currentSession.userName.split(' ')[0]} !
                            </h2>
                        </div>
                        <p className="text-gray-600 max-w-xl text-lg leading-relaxed">
                            Ravi de vous compter parmi nous. Pour prendre en main l'outil rapidement et sans stress, nous vous avons préparé un guide interactif de 3 minutes.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0 w-full md:w-auto">
                        <button
                            onClick={handleDismiss}
                            className="px-4 py-3 text-gray-500 hover:text-gray-700 font-medium hover:bg-white/50 rounded-xl transition-colors text-sm"
                        >
                            Plus tard
                        </button>
                        <button
                            onClick={handleStartTour}
                            className="flex-1 md:flex-none px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 group"
                            style={{
                                background: 'linear-gradient(135deg, hsl(var(--brand-hue), var(--brand-saturation), 50%) 0%, hsl(var(--brand-hue), var(--brand-saturation), 40%) 100%)'
                            }}
                        >
                            <GraduationCap size={20} />
                            <span>Lancer la visite</span>
                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>

                {/* Close Button (Discrete) */}
                <button
                    onClick={handleDismiss}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2 hover:bg-black/5 rounded-full transition-colors"
                >
                    <X size={16} />
                </button>
            </motion.div>
        </AnimatePresence>
    );
};
