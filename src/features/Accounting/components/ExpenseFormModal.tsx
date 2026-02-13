import React from 'react';
import { Receipt, Calendar, DollarSign, Type } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { Label } from '../../../components/ui/Label';
import { ExpenseCategory } from '../../../types';
import { EXPENSE_CATEGORY_LABELS } from '../../../hooks/useExpenses';
import { useBarContext } from '../../../context/BarContext';
import { getCurrentBusinessDateString } from '../../../utils/businessDateHelpers';

interface ExpenseFormModalProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: any) => void;
    customCategories: any[];
}

export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({
    open,
    onClose,
    onSubmit,
    customCategories
}) => {
    const { currentBar } = useBarContext();
    const [form, setForm] = React.useState({
        amount: '',
        category: 'water' as ExpenseCategory,
        customCategoryId: '',
        date: getCurrentBusinessDateString(currentBar?.closingHour),
        notes: ''
    });

    const handleSubmit = () => {
        if (!form.amount || parseFloat(form.amount) <= 0) return;
        onSubmit(form);
        setForm({
            amount: '',
            category: 'water',
            customCategoryId: '',
            date: getCurrentBusinessDateString(currentBar?.closingHour),
            notes: ''
        });
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Nouvelle Dépense"
            description="Enregistrez un frais d'exploitation pour votre bar."
            icon={<Receipt className="text-rose-600" size={24} />}
            headerClassName="bg-rose-50/50"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        className="bg-rose-600 hover:bg-rose-700 text-white"
                        disabled={!form.amount || parseFloat(form.amount) <= 0}
                    >
                        Enregistrer la dépense
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="amount">Montant (FCFA) <span className="text-red-500">*</span></Label>
                    <div className="relative">
                        <Input
                            id="amount"
                            type="number"
                            value={form.amount}
                            onChange={(e) => setForm({ ...form, amount: e.target.value })}
                            placeholder="5000"
                            className="pl-10 font-mono text-lg border-rose-100 focus:ring-rose-500"
                        />
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Catégorie <span className="text-red-500">*</span></Label>
                        <Select
                            options={[
                                ...Object.entries(EXPENSE_CATEGORY_LABELS)
                                    .filter(([key]) => key !== 'custom')
                                    .map(([key, data]) => ({ value: key, label: `${data.icon} ${data.label}` })),
                                ...customCategories.map(cat => ({ value: `custom:${cat.id}`, label: `${cat.icon} ${cat.name}` }))
                            ]}
                            value={form.category === 'custom' && form.customCategoryId ? `custom:${form.customCategoryId}` : form.category}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (value.startsWith('custom:')) {
                                    setForm({ ...form, category: 'custom', customCategoryId: value.replace('custom:', '') });
                                } else {
                                    setForm({ ...form, category: value as ExpenseCategory, customCategoryId: '' });
                                }
                            }}
                            className="border-rose-100"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Date <span className="text-red-500">*</span></Label>
                        <div className="relative">
                            <Input
                                type="date"
                                value={form.date}
                                onChange={(e) => setForm({ ...form, date: e.target.value })}
                                className="pl-10 border-rose-100"
                            />
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="notes">Notes / Justification</Label>
                    <div className="relative">
                        <Textarea
                            id="notes"
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            placeholder="Détails de la dépense..."
                            rows={3}
                            className="pl-10 border-rose-100 resize-none"
                        />
                        <Type className="absolute left-3 top-3 text-gray-400" size={18} />
                    </div>
                </div>
            </div>
        </Modal>
    );
};
