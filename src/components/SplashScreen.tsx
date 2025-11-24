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
        <div className="fixed inset-0 bg-gradient-to-br from-amber-50 to-amber-50 flex flex-col items-center justify-center z-[9999]">
            {/* Halo pulsant ambré */}
            <motion.div
                className="absolute inset-0 bg-amber-200/20 blur-3xl"
                initial={{ opacity: 0.3 }}
                animate={{ opacity: 0.5 }}
                transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse' }}
            />

            {/* Icône Beer avec glow */}
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.6, type: 'spring' }}
                className="relative"
            >
                <div className="absolute inset-0 bg-amber-400/30 blur-2xl rounded-full animate-pulse" />
                <div className="relative bg-gradient-to-br from-amber-400 to-amber-600 p-8 rounded-2xl shadow-2xl">
                    <Beer className="w-20 h-20 text-white drop-shadow-2xl" />
                </div>
            </motion.div>

            {/* Texte avec drop-shadow */}
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="mt-8 text-center"
            >
                <h1 className="text-4xl font-bold text-amber-500 mb-2 tracking-tight drop-shadow-lg">
                    BarTender <span className="text-amber-600">Pro</span>
                </h1>
                <p className="text-amber-600 text-sm font-medium animate-pulse drop-shadow-md">
                    {displayMessage}
                </p>
            </motion.div>

            {/* Barre de progression dorée */}
            <motion.div
                className="mt-8 w-48 h-2 bg-amber-200/40 rounded-full overflow-hidden shadow-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
            >
                <motion.div
                    className="h-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400"
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'linear'
                    }}
                />
            </motion.div>

            {/* Effet mousse montante (optionnel) */}
            <motion.div
                className="absolute bottom-0 left-0 right-0 h-24 bg-amber-200/10 backdrop-blur-sm"
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 0.3 }}
                transition={{ repeat: Infinity, repeatType: 'reverse', duration: 2.5 }}
            />
        </div>
    );
}
