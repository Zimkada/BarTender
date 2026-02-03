import { Building2, Key, Calendar } from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter } from '../ui/Card';
import { Badge } from '../ui/Badge';
import type { User } from '../../types';

interface UserCardProps {
  user: User & { roles: string[]; bars?: Array<{ id: string; name: string }> };
  onEdit: (user: User & { roles: string[] }) => void;
  onAddBar?: (user: User & { roles: string[] }) => void;
  onPasswordAction: (user: User & { roles: string[] }) => void;
  isFictionalEmail: (email: string | undefined) => boolean;
}

export function UserCard({
  user,
  onEdit,
  onAddBar,
  onPasswordAction,
  isFictionalEmail,
}: UserCardProps) {
  return (
    <Card variant="elevated" padding="none" className="overflow-hidden hover:shadow-lg transition-all">
      {/* Header avec nom et email */}
      <CardHeader className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 border-b border-purple-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-gray-900 truncate">{user.name}</h3>
            <p className="text-xs text-gray-600 truncate mt-0.5">{user.email}</p>
          </div>
          {/* Status Badge */}
          <Badge
            variant={user.isActive ? 'success' : 'danger'}
            size="sm"
            dot
            className="flex-shrink-0"
          >
            {user.isActive ? 'Actif' : 'Suspendu'}
          </Badge>
        </div>
      </CardHeader>

      {/* Content avec détails */}
      <CardContent className="p-4 space-y-3">
        {/* Rôles */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Rôle(s)</p>
          <div className="flex flex-wrap gap-1.5">
            {user.roles.map((role) => (
              <Badge key={role} variant="info" size="sm">
                {role}
              </Badge>
            ))}
          </div>
        </div>

        {/* Bars */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            Bar(s)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {user.bars && user.bars.length > 0 ? (
              user.bars.map((bar) => (
                <Badge key={bar.id} variant="default" size="sm">
                  {bar.name}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-gray-400 italic">Aucun bar</span>
            )}
          </div>
        </div>

        {/* Date d'inscription */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Calendar className="w-3 h-3" />
          <span>Inscrit le {new Date(user.createdAt).toLocaleDateString('fr-FR')}</span>
        </div>
      </CardContent>

      {/* Footer avec actions */}
      <CardFooter className="bg-gray-50 p-3 gap-2 flex-col border-t border-gray-100">
        {/* Ligne 1: Actions principales (toujours présentes) */}
        <div className="flex gap-2 w-full">
          <button
            onClick={() => onEdit(user)}
            className="flex-1 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Modifier
          </button>

          {/* Password action button */}
          <button
            onClick={() => onPasswordAction(user)}
            className={`flex-1 px-3 py-2 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${isFictionalEmail(user.email)
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-amber-600 hover:bg-amber-700'
              }`}
            title={isFictionalEmail(user.email) ? 'Définir le mot de passe' : 'Envoyer email de réinitialisation'}
          >
            <Key className="w-4 h-4" />
            <span>
              {isFictionalEmail(user.email) ? 'Définir MDP' : 'Reset MDP'}
            </span>
          </button>
        </div>

        {/* Ligne 2: Ajouter Bar (uniquement pour les promoteurs) */}
        {user.roles.includes('promoteur') && onAddBar && (
          <button
            onClick={() => onAddBar(user)}
            className="w-full px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center gap-1.5"
            title="Ajouter un bar"
          >
            <Building2 className="w-4 h-4" />
            <span>Ajouter Bar</span>
          </button>
        )}
      </CardFooter>
    </Card>
  );
}
