/**
 * Version de l'application, lue depuis /version.json (généré au build par
 * scripts/generate-version.cjs). Mise en cache au niveau module : un seul fetch
 * par session, quel que soit le nombre d'appelants (heartbeat, etc.).
 *
 * Ne dépend pas de VersionCheckService (dont getCurrentVersion est privé et
 * dont le cache n'est peuplé qu'après initialize()). Retourne 'unknown' si le
 * fichier est indisponible — jamais d'exception.
 */
let cachedVersion: string | null = null;
let inflight: Promise<string> | null = null;

export function getAppVersion(): Promise<string> {
    if (cachedVersion !== null) return Promise.resolve(cachedVersion);
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const response = await fetch('/version.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            cachedVersion = (data?.version as string) || 'unknown';
            return cachedVersion;
        } catch {
            // Échec (ex: démarrage offline) → ne PAS mettre en cache : le
            // prochain appelant retentera, la version sera corrigée en session.
            return 'unknown';
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}
