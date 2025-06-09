import React, { useState } from 'react';
import { X, Plus, Edit, Trash2, UserCheck, UserX } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Server } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

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
  phone: '',
  email: '', // Optionnel
  age: 0,
  parentContact: '',
  startDate: new Date().toISOString().split('T')[0], // Date du jour par défaut
  isActive: true,
});

const getServiceDuration = (startDate: string) => {
  const start = new Date(startDate);
  const now = new Date();
  const years = now.getFullYear() - start.getFullYear();
  const months = now.getMonth() - start.getMonth();
  
  if (years > 0) {
    return `${years} an${years > 1 ? 's' : ''}`;
  }
  return `${Math.max(1, months)} mois`;
};

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
    setFormData({ 
      name: '', 
      phone: '', 
      email: '', 
      age: 0, 
      parentContact: '', 
      startDate: new Date().toISOString().split('T')[0], 
      isActive: true 
    });
    setEditingServer(null);
    setShowForm(false);
  };

  const handleEdit = (server: Server) => {
    setEditingServer(server);
    setFormData({
      name: server.name,
      phone: server.phone,
      email: server.email || '',
      age: server.age || 0,
      parentContact: server.parentContact,
      startDate: server.startDate,
      isActive: server.isActive,
    });
    setShowForm(true);
  };

  const toggleStatus = (server: Server) => {
    updateServer(server.id, { isActive: !server.isActive });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-yellow-100 to-amber-100 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-orange-100">
          <h2 className="text-xl font-semibold text-gray-800">Gestion des Serveurs</h2>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => setShowForm(true)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 flex items-center gap-2 transition-colors"
            >
              <Plus size={16} />
              Ajouter serveur
            </motion.button>
            <motion.button 
              onClick={onClose} 
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={24} />
            </motion.button>
          </div>
        </div>

        <div className="p-6">
          <AnimatePresence>
            {showForm && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-orange-50 rounded-xl p-4 mb-6 border border-orange-100"
              >
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  {editingServer ? 'Modifier serveur' : 'Nouveau serveur'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl text-gray-800 focus:border-orange-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Téléphone *</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl text-gray-800 focus:border-orange-400 focus:outline-none"
                      placeholder="+229 XX XX XX XX"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email (optionnel)</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl text-gray-800 focus:border-orange-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Âge *</label>
                    <input
                      type="number"
                      required
                      min="16"
                      max="70"
                      value={formData.age === 0 ? '' : formData.age}
                      onChange={(e) => setFormData({...formData, age: parseInt(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl text-gray-800 focus:border-orange-400 focus:outline-none"
                      placeholder="25"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Contact parent/tuteur *</label>
                    <input
                      type="tel"
                      required
                      value={formData.parentContact}
                      onChange={(e) => setFormData({...formData, parentContact: e.target.value})}
                      className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl text-gray-800 focus:border-orange-400 focus:outline-none"
                      placeholder="+229 XX XX XX XX"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date de prise de service *</label>
                    <input
                      type="date"
                      required
                      value={formData.startDate}
                      onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                      className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl text-gray-800 focus:border-orange-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                      className="rounded text-orange-500 focus:ring-orange-400"
                    />
                    <label className="text-gray-700">Serveur actif</label>
                  </div>
                  <div className="flex gap-2">
                    <motion.button
                      type="submit"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors"
                    >
                      {editingServer ? 'Modifier' : 'Ajouter'}
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={resetForm}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors"
                    >
                      Annuler
                    </motion.button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((server) => (
              <motion.div 
                key={server.id} 
                whileHover={{ y: -2 }}
                className="bg-white rounded-xl p-4 shadow-sm border border-orange-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-800">{server.name}</h4>
                  <div className="flex items-center gap-1">
                    {server.isActive ? (
                      <UserCheck size={16} className="text-green-500" />
                    ) : (
                      <UserX size={16} className="text-red-500" />
                    )}
                  </div>
                </div>
                
                <div className="mb-3 space-y-1">
                  <p className="text-gray-600 text-sm">{server.age} ans • {server.phone}</p>
                  {server.email && <p className="text-gray-600 text-sm">📧 {server.email}</p>}
                  <p className="text-gray-600 text-sm">Parent: {server.parentContact}</p>
                  <p className="text-gray-600 text-sm">
                    En service depuis {getServiceDuration(server.startDate)}
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <motion.button
                    onClick={() => handleEdit(server)}
                    title="Modifier"
                    className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <Edit size={14} />
                  </motion.button>

                  <motion.button
                    onClick={() => toggleStatus(server)}
                    title={server.isActive ? "Désactiver" : "Activer"}
                    className={`p-2 rounded-lg text-white transition-colors ${
                      server.isActive ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-500 hover:bg-green-600'
                    }`}
                  >
                    {server.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                  </motion.button>

                  <motion.button
                    onClick={() => {
                      if (confirm(`Supprimer ${server.name} définitivement ?`)) {
                        deleteServer(server.id);
                      }
                    }}
                    title="Supprimer"
                    className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    <Trash2 size={14} />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}