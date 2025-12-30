// =====================================================
// EDGE FUNCTION: send-refresh-alerts
// =====================================================
// Description: Envoie des emails d'alerte pour les échecs de refresh
// Trigger: Appelé par pg_cron toutes les 15 minutes
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Configuration email (via secrets Supabase)
const SMTP_CONFIG = {
  host: Deno.env.get('SMTP_HOST') || 'smtp.gmail.com',
  port: parseInt(Deno.env.get('SMTP_PORT') || '587'),
  username: Deno.env.get('SMTP_USERNAME') || '',
  password: Deno.env.get('SMTP_PASSWORD') || '',
  from: Deno.env.get('SMTP_FROM') || 'noreply@bartender.app',
};

const ALERT_CONFIG = {
  adminEmail: Deno.env.get('ADMIN_EMAIL') || 'admin@bartender.app',
  thresholdFailures: parseInt(Deno.env.get('ALERT_THRESHOLD') || '3'),
};

interface RefreshAlert {
  id: string;
  view_name: string;
  consecutive_failures: number;
  first_failure_at: string;
  last_failure_at: string;
  error_messages: string[];
  incident_duration_seconds: number;
}

// Fonction pour envoyer un email via SMTP
async function sendEmailAlert(alert: RefreshAlert): Promise<boolean> {
  try {
    // Construction du message HTML
    const emailBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #ef4444; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .alert-box { background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 15px 0; }
          .stats { display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0; }
          .stat-card { background: white; padding: 12px; border-radius: 6px; flex: 1; min-width: 150px; }
          .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
          .stat-value { font-size: 24px; font-weight: bold; color: #ef4444; }
          .footer { background-color: #1f2937; color: white; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }
          .error-list { background: white; padding: 15px; border-radius: 6px; margin: 10px 0; }
          .error-item { padding: 8px; border-left: 3px solid #f59e0b; margin: 5px 0; background: #fffbeb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">⚠️ Alerte Refresh Matérialisée</h1>
            <p style="margin: 5px 0 0 0;">Échecs Consécutifs Détectés</p>
          </div>

          <div class="content">
            <div class="alert-box">
              <h2 style="margin-top: 0; color: #dc2626;">
                Vue Matérialisée: <strong>${alert.view_name}</strong>
              </h2>
              <p style="margin: 5px 0;">
                <strong>${alert.consecutive_failures}</strong> échecs consécutifs détectés
              </p>
            </div>

            <div class="stats">
              <div class="stat-card">
                <div class="stat-label">Échecs Consécutifs</div>
                <div class="stat-value">${alert.consecutive_failures}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Durée Incident</div>
                <div class="stat-value">${Math.round(alert.incident_duration_seconds / 60)}m</div>
              </div>
            </div>

            <div style="margin: 20px 0;">
              <p><strong>Premier échec:</strong> ${new Date(alert.first_failure_at).toLocaleString('fr-FR')}</p>
              <p><strong>Dernier échec:</strong> ${new Date(alert.last_failure_at).toLocaleString('fr-FR')}</p>
            </div>

            ${alert.error_messages.length > 0 ? `
              <div class="error-list">
                <h3 style="margin-top: 0;">Messages d'Erreur (${alert.error_messages.length} derniers)</h3>
                ${alert.error_messages.slice(-5).map(err =>
                  `<div class="error-item">${err}</div>`
                ).join('')}
              </div>
            ` : ''}

            <div style="margin-top: 20px; padding: 15px; background: #dbeafe; border-radius: 6px;">
              <h3 style="margin-top: 0; color: #1e40af;">Actions Recommandées</h3>
              <ul style="margin: 0; padding-left: 20px;">
                <li>Vérifier les logs détaillés dans le Security Dashboard</li>
                <li>Examiner les performances de la base de données</li>
                <li>Vérifier la connectivité Supabase</li>
                <li>Valider les indexes et requêtes de la vue matérialisée</li>
              </ul>
            </div>
          </div>

          <div class="footer">
            <p style="margin: 5px 0;">
              🛡️ BarTender Security Monitoring System
            </p>
            <p style="margin: 5px 0; color: #9ca3af;">
              Cet email a été généré automatiquement par le système de monitoring
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Utiliser Deno's built-in fetch pour envoyer via API SMTP
    // Alternative: utiliser un service comme SendGrid, Resend, ou AWS SES

    // Pour l'exemple, on utilise l'API Resend (plus simple que SMTP direct)
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (!RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY non configuré, email non envoyé');
      return false;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: SMTP_CONFIG.from,
        to: [ALERT_CONFIG.adminEmail],
        subject: `⚠️ Alerte: ${alert.consecutive_failures} échecs consécutifs - ${alert.view_name}`,
        html: emailBody,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erreur envoi email:', error);
      return false;
    }

    const result = await response.json();
    console.log('✅ Email envoyé:', result);
    return true;

  } catch (error) {
    console.error('❌ Erreur sendEmailAlert:', error);
    return false;
  }
}

// Handler principal
serve(async (req: Request) => {
  try {
    // Vérification de la méthode
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Méthode non autorisée. Utiliser POST.' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Vérification du token d'authentification (sécurité)
    const authHeader = req.headers.get('Authorization');
    const FUNCTION_SECRET = Deno.env.get('FUNCTION_SECRET');

    if (FUNCTION_SECRET && authHeader !== `Bearer ${FUNCTION_SECRET}`) {
      return new Response(
        JSON.stringify({ error: 'Non autorisé' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Connexion à Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔍 Recherche des alertes actives...');

    // Récupérer les alertes actives depuis la vue
    const { data: alerts, error: alertsError } = await supabase
      .from('active_refresh_alerts')
      .select('*')
      .gte('consecutive_failures', ALERT_CONFIG.thresholdFailures)
      .is('alert_sent_at', null) // Alertes pas encore envoyées
      .order('consecutive_failures', { ascending: false });

    if (alertsError) {
      console.error('❌ Erreur récupération alertes:', alertsError);
      return new Response(
        JSON.stringify({ error: 'Erreur récupération alertes', details: alertsError }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 ${alerts?.length || 0} alertes trouvées`);

    if (!alerts || alerts.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Aucune alerte à envoyer',
          alertsCount: 0
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Envoyer les emails et mettre à jour alert_sent_at
    const results = [];
    for (const alert of alerts) {
      console.log(`📧 Envoi email pour: ${alert.view_name}`);

      const emailSent = await sendEmailAlert(alert);

      if (emailSent) {
        // Mettre à jour alert_sent_at dans refresh_failure_alerts
        const { error: updateError } = await supabase
          .from('refresh_failure_alerts')
          .update({ alert_sent_at: new Date().toISOString() })
          .eq('id', alert.id);

        if (updateError) {
          console.error(`❌ Erreur MAJ alert_sent_at pour ${alert.id}:`, updateError);
        } else {
          console.log(`✅ alert_sent_at mis à jour pour ${alert.view_name}`);
        }
      }

      results.push({
        view_name: alert.view_name,
        consecutive_failures: alert.consecutive_failures,
        email_sent: emailSent,
      });
    }

    const successCount = results.filter(r => r.email_sent).length;
    console.log(`✅ ${successCount}/${alerts.length} emails envoyés avec succès`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${successCount}/${alerts.length} alertes envoyées`,
        alertsCount: alerts.length,
        successCount,
        results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erreur Edge Function:', error);
    return new Response(
      JSON.stringify({
        error: 'Erreur interne',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
