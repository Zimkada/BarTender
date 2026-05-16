import React from 'react';
import { Tag, Smile, Type } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Label } from '../../../components/ui/Label';

interface CategoryFormModalProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: { name: string; icon: string }) => void;
}

export const CategoryFormModal: React.FC<CategoryFormModalProps> = ({
    open,
    onClose,
    onSubmit
}) => {
    const [form, setForm] = React.useState({
        name: '',
        icon: '📝'
    });

    const handleSubmit = () => {
        if (!form.name.trim()) return;
        onSubmit(form);
        setForm({ name: '', icon: '📝' });
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Nouvelle Catégorie"
            description="Créez une catégorie personnalisée pour vos dépenses."
            icon={<Tag className="text-amber-600" size={24} />}
            headerClassName="bg-amber-50/50"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                        disabled={!form.name.trim()}
                    >
                        Créer la catégorie
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="catName">Nom de la catégorie <span className="text-red-500">*</span></Label>
                    <div className="relative">
                        <Input
                            id="catName"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="Ex: Loyer, Entretien, etc."
                            className="pl-10 border-amber-100 focus:ring-amber-500"
                            autoFocus
                        />
                        <Type className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="catIcon">Icône (Emoji)</Label>
                    <div className="relative">
                        <Input
                            id="catIcon"
                            value={form.icon}
                            onChange={(e) => setForm({ ...form, icon: e.target.value })}
                            placeholder="📝"
                            className="pl-10 border-amber-100 focus:ring-amber-500 text-xl"
                        />
                        <Smile className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    </div>
                    <p className="text-xs text-muted-foreground">Utilisez un emoji qui illustre bien la catégorie.</p>
                </div>
            </div>
        </Modal>
    );
};
