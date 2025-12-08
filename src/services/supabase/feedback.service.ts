import { supabase, handleSupabaseError } from '../../lib/supabase';

export interface FeedbackData {
    user_id: string;
    bar_id: string;
    type: 'bug' | 'feature' | 'other';
    message: string;
    email?: string;
}

export class FeedbackService {
    static async submitFeedback(feedbackData: FeedbackData): Promise<void> {
        try {
            const { error } = await supabase
                .from('app_feedback')
                .insert([
                    {
                        user_id: feedbackData.user_id,
                        bar_id: feedbackData.bar_id,
                        type: feedbackData.type,
                        message: feedbackData.message,
                        email: feedbackData.email,
                    },
                ]);

            if (error) {
                throw error;
            }
        } catch (error: any) {
            // Si la table n'existe pas encore (migration pas passée), on log juste
            console.error('Erreur feedback:', error);
            throw new Error(handleSupabaseError(error));
        }
    }
}