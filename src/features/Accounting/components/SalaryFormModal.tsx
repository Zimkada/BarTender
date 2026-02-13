import React from 'react';
import { Banknote, Calendar, User, DollarSign } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Label } from '../../../components/ui/Label';
import { formatPeriod } from '../../../utils/accounting';

interface SalaryFormModalProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: { memberId: string; amount: string; period: string }) => void;
    members: any[];
    selectedPeriod: string;
    onPeriodChange: (period: string) => void;
    periodOptions: string[];
    getSalaryForPeriod: (memberId: string, period: string) => any;
}

export const SalaryFormModal: React.FC<SalaryFormModalProps> = ({
    open,
    onClose,
    onSubmit,
    members,
    selectedPeriod,
    onPeriodChange,
    periodOptions,
    getSalaryForPeriod
}) => {
    const [form, setForm] = React.useState({
        memberId: '',
        amount: '',
        period: selectedPeriod
    });

    // Update form period when prop changes
    React.useEffect(() => {
        setForm(f => ({ ...f, period: selectedPeriod }));
    }, [selectedPeriod]);

    const handleSubmit = () => {
        if (!form.memberId || !form.amount || parseFloat(form.amount) <= 0) return;
        onSubmit(form);
        setForm({ ...form, memberId: '', amount: '' });
    };

    const activeMembers = members.filter(m => m.isActive);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Payer un salaire"
            description="Enregistrez le versement d'un salaire pour un membre de l'équipe."
            icon={<Banknote className="text-emerald-600" size={24} />}
            headerClassName="bg-emerald-50/50"
            footerClassName="bg-emerald-50/20"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={!form.memberId || !form.amount || parseFloat(form.amount) <= 0}
                    >
                        Confirmer le paiement
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Période de paie <span className="text-red-500">*</span></Label>
                        <div className="relative">
                            <Select
                                options={periodOptions.map(p => ({ value: p, label: formatPeriod(p) }))}
                                value={form.period}
                                onChange={(e) => {
                                    setForm({ ...form, period: e.target.value });
                                    onPeriodChange(e.target.value);
                                }}
                                className="pl-10 border-emerald-100"
                            />
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Membre <span className="text-red-500">*</span></Label>
                        <div className="relative">
                            <Select
                                options={[
                                    { value: '', label: 'Sélectionner un membre...' },
                                    ...activeMembers.map(m => {
                                        const alreadyPaid = getSalaryForPeriod(m.id, form.period);
                                        const name = m.user?.name || m.user?.userName || 'Membre';
                                        return {
                                            value: m.id,
                                            label: `${name} (${m.role})${alreadyPaid ? ' ✓ Payé' : ''}`,
                                            disabled: !!alreadyPaid
                                        };
                                    })
                                ]}
                                value={form.memberId}
                                onChange={(e) => setForm({ ...form, memberId: e.target.value })}
                                className="pl-10 border-emerald-100"
                            />
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="salAmount">Montant versé (FCFA) <span className="text-red-500">*</span></Label>
                    <div className="relative">
                        <Input
                            id="salAmount"
                            type="number"
                            value={form.amount}
                            onChange={(e) => setForm({ ...form, amount: e.target.value })}
                            placeholder="Ex: 75000"
                            className="pl-10 font-mono text-lg border-emerald-100 focus:ring-emerald-500"
                            autoFocus
                        />
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    </div>
                </div>
            </div>
        </Modal>
    );
};
