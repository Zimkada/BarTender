import React from 'react';
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
        <div className="fixed inset-0 bg-gradient-to-br from-amber-600 via-amber-500 to-orange-500 flex flex-col items-center justify-center z-[9999]">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="relative"
            >
                <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full animate-pulse" />
                <div className="relative bg-gradient-to-br from-amber-400 to-amber-600 p-6 rounded-2xl shadow-2xl">
                    <Beer className="w-16 h-16 text-white" />
                </div>
            </motion.div>

            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="mt-8 text-center"
            >
                <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
                    BarTender <span className="text-amber-400">Pro</span>
                </h1>
                <p className="text-white/90 text-sm font-medium animate-pulse">
                    {displayMessage}
                </p>
            </motion.div>

            {/* Loading Bar */}
            <motion.div
                className="mt-8 w-48 h-1 bg-slate-700 rounded-full overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
            >
                <motion.div
                    className="h-full bg-amber-500"
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{
                        repeat: Infinity,
                        duration: 1.5,
                        ease: "easeInOut"
                    }}
                />
            </motion.div>
        </div>
    );
}
