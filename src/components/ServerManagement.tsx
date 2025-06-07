import React, { useState } from 'react';
import { X, Plus, Edit, Trash2, UserCheck, UserX } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Server } from '../types';
import { motion } from 'framer-motion';

interface ServerManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ServerManagement({ isOpen, onClose }: ServerManagementProps) {
  const { servers, addServer, updateServer, deleteServer } = useAppContext();
  const [showForm, setShowForm] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    isActive: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingServer) {
      updateServer(editingServer.id, formData);
    } else {
      addServer(formData);
    }
    
    resetForm();
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', isActive: true });
    setEditingServer(null);
    setShowForm(false);
  };

  const handleEdit = (server: Server) => {
    setEditingServer(server);
    setFormData({
      name: server.name,
      email: server.email,
      isActive: server.isActive,
    });
    setShowForm(true);
  };

  const toggleStatus = (server: Server) => {
    updateServer(server.id, { isActive: !server.isActive });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Gestion des Serveurs</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 flex items-center gap-2"
            >
              <Plus size={16} />
              Ajouter serveur
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-4">
          {showForm && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-800 rounded-lg p-4 mb-6"
            >
              <h3 className="text-lg font-semibold text-white mb-4">
                {editingServer ? 'Modifier serveur' : 'Nouveau serveur'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Nom</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                    className="rounded"
                  />
                  <label className="text-gray-300">Serveur actif</label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500"
                  >
                    {editingServer ? 'Modifier' : 'Ajouter'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((server) => (
              <div key={server.id} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-white">{server.name}</h4>
                  <div className="flex items-center gap-1">
                    {server.isActive ? (
                      <UserCheck size={16} className="text-green-400" />
                    ) : (
                      <UserX size={16} className="text-red-400" />
                    )}
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-3">{server.email}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(server)}
                    className="p-2 bg-blue-600 text-white rounded hover:bg-blue-500"
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    onClick={() => toggleStatus(server)}
                    className={`p-2 rounded text-white ${
                      server.isActive ? 'bg-orange-600 hover:bg-orange-500' : 'bg-green-600 hover:bg-green-500'
                    }`}
                  >
                    {server.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                  </button>
                  <button
                    onClick={() => deleteServer(server.id)}
                    className="p-2 bg-red-600 text-white rounded hover:bg-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}