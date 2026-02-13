import React from 'react';
import { DollarSign } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Label } from '../../../components/ui/Label'; // Assuming this exists or using generic label
import { useCurrencyFormatter } from '../../../hooks/useBeninCurrency';

interface InitialBalanceModalProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: { amount: string; date: string; description: string }) => void;
    existingBalance?: {
        amount: number;
        date: string;
        description: string;
        isLocked?: boolean;
        createdBy?: string;
    } | null;
}

export const InitialBalanceModal: React.FC<InitialBalanceModalProps> = ({
    open,
    onClose,
    onSubmit,
    existingBalance
}) => {
    const { formatPrice } = useCurrencyFormatter();
    const [form, setForm] = React.useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: 'Solde initial'
    });

    const handleSubmit = () => {
        onSubmit(form);
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Définir le solde initial"
            description="Le montant en caisse au démarrage de votre comptabilité."
            icon={<DollarSign className="text-purple-600" size={24} />}
            headerClassName="bg-purple-50/50"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={handleSubmit}
                        disabled={!!existingBalance}
                    >
                        {existingBalance ? 'Déjà défini' : 'Enregistrer'}
                    </Button>
                </>
            }
        >
            <div className="space-y-5">
                {/* Warning if balance exists */}
                {existingBalance && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                        <p className="font-semibold text-amber-800 mb-1">⚠️ Solde déjà défini</p>
                        <div className="flex justify-between items-center text-amber-700">
                            <span>{new Date(existingBalance.date).toLocaleDateString('fr-FR')}</span>
                            <span className="font-mono font-bold">{formatPrice(existingBalance.amount)}</span>
                        </div>
                        {existingBalance.description && <p className="text-amber-600 mt-1 italic">"{existingBalance.description}"</p>}
                        {existingBalance.isLocked && <p className="text-red-600 font-bold mt-2 text-xs uppercase tracking-wide">🔒 Verrouillé par des écritures postérieures</p>}
                    </div>
                )}

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Montant (FCFA) <span className="text-red-500">*</span></Label>
                        <Input
                            type="number"
                            value={form.amount}
                            onChange={(e) => setForm({ ...form, amount: e.target.value })}
                            placeholder="Ex: 500000"
                            autoFocus
                            className="font-mono text-lg"
                        />
                        <p className="text-xs text-gray-400">Peut être négatif en cas de dette initiale.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-700">Date de référence <span className="text-red-500">*</span></Label>
                            <Input
                                type="date"
                                value={form.date}
                                onChange={(e) => setForm({ ...form, date: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Description</Label>
                        <Input
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            placeholder="Ex: Ouverture compte bancaire"
                        />
                    </div>
                </div>
            </div>
        </Modal>
    );
};
