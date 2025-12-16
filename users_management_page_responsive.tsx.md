import React, { useState, useEffect, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import {
  Users, Search, Filter, ChevronLeft, ChevronRight, UserPlus, Key
} from 'lucide-react';
import type { User, UserRole } from '../../types';
import { Select } from '../../components/ui/Select';
import { Alert } from '../../components/ui/Alert';
import { AdminService } from '../../services/supabase/admin.service';
import { EditUserModal } from '../../components/EditUserModal';
import { AdminPanelErrorBoundary } from '../../components/AdminPanelErrorBoundary';
import { AdminPanelSkeleton } from '../../components/AdminPanelSkeleton';
import { PromotersCreationForm } from '../../components/PromotersCreationForm';
import { ResetPasswordConfirmationModal } from '../../components/ResetPasswordConfirmationModal'; // Import the new modal
import { useFeedback } from '../../hooks/useFeedback'; // Import useFeedback
import { supabase } from '../../lib/supabase'; // Import supabase client

export default function UsersManagementPage() {
  const { showSuccess, showError } = useFeedback(); // Destructure useFeedback hooks

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
  const [showPromotersForm, setShowPromotersForm] = useState(false);
  const [resetingPasswordForUser, setResetingPasswordForUser] = useState<(User & { roles: string[] }) | null>(null); // New state for password reset

  const totalPages = Math.ceil(totalCount / limit);

  const loadUsers = useCallback(async () => {
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
  }, [currentPage, limit, debouncedSearchQuery, roleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, roleFilter]);

  // Function to handle sending password reset emails
  const handleSendPasswordReset = async (user: User) => {
    if (!user.email) {
      showError(`L'utilisateur ${user.name} n'a pas d'email.`);
      return;
    }
    setLoading(true); // Show loading while email is being sent
    try {
      const { data, error } = await supabase.rpc('admin_send_password_reset', { p_user_id: user.id });
      if (error) {
        throw error;
      }
      if (data?.success) {
        // Check for the specific placeholder message returned by the RPC
        if (data.message && data.message.includes('est un placeholder')) {
          showError(data.message); // Display as an error/warning since no email was sent
        } else {
          showSuccess(data.message || `Lien de réinitialisation envoyé à ${user.email}.`);
        }
      } else {
        showError(data?.message || `Échec de l'envoi du lien à ${user.email}.`);
      }
    } catch (error: any) {
      console.error('Erreur envoi lien réinitialisation:', error);
      showError(`Erreur lors de l'envoi du lien à ${user.email}: ${error.message}`);
    } finally {
      setLoading(false);
      setResetingPasswordForUser(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <AdminPanelErrorBoundary fallbackTitle="Erreur dans la gestion des utilisateurs">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-3 sm:p-4 md:p-6 text-white rounded-t-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Users className="w-6 sm:w-8 h-6 sm:h-8 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold truncate">Gestion des Utilisateurs</h1>
                <p className="text-purple-100 text-xs sm:text-sm truncate">Gérer tous les utilisateurs de la plateforme</p>
              </div>
            </div>
            <button
              onClick={() => setShowPromotersForm(true)}
              className="px-3 sm:px-4 py-2 bg-white text-purple-600 rounded-lg hover:bg-purple-50 flex items-center gap-2 transition-colors font-semibold text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Ajouter Promoteur</span>
              <span className="sm:hidden">+</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 md:p-6 border-b bg-white">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rechercher par nom, email, téléphone, nom du bar..." // Updated placeholder
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
                <Select
                  options={[
                    { value: 'all', label: 'Tous les rôles' },
                    { value: 'promoteur', label: 'Promoteurs' },
                    { value: 'gerant', label: 'Gérants' },
                    { value: 'serveur', label: 'Serveurs' },
                  ]}
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 border-b bg-white">
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
        <div className="bg-gray-50">
          {loading && users.length === 0 ? (
            <AdminPanelSkeleton count={5} type="table" />
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <p>Aucun utilisateur trouvé.</p>
            </div>
          ) : (
            <div className="scrollbar-bottom overflow-x-auto"> {/* Added overflow-x-auto here */}
              <table className="w-full min-w-[600px] divide-y divide-gray-200">
                <thead className="bg-white">
                  <tr>
                    <th scope="col" className="px-2 sm:px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nom
                    </th>
                    <th scope="col" className="px-2 sm:px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rôle(s)
                    </th>
                    <th scope="col" className="px-2 sm:px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap sm:table-cell"> {/* Bar(s) visible from sm */}
                      Bar(s)
                    </th>
                    <th scope="col" className="px-2 sm:px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell"> {/* Statut hidden until lg */}
                      Statut
                    </th>
                    <th scope="col" className="px-2 sm:px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden xl:table-cell"> {/* Date d'inscription hidden until xl */}
                      Date d'inscription
                    </th>
                    <th scope="col" className="relative px-2 sm:px-4 md:px-6 py-3 w-auto md:w-28 whitespace-nowrap"> {/* Adjusted w-28 */}
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map(user => (
                    <tr key={user.id}>
                      <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="text-sm font-medium text-gray-900">{user.name}</div>
                          <div className="text-sm text-gray-500 ml-2 hidden md:inline">({user.email})</div> {/* Email hidden until md */}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map(role => (
                            <span
                              key={role}
                              className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800"
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap sm:table-cell"> {/* Bar(s) visible from sm */}
                        <div className="flex flex-wrap gap-1">
                          {(user as any).bars && (user as any).bars.length > 0 ? (
                            (user as any).bars.map((bar: { id: string; name: string }) => (
                              <span
                                key={bar.id}
                                className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800"
                              >
                                {bar.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-500">Aucun bar</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap hidden lg:table-cell"> {/* Statut hidden until lg */}
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {user.isActive ? 'Actif' : 'Suspendu'}
                        </span>
                      </td>
                      <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden xl:table-cell"> {/* Date d'inscription hidden until xl */}
                        {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-2 sm:px-4 md:px-6 py-4 whitespace-nowrap text-right text-sm font-medium w-auto md:w-28"> {/* Adjusted w-28 */}
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditingUser(user)}
                            className="text-indigo-600 hover:text-indigo-900 font-medium"
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => setResetingPasswordForUser(user)}
                            className="text-amber-600 hover:text-amber-900 font-medium p-1 rounded-md"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="p-3 sm:p-4 border-t flex-shrink-0 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 rounded-b-2xl">
          <p className="text-xs sm:text-sm text-gray-600">
            Page <span className="font-semibold">{currentPage}</span> sur{' '}
            <span className="font-semibold">{totalPages}</span> ({totalCount} utilisateurs)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </AdminPanelErrorBoundary>

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserModal
          isOpen={editingUser !== null}
          onClose={() => setEditingUser(null)}
          user={editingUser}
          onSuccess={() => {
            loadUsers();
            setEditingUser(null);
          }}
        />
      )}

      {/* Promoters Creation Form */}
      {showPromotersForm && (
        <PromotersCreationForm
          isOpen={showPromotersForm}
          onClose={() => setShowPromotersForm(false)}
          onSuccess={() => {
            loadUsers();
            setShowPromotersForm(false);
          }}
        />
      )}
      {/* New: Password Reset Confirmation Modal */}
      {resetingPasswordForUser && (
        <ResetPasswordConfirmationModal
          isOpen={resetingPasswordForUser !== null}
          onClose={() => setResetingPasswordForUser(null)}
          user={resetingPasswordForUser}
          onConfirm={handleSendPasswordReset}
        />
      )}
    </div>
  );
}