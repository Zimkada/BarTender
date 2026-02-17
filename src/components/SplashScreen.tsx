import { motion } from 'framer-motion';
import { Beer } from 'lucide-react';

interface SplashScreenProps {
    message?: string;
    userName?: string;
    barName?: string;
}

export function SplashScreen({
    message = "Chargement de votre bar...",
    userName,
    barName
}: SplashScreenProps) {
    // Message personnalisé si nom utilisateur ou bar disponible
    const displayMessage = userName && barName
        ? `Bienvenue ${userName} ! Chargement de ${barName}...`
        : userName
            ? `Bienvenue ${userName} ! Préparation de votre espace...`
            : barName
                ? `Chargement de ${barName}...`
                : message;

    return (
        <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-[9999]">
            {/* Halo pulsant - Discret et Neutre */}
            <motion.div
                className="absolute inset-0 bg-slate-400/5 blur-3xl"
                initial={{ opacity: 0.2 }}
                animate={{ opacity: 0.4 }}
                transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse' }}
            />

            {/* Icône Beer avec glow */}
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.6, type: 'spring' }}
                className="relative"
            >
                <div className="absolute inset-0 bg-slate-400/10 blur-2xl rounded-full animate-pulse" />
                <div className="relative bg-slate-50 border border-slate-200/60 p-8 rounded-2xl shadow-xl">
                    <Beer className="w-20 h-20 text-slate-700 drop-shadow-md" />
                </div>
            </motion.div>

            {/* Texte avec drop-shadow */}
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="mt-8 text-center"
            >
                <h1 className="text-4xl font-bold text-slate-900 mb-2 tracking-tight">
                    BarTender <span className="text-slate-400 font-medium">Pro</span>
                </h1>
                <p className="text-slate-500 text-sm font-medium">
                    {displayMessage}
                </p>
            </motion.div>

            {/* Barre de progression harmonisée */}
            <motion.div
                className="mt-8 w-48 h-1.5 bg-gray-200/50 rounded-full overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
            >
                <motion.div
                    className="h-full bg-brand-primary"
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'linear'
                    }}
                />
            </motion.div>

            {/* Effet reflet bas (neutre et discret) */}
            <motion.div
                className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-50 to-transparent opacity-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                transition={{ duration: 2 }}
            />
        </div>
    );
}
