import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, 
  Check, 
  X, 
  //AlertCircle,
  Zap,
  Star,
  Heart,
  ShoppingCart
} from 'lucide-react';

// Types pour les variantes de boutons
type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';
type ButtonAnimation = 'bounce' | 'pulse' | 'shake' | 'glow' | 'ripple' | 'none';

interface EnhancedButtonProps {
  children: React.ReactNode;
  onClick?: () => void | Promise<void>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  animation?: ButtonAnimation;
  disabled?: boolean;
  loading?: boolean;
  success?: boolean;
  error?: boolean;
  icon?: React.ReactNode;
  badge?: number;
  className?: string;
  hapticFeedback?: boolean;
  soundEffect?: boolean;
  rippleEffect?: boolean;
}

// Animations prédéfinies
const buttonAnimations = {
  bounce: {
    whileHover: { scale: 1.05, y: -2 },
    whileTap: { scale: 0.95, y: 0 },
    transition: { type: "spring", stiffness: 400, damping: 10 }
  },
  pulse: {
    whileHover: { scale: [1, 1.02, 1], transition: { repeat: Infinity, duration: 0.8 } },
    whileTap: { scale: 0.98 }
  },
  shake: {
    whileHover: { x: [0, -1, 1, -1, 1, 0], transition: { duration: 0.3 } },
    whileTap: { scale: 0.95 }
  },
  glow: {
    whileHover: { 
      boxShadow: "0 0 20px rgba(59, 130, 246, 0.5)",
      scale: 1.02
    },
    whileTap: { scale: 0.98 }
  },
  ripple: {
    whileHover: { scale: 1.03 },
    whileTap: { scale: 0.97 }
  },
  none: {}
};

// Styles des variantes
const getVariantStyles = (variant: ButtonVariant) => {
  const styles = {
    primary: 'bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    success: 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600',
    danger: 'bg-gradient-to-r from-red-500 to-pink-500 text-white hover:from-red-600 hover:to-pink-600',
    warning: 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-600 hover:to-orange-600',
    info: 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600'
  };
  return styles[variant];
};

// Styles des tailles (touch-optimized 44px minimum)
const getSizeStyles = (size: ButtonSize) => {
  const styles = {
    sm: 'px-3 py-2 text-sm min-h-[44px] min-w-[44px]', // 44px minimum
    md: 'px-4 py-2.5 text-base min-h-[48px] min-w-[48px]', // 48px standard
    lg: 'px-6 py-3 text-lg min-h-[56px] min-w-[56px]', // 56px pour actions importantes
    xl: 'px-8 py-4 text-xl min-h-[64px] min-w-[64px]' // 64px pour actions critiques
  };
  return styles[size];
};

export function EnhancedButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  animation = 'bounce',
  disabled = false,
  loading = false,
  success = false,
  error = false,
  icon,
  badge,
  className = '',
  hapticFeedback = true,
  soundEffect = false,
  rippleEffect = true,
  ...props
}: EnhancedButtonProps) {
  const [isPressed, setIsPressed] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  // Gestion du clic avec effets
  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;

    // Haptic feedback (mobile)
    if (hapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate(50);
    }

    // Sound effect
    if (soundEffect) {
      playClickSound();
    }

    // Ripple effect
    if (rippleEffect) {
      createRipple(e);
    }

    setIsPressed(true);
    setTimeout(() => setIsPressed(false), 150);

    if (onClick) {
      await onClick();
    }
  };

  // Effet ripple
  const createRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newRipple = {
      id: Date.now(),
      x,
      y
    };

    setRipples(prev => [...prev, newRipple]);
    
    setTimeout(() => {
      setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id));
    }, 600);
  };

  // Son de clic (optionnel)
  const playClickSound = () => {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYeAgiR1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYeAgjE6N2QQAoUXrTp66hVFApGn+DyvmYeAgiR1/LNeSsFJH/');
    audio.volume = 0.1;
    audio.play().catch(() => {}); // Ignore si impossible
  };

  // Détermine l'état visuel
  const getStateIcon = () => {
    if (loading) return <Loader2 className="animate-spin" size={16} />;
    if (success) return <Check size={16} />;
    if (error) return <X size={16} />;
    return icon;
  };

  const baseStyles = `
    relative overflow-hidden font-medium transition-all duration-200
    flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-opacity-50
    touch-target thumb-friendly tap-zone high-contrast-btn network-optimized
    ${getSizeStyles(size)} ${getVariantStyles(variant)}
    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
    ${isPressed ? 'transform scale-95' : ''}
    ${className}
  `;

  return (
    <motion.button
      className={baseStyles}
      onClick={handleClick}
      disabled={disabled || loading}
      {...(animation !== 'none' ? buttonAnimations[animation] : {})}
      {...props}
    >
      {/* Ripple effects */}
      <AnimatePresence>
        {ripples.map(ripple => (
          <motion.span
            key={ripple.id}
            className="absolute bg-white/30 rounded-full pointer-events-none"
            initial={{ 
              width: 0, 
              height: 0, 
              x: ripple.x, 
              y: ripple.y,
              opacity: 1 
            }}
            animate={{ 
              width: 100, 
              height: 100, 
              x: ripple.x - 50, 
              y: ripple.y - 50,
              opacity: 0 
            }}
            transition={{ duration: 0.6 }}
          />
        ))}
      </AnimatePresence>

      {/* Badge */}
      {badge && badge > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center"
        >
          {badge > 99 ? '99+' : badge}
        </motion.span>
      )}

      {/* Contenu */}
      <AnimatePresence mode="wait">
        {getStateIcon() && (
          <motion.span
            key={loading ? 'loading' : success ? 'success' : error ? 'error' : 'icon'}
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 90 }}
            transition={{ duration: 0.2 }}
          >
            {getStateIcon()}
          </motion.span>
        )}
      </AnimatePresence>

      <span className={loading ? 'opacity-70' : ''}>{children}</span>

      {/* Glow effect pour le hover */}
      {animation === 'glow' && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          initial={{ x: '-100%' }}
          whileHover={{ x: '100%' }}
          transition={{ duration: 0.6 }}
        />
      )}
    </motion.button>
  );
}

// Boutons spécialisés avec animations prédéfinies
export const QuickActionButton = ({ children, onClick, icon, ...props }: Partial<EnhancedButtonProps>) => (
  <EnhancedButton
    variant="primary"
    animation="bounce"
    icon={icon}
    onClick={onClick}
    hapticFeedback={true}
    {...props}
  >
    {children}
  </EnhancedButton>
);

export const CartButton = ({ itemCount = 0, onClick, ...props }: { itemCount?: number; onClick?: () => void } & Partial<EnhancedButtonProps>) => (
  <EnhancedButton
    variant="success"
    animation="pulse"
    icon={<ShoppingCart size={20} />}
    badge={itemCount}
    onClick={onClick}
    className="fixed bottom-4 right-4 shadow-2xl"
    {...props}
  >
    Panier
  </EnhancedButton>
);

export const FavoriteButton = ({ isFavorite, onToggle }: { isFavorite: boolean; onToggle: () => void }) => (
  <EnhancedButton
    variant={isFavorite ? 'danger' : 'secondary'}
    animation="bounce"
    size="sm"
    icon={<Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />}
    onClick={onToggle}
    soundEffect={true}
  >
    {isFavorite ? 'Aimé' : 'Aimer'}
  </EnhancedButton>
);

export const PowerButton = ({ onActivate }: { onActivate: () => void }) => (
  <EnhancedButton
    variant="warning"
    animation="glow"
    size="lg"
    icon={<Zap size={24} />}
    onClick={onActivate}
    hapticFeedback={true}
    soundEffect={true}
  >
    Activer
  </EnhancedButton>
);

// Démo des boutons
export function ButtonShowcase() {
  const [cartItems, setCartItems] = useState(3);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleAsyncAction = async () => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setLoading(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  return (
    <div className="p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Système de boutons amélioré</h1>
        
        {/* Variantes */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-700">Variantes</h2>
          <div className="flex flex-wrap gap-4">
            <EnhancedButton variant="primary">Primaire</EnhancedButton>
            <EnhancedButton variant="secondary">Secondaire</EnhancedButton>
            <EnhancedButton variant="success">Succès</EnhancedButton>
            <EnhancedButton variant="danger">Danger</EnhancedButton>
            <EnhancedButton variant="warning">Attention</EnhancedButton>
            <EnhancedButton variant="info">Info</EnhancedButton>
          </div>
        </section>

        {/* Tailles */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-700">Tailles</h2>
          <div className="flex flex-wrap items-center gap-4">
            <EnhancedButton size="sm">Petit</EnhancedButton>
            <EnhancedButton size="md">Moyen</EnhancedButton>
            <EnhancedButton size="lg">Grand</EnhancedButton>
            <EnhancedButton size="xl">Très grand</EnhancedButton>
          </div>
        </section>

        {/* Animations */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-700">Animations</h2>
          <div className="flex flex-wrap gap-4">
            <EnhancedButton animation="bounce">Bounce</EnhancedButton>
            <EnhancedButton animation="pulse">Pulse</EnhancedButton>
            <EnhancedButton animation="shake">Shake</EnhancedButton>
            <EnhancedButton animation="glow">Glow</EnhancedButton>
            <EnhancedButton animation="ripple">Ripple</EnhancedButton>
          </div>
        </section>

        {/* États */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-700">États</h2>
          <div className="flex flex-wrap gap-4">
            <EnhancedButton 
              loading={loading} 
              onClick={handleAsyncAction}
            >
              {loading ? 'Chargement...' : 'Action async'}
            </EnhancedButton>
            <EnhancedButton success={success}>Succès</EnhancedButton>
            <EnhancedButton disabled>Désactivé</EnhancedButton>
            <EnhancedButton icon={<Star size={16} />}>Avec icône</EnhancedButton>
            <EnhancedButton badge={5}>Avec badge</EnhancedButton>
          </div>
        </section>

        {/* Boutons spécialisés */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-700">Boutons spécialisés</h2>
          <div className="flex flex-wrap gap-4">
            <QuickActionButton icon={<Zap size={16} />}>Action rapide</QuickActionButton>
            <FavoriteButton 
              isFavorite={isFavorite} 
              onToggle={() => setIsFavorite(!isFavorite)} 
            />
            <PowerButton onActivate={() => alert('Activé!')} />
          </div>
        </section>

        {/* Panier flottant */}
        <CartButton 
          itemCount={cartItems} 
          onClick={() => setCartItems(prev => prev + 1)}
        />
      </div>
    </div>
  );
}