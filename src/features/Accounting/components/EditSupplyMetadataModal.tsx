import React from 'react';
import { Pencil, User, Phone, FileText } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { Label } from '../../../components/ui/Label';

interface EditSupplyMetadataModalProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (updates: { supplierName: string; supplierPhone: string; notes: string }) => void;
    isLoading?: boolean;
    initial: {
        supplierName: string;
        supplierPhone: string;
        notes: string;
        productName?: string;
    };
}

export const EditSupplyMetadataModal: React.FC<EditSupplyMetadataModalProps> = ({
    open,
    onClose,
    onSubmit,
    isLoading = false,
    initial,
}) => {
    const [form, setForm] = React.useState({
        supplierName: initial.supplierName,
        supplierPhone: initial.supplierPhone,
        notes: initial.notes,
    });

    React.useEffect(() => {
        if (open) {
            setForm({
                supplierName: initial.supplierName,
                supplierPhone: initial.supplierPhone,
                notes: initial.notes,
            });
        }
    }, [open, initial.supplierName, initial.supplierPhone, initial.notes]);

    const isDirty =
        form.supplierName !== initial.supplierName ||
        form.supplierPhone !== initial.supplierPhone ||
        form.notes !== initial.notes;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Modifier les infos de l'approvisionnement"
            description={
                initial.productName
                    ? `Édition des informations cosmétiques pour ${initial.productName}. Aucun impact sur le stock ni la comptabilité.`
                    : 'Édition des informations cosmétiques. Aucun impact sur le stock ni la comptabilité.'
            }
            icon={<Pencil className="text-blue-600" size={24} />}
            headerClassName="bg-blue-50/50"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={isLoading}>
                        Annuler
                    </Button>
                    <Button
                        onClick={() => onSubmit(form)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={!isDirty || isLoading}
                    >
                        {isLoading ? 'Enregistrement…' : 'Enregistrer'}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="supplierName">
                        <span className="inline-flex items-center gap-2">
                            <User size={14} />
                            Fournisseur
                        </span>
                    </Label>
                    <Input
                        id="supplierName"
                        value={form.supplierName}
                        onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
                        placeholder="Nom du fournisseur"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="supplierPhone">
                        <span className="inline-flex items-center gap-2">
                            <Phone size={14} />
                            Téléphone (optionnel)
                        </span>
                    </Label>
                    <Input
                        id="supplierPhone"
                        value={form.supplierPhone}
                        onChange={(e) => setForm({ ...form, supplierPhone: e.target.value })}
                        placeholder="Ex : 97 00 00 00"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="supplyNotes">
                        <span className="inline-flex items-center gap-2">
                            <FileText size={14} />
                            Notes
                        </span>
                    </Label>
                    <Textarea
                        id="supplyNotes"
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder="Remarques internes…"
                        rows={3}
                    />
                </div>
            </div>
        </Modal>
    );
};
