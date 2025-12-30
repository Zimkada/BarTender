import { createClient } from '@supabase/supabase-js';

/*
 * Vercel Cron - Fallback for Supabase Free
 * 
 * This API route is called by Vercel Cron to refresh
 * materialized views when pg_cron is not available (Supabase Free).
 * 
 * Configuration in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/refresh-views",
 *     "schedule": "0 *\/2 * * *"
 *   }]
 * }
 * 
 * Security: CRON_SECRET verification required
 */

export default async function handler(req: Request) {
    // Verify that it's Vercel Cron calling
    const authHeader = req.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

    if (authHeader !== expectedAuth) {
        return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Create Supabase client with service role key
    const supabase = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const results: Array<{ view: string; status: string; error?: string }> = [];

    try {
        // List of views to refresh
        const views = [
            'bars_with_stats',
            'product_sales_stats',
            'daily_sales_summary',
            'top_products_by_period',
            'bar_stats_multi_period'
        ];

        // Refresh each view
        for (const viewName of views) {
            try {
                const { data, error } = await supabase.rpc(
                    'refresh_materialized_view_with_logging',
                    {
                        p_view_name: viewName,
                        p_triggered_by: 'vercel_cron'
                    }
                );

                if (error) {
                    results.push({ view: viewName, status: 'failed', error: error.message });
                } else {
                    results.push({ view: viewName, status: 'success' });
                }
            } catch (err) {
                results.push({
                    view: viewName,
                    status: 'failed',
                    error: err instanceof Error ? err.message : 'Unknown error'
                });
            }
        }

        // Cleanup bar_activity
        try {
            await supabase.rpc('cleanup_bar_activity');
            results.push({ view: 'bar_activity_cleanup', status: 'success' });
        } catch (err) {
            results.push({
                view: 'bar_activity_cleanup',
                status: 'failed',
                error: err instanceof Error ? err.message : 'Unknown error'
            });
        }

        // Cleanup old logs (once per day only)
        const hour = new Date().getHours();
        if (hour === 6) { // 6 AM
            try {
                await supabase.rpc('cleanup_old_refresh_logs');
                results.push({ view: 'cleanup_logs', status: 'success' });
            } catch (err) {
                results.push({
                    view: 'cleanup_logs',
                    status: 'failed',
                    error: err instanceof Error ? err.message : 'Unknown error'
                });
            }
        }

        const successCount = results.filter(r => r.status === 'success').length;
        const failedCount = results.filter(r => r.status === 'failed').length;

        return new Response(
            JSON.stringify({
                success: true,
                timestamp: new Date().toISOString(),
                summary: {
                    total: results.length,
                    success: successCount,
                    failed: failedCount
                },
                results
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                results
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

export const config = {
    runtime: 'edge',
};
