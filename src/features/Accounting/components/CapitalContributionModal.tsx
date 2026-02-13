import React from 'react';
import { DollarSign } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { useCurrencyFormatter } from '../../../hooks/useBeninCurrency';
import { CapitalSource } from '../../../types';

interface CapitalContributionModalProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: any) => void;
    existingContributions: any[];
}

export const CapitalContributionModal: React.FC<CapitalContributionModalProps> = ({
    open,
    onClose,
    onSubmit,
    existingContributions
}) => {
    const { formatPrice } = useCurrencyFormatter();
    const [form, setForm] = React.useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        source: 'owner' as CapitalSource,
        sourceDetails: ''
    });

    const handleSubmit = () => {
        onSubmit(form);
        // Reset form handled by parent typically, but we can reset here on close/submit if needed
        setForm({
            amount: '',
            date: new Date().toISOString().split('T')[0],
            description: '',
            source: 'owner',
            sourceDetails: ''
        });
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Nouvel Apport de Capital"
            description="Injectez des fonds dans la trésorerie (hors revenus d'exploitation)."
            icon={<DollarSign className="text-blue-600" size={24} />}
            headerClassName="bg-blue-50/50"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={handleSubmit}
                    >
                        Enregistrer l'apport
                    </Button>
                </>
            }
        >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ... existing content ... */}

                {/* Left Col: Existing History */}
                <div className="lg:col-span-1 bg-gray-50 rounded-xl p-4 border border-gray-100 h-fit">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Historique récent</h4>
                    {existingContributions.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Aucun apport enregistré.</p>
                    ) : (
                        <div className="space-y-3">
                            {existingContributions.slice(0, 5).map((c, i) => (
                                <div key={i} className="bg-white p-2 rounded border border-gray-100 shadow-sm">
                                    <div className="flex justify-between items-start">
                                        <span className="text-xs font-bold text-gray-700">{formatPrice(c.amount)}</span>
                                        <span className="text-[10px] text-gray-400">{new Date(c.date).toLocaleDateString()}</span>
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1 truncate">{c.source} {c.description ? `- ${c.description}` : ''}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right Col: Form */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Montant (FCFA) <span className="text-red-500">*</span></label>
                        <Input
                            type="number"
                            value={form.amount}
                            onChange={(e) => setForm({ ...form, amount: e.target.value })}
                            placeholder="Ex: 1000000"
                            autoFocus
                            className="font-mono text-lg border-blue-200 focus:ring-blue-500"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Source <span className="text-red-500">*</span></label>
                            <Select
                                value={form.source}
                                onChange={(e) => setForm({ ...form, source: e.target.value as CapitalSource })}
                                options={[
                                    { value: 'owner', label: '👤 Propriétaire' },
                                    { value: 'partner', label: '🤝 Associé' },
                                    { value: 'investor', label: '💼 Investisseur' },
                                    { value: 'loan', label: '🏦 Prêt Bancaire' },
                                    { value: 'other', label: '📋 Autre' },
                                ]}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Date <span className="text-red-500">*</span></label>
                            <Input
                                type="date"
                                value={form.date}
                                onChange={(e) => setForm({ ...form, date: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Détails Source (Optionnel)</label>
                        <Input
                            value={form.sourceDetails}
                            onChange={(e) => setForm({ ...form, sourceDetails: e.target.value })}
                            placeholder="Ex: Prêt Banque BOA #12345"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Note / Description</label>
                        <Input
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            placeholder="Ex: Renforcement trésorerie pour travaux"
                        />
                    </div>
                </div>
            </div>
        </Modal>
    );
};
