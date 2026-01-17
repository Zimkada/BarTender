import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useBar } from '@/context/BarContext';
import { useAuth } from '@/context/AuthContext';

interface User {
  id: string;
  name: string;
  email: string;
}

interface ManagerSearchModalProps {
  isOpen: boolean;
  onConfirm: (managerIds: string[]) => void;
  onCancel: () => void;
  selectedIds?: string[];
}

export const ManagerSearchModal: React.FC<ManagerSearchModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  selectedIds = [],
}) => {
  const { currentBar } = useBar();
  const { currentSession } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Fetch users on mount
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  // Filter users based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredUsers(users);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredUsers(
        users.filter(
          (user) =>
            user.email.toLowerCase().includes(term) ||
            user.name.toLowerCase().includes(term)
        )
      );
    }
  }, [searchTerm, users]);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      if (!currentBar?.id) {
        throw new Error('Aucun bar sélectionné');
      }

      if (!currentSession?.userId) {
        throw new Error('Utilisateur non authentifié');
      }

      // SECURITY FIX: Fetch all active users AND check which ones are already in this bar
      // This ensures we don't suggest users who are already members
      const { data: allUsers, error: usersError } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (usersError) {
        throw new Error(usersError.message);
      }

      // Get existing bar members to exclude them from the list
      const { data: barMembers, error: membersError } = await supabase
        .from('bar_members')
        .select('user_id')
        .eq('bar_id', currentBar.id)
        .eq('is_active', true);

      if (membersError) {
        console.error('Error fetching bar members:', membersError);
      }

      const existingMemberIds = new Set(
        barMembers?.map((m: any) => m.user_id) || []
      );

      // Filter out users who are already in this bar and the current user
      const availableUsers = (allUsers || []).filter(
        (user: any) =>
          !existingMemberIds.has(user.id) &&
          user.id !== currentSession.userId
      );

      setUsers(availableUsers);
      setFilteredUsers(availableUsers);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.message || 'Impossible de charger les utilisateurs');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (userId: string) => {
    setSelected((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Ajouter des Gérants</h2>
          <p className="text-sm text-gray-600 mt-1">Sélectionnez les utilisateurs existants pour les ajouter comme gérants</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Search */}
          <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <input
              type="text"
              placeholder="Rechercher par nom ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-6 py-3 bg-red-50 border-b border-red-200">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="px-6 py-8 text-center">
              <div className="inline-block">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
              <p className="mt-2 text-sm text-gray-600">Chargement des utilisateurs...</p>
            </div>
          )}

          {/* User List */}
          {!loading && filteredUsers.length > 0 && (
            <div className="px-6 py-3 space-y-2">
              {filteredUsers.map((user) => (
                <label
                  key={user.id}
                  className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(user.id)}
                    onChange={() => toggleSelect(user.id)}
                    className="h-4 w-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="ml-3 flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-600 truncate">{user.email}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredUsers.length === 0 && (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-gray-600">
                {users.length === 0
                  ? 'Aucun utilisateur disponible à ajouter'
                  : 'Aucun résultat ne correspond à votre recherche'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex gap-3 flex-shrink-0">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition font-medium"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ajouter ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
};
