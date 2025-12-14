import React, { useState } from 'react';
import { useActingAs } from '../context/ActingAsContext';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

interface User {
  id: string;
  name: string;
  email?: string;
}

interface Bar {
  id: string;
  name: string;
}

interface StartActingAsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  users?: User[];
  bars?: Bar[];
}

/**
 * StartActingAsDialog Component
 * Modal dialog for super_admin to select a user and bar to impersonate
 */
export const StartActingAsDialog: React.FC<StartActingAsDialogProps> = ({
  isOpen,
  onClose,
  users = [],
  bars = [],
}) => {
  const { startActingAs } = useActingAs();
  const { currentSession } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedBarId, setSelectedBarId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const selectedBar = bars.find((b) => b.id === selectedBarId);

  const handleStartActingAs = async () => {
    if (!selectedUserId || !selectedBarId) {
      toast.error('Please select a user and a bar');
      return;
    }

    try {
      setIsLoading(true);

      // Verify super_admin status
      if (!currentSession || currentSession.role !== 'super_admin') {
        toast.error('Only super_admin can perform this action');
        return;
      }

      // Start impersonation session
      startActingAs(selectedUserId, selectedUser!.name, selectedBarId, selectedBar!.name);

      toast.success(`Now acting as ${selectedUser!.name} in ${selectedBar!.name}`);

      // Close dialog and reset form
      onClose();
      setSelectedUserId('');
      setSelectedBarId('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to start acting as user');
      console.error('[StartActingAsDialog] Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">Act As Another User</h2>
          <p className="text-sm text-gray-500 mt-1">Select a user and bar to impersonate</p>
        </div>

        {/* User Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">User</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
            disabled={isLoading}
          >
            <option value="">Select a user...</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} {user.email ? `(${user.email})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Bar Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Bar</label>
          <select
            value={selectedBarId}
            onChange={(e) => setSelectedBarId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
            disabled={isLoading}
          >
            <option value="">Select a bar...</option>
            {bars.map((bar) => (
              <option key={bar.id} value={bar.id}>
                {bar.name}
              </option>
            ))}
          </select>
        </div>

        {/* Warning */}
        {selectedUser && selectedBar && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-sm text-amber-800">
              <strong>You will act as:</strong> {selectedUser.name} in {selectedBar.name}. All actions will be
              recorded in the audit log.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleStartActingAs}
            disabled={isLoading || !selectedUserId || !selectedBarId}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Starting...' : 'Start Acting As'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StartActingAsDialog;
