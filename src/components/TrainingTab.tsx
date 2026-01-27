// components/TrainingTab.tsx - Onglet Formation dans Mon Profil
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    GraduationCap,
    Play,
    CheckCircle,
    Clock,
    TrendingUp,
    Sparkles,
    ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface TrainingVersion {
    version: number;
    changelog: string;
    releasedAt: string;
}

export function TrainingTab() {
    const { currentSession } = useAuth();
    const navigate = useNavigate();
    const [latestVersion, setLatestVersion] = useState<TrainingVersion | null>(null);
    const [userCompletedVersion, setUserCompletedVersion] = useState<number>(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTrainingStatus();
    }, [currentSession?.userId, currentSession?.role]);

    const loadTrainingStatus = async () => {
        if (!currentSession?.userId || !currentSession?.role) return;

        setLoading(true);
        try {
            // Get latest training version for user's role
            const { data: versionData } = await supabase
                .from('training_versions')
                .select('version, changelog, released_at')
                .eq('role', currentSession.role)
                .order('version', { ascending: false })
                .limit(1)
                .single();

            if (versionData) {
                setLatestVersion({
                    version: versionData.version,
                    changelog: versionData.changelog || '',
                    releasedAt: versionData.released_at,
                });
            }

            // Get user's completed version
            const { data: userData } = await supabase
                .from('users')
                .select('training_version_completed')
                .eq('id', currentSession.userId)
                .single();

            if (userData) {
                setUserCompletedVersion(userData.training_version_completed || 0);
            }
        } catch (error) {
            console.error('Error loading training status:', error);
        } finally {
            setLoading(false);
        }
    };

    const hasNewTraining = latestVersion && userCompletedVersion < latestVersion.version;
    const completionPercentage = latestVersion
        ? Math.round((userCompletedVersion / latestVersion.version) * 100)
        : 0;

    const handleStartTraining = () => {
        navigate('/onboarding');
    };

    const getRoleLabel = (role: string) => {
        switch (role) {
            case 'promoteur': return 'Promoteur';
            case 'gerant': return 'Gérant';
            case 'serveur': return 'Serveur';
            default: return role;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header Section */}
            <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 mb-6 shadow-lg shadow-amber-200 rotate-3 hover:rotate-0 transition-transform">
                    <GraduationCap className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-black text-gray-900 mb-2">Formation BarTender</h2>
                <p className="text-gray-600 font-medium">
                    Maîtrisez l'application pour votre rôle de {getRoleLabel(currentSession?.role || '')}
                </p>
            </div>

            {/* New Training Alert */}
            {hasNewTraining && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-3xl p-6 relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-200/20 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <div className="relative z-10 flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-black text-amber-900 mb-1">🆕 Nouveautés disponibles !</h3>
                            <p className="text-sm text-amber-800 font-medium mb-3">
                                Version {latestVersion?.version} : {latestVersion?.changelog}
                            </p>
                            <button
                                onClick={handleStartTraining}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl font-bold text-sm hover:bg-amber-700 transition-colors"
                            >
                                Découvrir les nouveautés
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Progress Card */}
            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <p className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1">Votre Progression</p>
                        <p className="text-4xl font-black text-gray-900">{completionPercentage}%</p>
                    </div>
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-200">
                        {completionPercentage === 100 ? (
                            <CheckCircle className="w-10 h-10 text-white" />
                        ) : (
                            <Clock className="w-10 h-10 text-white" />
                        )}
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden mb-6">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${completionPercentage}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-orange-600 rounded-full"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1">Version actuelle</p>
                        <p className="text-2xl font-black text-gray-900">{latestVersion?.version || 1}</p>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1">Version complétée</p>
                        <p className="text-2xl font-black text-gray-900">{userCompletedVersion}</p>
                    </div>
                </div>

                {/* CTA Button */}
                <button
                    onClick={handleStartTraining}
                    className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-amber-200 transition-all active:scale-[0.98] hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-3"
                >
                    <Play size={20} />
                    {completionPercentage === 100 ? 'Revoir la formation' : 'Commencer la formation'}
                </button>
            </div>

            {/* Modules Info */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-8 border border-blue-100">
                <div className="flex items-center gap-3 mb-6">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                    <h3 className="text-lg font-black text-blue-900">Modules de formation</h3>
                </div>
                <div className="space-y-3">
                    <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-blue-100">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                            <span className="text-blue-600 font-black">1</span>
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-gray-900">Introduction à votre rôle</p>
                            <p className="text-xs text-gray-600">Comprendre vos responsabilités</p>
                        </div>
                        {userCompletedVersion >= 1 && <CheckCircle className="w-5 h-5 text-green-600" />}
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-blue-100">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                            <span className="text-blue-600 font-black">2</span>
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-gray-900">Navigation et fonctionnalités clés</p>
                            <p className="text-xs text-gray-600">Maîtriser l'interface</p>
                        </div>
                        {userCompletedVersion >= 1 && <CheckCircle className="w-5 h-5 text-green-600" />}
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-blue-100">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                            <span className="text-blue-600 font-black">3</span>
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-gray-900">Simulation pratique</p>
                            <p className="text-xs text-gray-600">Exercices interactifs</p>
                        </div>
                        {userCompletedVersion >= 1 && <CheckCircle className="w-5 h-5 text-green-600" />}
                    </div>
                </div>
            </div>
        </div>
    );
}
