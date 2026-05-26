/**
 * Storage Service Wrapper — Portable Layer
 *
 * Ce module est la **porte d'entrée unique** pour le stockage de fichiers.
 *
 * 🎯 BUT : Isoler Supabase Storage derrière une API portable. Le jour où on migre
 *         vers Cloudflare R2 / S3 / Vercel Blob, seul ce fichier change.
 *
 * 📖 RÈGLE : Tout NOUVEAU code utilisant le storage doit passer par `storageService`.
 *           Le code existant (notamment ImageUpload) sera migré quand on le touchera.
 *
 * Actuellement, un seul fichier UI utilise le storage directement (ImageUpload.tsx).
 * Migration future = changer ce wrapper, ImageUpload reste identique.
 */

import { supabase } from '../../lib/supabase';

export interface UploadResult {
  url: string;
  path: string;
}

export const storageService = {
  /**
   * Upload un fichier et retourne l'URL publique.
   *
   * @param file Fichier à uploader
   * @param bucket Nom du bucket (ex: 'product-images')
   * @param folderPath Chemin du dossier dans le bucket (ex: 'uploads', 'logos')
   * @returns URL publique + chemin du fichier uploadé
   */
  async uploadFile(file: File, bucket: string, folderPath: string): Promise<UploadResult> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${folderPath}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, file);
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);

    return { url: publicUrl, path: fileName };
  },

  /**
   * Récupère l'URL publique d'un fichier déjà uploadé.
   */
  getPublicUrl(bucket: string, path: string): string {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },

  /**
   * Supprime un fichier du storage.
   */
  async deleteFile(bucket: string, path: string): Promise<void> {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) throw error;
  },
};
