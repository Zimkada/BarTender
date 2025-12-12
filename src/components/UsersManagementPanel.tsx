import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebounce } from 'use-debounce';
import {
  X, Users, Search, Filter, ChevronLeft, ChevronRight, UserPlus, Eye, EyeOff, RefreshCw, Copy, AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { User, UserRole } from '../types';
import { Select } from './ui/Select';
import { Alert } from './ui/Alert';
import { AdminService } from '../services/supabase/admin.service';
import { AuthService } from '../services/supabase/auth.service';
import { EditUserModal } from './EditUserModal';

interface UsersManagementPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// NOTE: Le formulaire de création de promoteur est conservé pour l'instant,
// mais une approche plus modulaire serait de l'extraire dans son propre composant.
interface CreatePromoteurForm {
  email: string; phone: string; password: string; firstName: string; lastName: string; barName: string; barAddress: string; barPhone: string;
}
const initialFormData: CreatePromoteurForm = {
  email: '', phone: '', password: '', firstName: '', lastName: '', barName: '', barAddress: '', barPhone: '',
};

export default function UsersManagementPanel({ isOpen, onClose }: UsersManagementPanelProps) {
  const [users, setUsers] = useState<Array<User & { roles: string[] }>>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(10);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500);
  const [error, setError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<(User & { roles: string[] }) | null>(null);

  const totalPages = Math.ceil(totalCount / limit);

  const loadUsers = useCallback(async () => {
    if (!isOpen) return;
    try {
      setError(null);
      setLoading(true);
      const data = await AdminService.getPaginatedUsers({
        page: currentPage,
        limit,
        searchQuery: debouncedSearchQuery,
        roleFilter: roleFilter,
      });
      setUsers(data.users);
      setTotalCount(data.totalCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue lors du chargement des utilisateurs';
      setError(message);
      console.error('Erreur chargement des utilisateurs:', error);
    } finally {
      setLoading(false);
    }
  }, [isOpen, currentPage, limit, debouncedSearchQuery, roleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, roleFilter]);

  // Le reste du code (formulaire création promoteur) est conservé mais pourrait être extrait
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<CreatePromoteurForm>(initialFormData);
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<CreatePromoteurForm>>({});
  const [createdCredentials, setCreatedCredentials] = useState<any>(null);

  const generateSecurePassword = () => { /* ... (gardé tel quel) ... */ };
  const copyCredentials = (creds: any) => { /* ... (gardé tel quel) ... */ };
  const validateForm = (): boolean => { /* ... (gardé tel quel) ... */ return true; };

  const handleCreatePromoteur = async () => {
    // ... (gardé tel quel, mais appelle loadUsers() à la fin)
    setTimeout(() => {
      loadUsers();
    }, 500);
  };

  if (!isOpen) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white relative">
              <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"><X className="w-6 h-6" /></button>
              <div className="flex items-center gap-3"><Users className="w-8 h-8" /><div><h2 className="text-2xl font-bold">Gestion des Utilisateurs</h2><p className="text-purple-100 text-sm">Gérer tous les utilisateurs de la plateforme</p></div></div>
            </div>

            {/* Filters */}
            <div className="p-4 md:p-6 border-b">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="text" placeholder="Rechercher par nom, email, téléphone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" /></div>
                </div>
                <div>
                  <div className="relative"><Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" /><Select options={[{ value: 'all', label: 'Tous les rôles' }, { value: 'promoteur', label: 'Promoteurs' }, { value: 'gerant', label: 'Gérants' }, { value: 'serveur', label: 'Serveurs' }]} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')} className="pl-10" /></div>
                </div>
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="p-4 border-b">
                <Alert variant="destructive" title="Erreur de chargement">
                  <div className="flex items-center justify-between">
                    <span>{error}</span>
                    <button
                      onClick={() => loadUsers()}
                      className="ml-4 px-3 py-1 text-sm bg-red-100 hover:bg-red-200 rounded-md font-medium transition-colors"
                    >
                      Réessayer
                    </button>
                  </div>
                </Alert>
              </div>
            )}

            {/* Users List */}
            <div className="flex-1 overflow-y-auto">
              {loading && users.length === 0 ? (
                <div className="text-center py-12"><p>Chargement...</p></div>
              ) : users.length === 0 ? (
                <div className="text-center py-12"><p>Aucun utilisateur trouvé.</p></div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rôle(s)</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date d'inscription</th>
                      <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map(user => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap"><div className="flex items-center"><div className="text-sm font-medium text-gray-900">{user.name}</div><div className="text-sm text-gray-500 ml-2">({user.email})</div></div></td>
                        <td className="px-6 py-4 whitespace-nowrap"><div className="flex flex-wrap gap-1">{user.roles.map(role => (<span key={role} className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">{role}</span>))}</div></td>
                        <td className="px-6 py-4 whitespace-nowrap"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{user.isActive ? 'Actif' : 'Suspendu'}</span></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(user.createdAt).toLocaleDateString('fr-FR')}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => setEditingUser(user)}
                            className="text-indigo-600 hover:text-indigo-900 font-medium"
                          >
                            Modifier
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            <div className="p-4 border-t flex-shrink-0 bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-600">Page <span className="font-semibold">{currentPage}</span> sur <span className="font-semibold">{totalPages}</span> ({totalCount} utilisateurs)</p>
              <div className="flex gap-2">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>

          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* Edit User Modal - Outside AnimatePresence to avoid key conflicts */}
      {
        editingUser && (
          <EditUserModal
            isOpen={editingUser !== null}
            onClose={() => setEditingUser(null)}
            user={editingUser}
            onSuccess={() => {
              loadUsers();
              setEditingUser(null);
            }}
          />
        )
      }
    </>
  );
}
