import React, { useState, useRef } from 'react';
import { Upload, Link as LinkIcon, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useFeedback } from '../hooks/useFeedback';

interface ImageUploadProps {
    currentImage?: string;
    onImageChange: (url: string) => void;
    bucketName?: string;
    folderPath?: string;
}

type InputMode = 'upload' | 'url';

export function ImageUpload({
    currentImage,
    onImageChange,
    bucketName = 'product-images',
    folderPath = 'uploads'
}: ImageUploadProps) {
    const [mode, setMode] = useState<InputMode>('upload');
    const [uploading, setUploading] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showError } = useFeedback();

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            const file = event.target.files?.[0];
            if (!file) return;

            // Validate file type
            if (!file.type.startsWith('image/')) {
                showError('Veuillez sélectionner une image valide (JPG, PNG, WEBP)');
                return;
            }

            // Validate file size (max 2MB)
            if (file.size > 2 * 1024 * 1024) {
                showError('L\'image ne doit pas dépasser 2MB');
                return;
            }

            setUploading(true);

            // Generate unique filename
            const fileExt = file.name.split('.').pop();
            const fileName = `${folderPath}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from(bucketName)
                .getPublicUrl(fileName);

            onImageChange(publicUrl);
        } catch (error: any) {
            showError('Erreur lors du téléchargement de l\'image');
            console.error('Upload error:', error);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleUrlSubmit = () => {
        if (!urlInput) return;
        onImageChange(urlInput);
        setUrlInput('');
    };

    const clearImage = () => {
        onImageChange('');
    };

    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground/80">Image du produit</label>

            {/* Preview Area */}
            {currentImage ? (
                <div className="relative w-full h-48 bg-muted rounded-xl overflow-hidden border border-border group">
                    <img
                        src={currentImage}
                        alt="Preview"
                        className="w-full h-full object-contain"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                            onClick={clearImage}
                            type="button"
                            className="p-2 bg-card text-red-600 rounded-full hover:bg-red-50 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>
            ) : (
                <div className="w-full h-48 bg-muted border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-foreground/70">
                    <ImageIcon size={48} className="mb-2 opacity-50" />
                    <span className="text-sm">Aucune image sélectionnée</span>
                </div>
            )}

            {/* Input Methods Tabs */}
            <div className="flex p-1 bg-muted rounded-lg">
                <button
                    type="button"
                    onClick={() => setMode('upload')}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${mode === 'upload'
                            ? 'bg-card text-blue-600 shadow-sm'
                            : 'text-muted-foreground hover:text-foreground/80'
                        }`}
                >
                    <Upload size={16} />
                    Importer
                </button>
                <button
                    type="button"
                    onClick={() => setMode('url')}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${mode === 'url'
                            ? 'bg-card text-blue-600 shadow-sm'
                            : 'text-muted-foreground hover:text-foreground/80'
                        }`}
                >
                    <LinkIcon size={16} />
                    Lien URL
                </button>
            </div>

            {/* Input Area */}
            {mode === 'upload' ? (
                <div className="relative">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="image-upload"
                        disabled={uploading}
                    />
                    <label
                        htmlFor="image-upload"
                        className={`flex items-center justify-center gap-2 w-full px-4 py-3 border border-border rounded-xl text-sm font-medium cursor-pointer transition-colors ${uploading
                                ? 'bg-muted text-foreground/70 cursor-not-allowed'
                                : 'bg-card text-foreground/80 hover:bg-muted hover:border-gray-400'
                            }`}
                    >
                        {uploading ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Téléchargement...
                            </>
                        ) : (
                            <>
                                <Upload size={18} />
                                Choisir un fichier
                            </>
                        )}
                    </label>
                    <p className="text-xs text-muted-foreground mt-1 text-center">
                        JPG, PNG, WEBP (Max 2MB)
                    </p>
                </div>
            ) : (
                <div className="flex gap-2">
                    <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://exemple.com/image.jpg"
                        className="flex-1 px-3 py-2 border border-border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                        type="button"
                        onClick={handleUrlSubmit}
                        disabled={!urlInput}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        OK
                    </button>
                </div>
            )}
        </div>
    );
}
