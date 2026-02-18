import { test, expect } from '@playwright/test';

test.describe('Offline First - Sales Sync Flow', () => {
    // Augmenter le timeout pour ce test critique
    test.setTimeout(120000);

    test.beforeEach(async ({ page }) => {
        // Log console events from page
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('[BarContext]') || text.includes('Error')) {
                console.log(`PAGE LOG: [${msg.type()}] ${text}`);
            }
        });

        console.log('--- Démarrage du flux de login ---');
        await page.goto('http://localhost:5173/auth/login');

        // Screenshot initial
        await page.screenshot({ path: 'test-results/login-1-initial.png' });

        // Fermer le toast de mise à jour s'il existe
        try {
            const updateCloseBtn = page.locator('button:has-text("Plus tard"), button:has-text("X")');
            if (await updateCloseBtn.isVisible()) {
                await updateCloseBtn.click();
                console.log('Toast de mise à jour fermé');
            }
        } catch (e) { }

        const emailInput = page.getByPlaceholder(/Email ou nom d'utilisateur/i);
        await expect(emailInput).toBeVisible({ timeout: 15000 });

        // Saisie Email (Utilisation des identifiants fournis par l'utilisateur)
        await emailInput.fill('gerant1@bartender.app');
        await page.screenshot({ path: 'test-results/login-2-email-filled.png' });

        // Saisie Password
        await page.getByPlaceholder(/••••••••/i).fill('gerant1');
        await page.screenshot({ path: 'test-results/login-3-password-filled.png' });

        // Clic Login
        await page.getByRole('button', { name: /se connecter/i }).click();
        console.log('Bouton se connecter cliqué');

        // Attendre la redirection (ne plus être sur /auth/login)
        await page.waitForURL(url => !url.href.includes('/auth/login'), { timeout: 20000 });
        console.log('Redirection détectée vers:', page.url());
        await page.screenshot({ path: 'test-results/login-4-after-redirect.png' });

        // Attendre la fin du "Chargement..." (stabilisation network)
        try {
            await page.waitForLoadState('networkidle', { timeout: 10000 });
        } catch (e) {
            console.log('Note: networkidle timeout reached, proceeding anyway');
        }
        await page.screenshot({ path: 'test-results/login-5-stabilized.png' });

        // Attendre que le bar soit sélectionné (soit auto, soit manuel)
        const welcomeText = page.getByText(/Sélectionnez un bar/i);

        // Si on voit l'écran de bienvenue après 10s, on essaie de forcer la sélection
        if (await welcomeText.isVisible({ timeout: 10000 }).catch(() => false)) {
            console.log('--- Écran de bienvenue détecté, tentative de sélection forcée ---');
            await page.screenshot({ path: 'test-results/login-welcomescreen.png' });

            // 1. Tenter de cliquer sur le BarSelector (plusieurs sélecteurs possibles)
            const selectors = [
                page.getByLabel(/Sélectionner un bar|Nom du bar/i),
                page.locator('button:has(img[alt="Bar"])'),
                page.locator('button:has-text("Sélectionner")')
            ];

            for (const sel of selectors) {
                if (await sel.isVisible().catch(() => false)) {
                    await sel.click();
                    console.log('BarSelector ouvert via:', await sel.toString());
                    break;
                }
            }

            // 2. Cliquer sur le premier bar qui ressemble à un bar
            const firstBar = page.locator('button').filter({ hasText: /PRESTIGE|BAR|Zimkada/i }).first();
            if (await firstBar.isVisible({ timeout: 5000 }).catch(() => false)) {
                await firstBar.click();
                console.log('Bar cliqué dans la liste');
            } else {
                console.log('Aucun bar trouvé dans la liste, on attend l\'auto-sélection...');
            }
        }

        // Vérifier l'arrivée sur l'interface de vente (H2 "Vente")
        await expect(page.locator('h2:has-text("Vente")')).toBeVisible({ timeout: 40000 });
        await page.screenshot({ path: 'test-results/login-6-final-check.png' });
        console.log('--- Login réussi et interface de vente atteinte ---');
    });

    test('should create sale offline and sync when online', async ({ page }) => {
        // 1. Attendre le chargement initial des produits
        console.log('Attente du chargement de l\'interface de vente...');
        await expect(page.locator('h3').first()).toBeVisible({ timeout: 30000 });
        console.log('Interface de vente prête');

        // 2. Passer Offline via CDP
        const client = await page.context().newCDPSession(page);
        await client.send('Network.emulateNetworkConditions', {
            offline: true,
            latency: 0,
            downloadThroughput: 0,
            uploadThroughput: 0,
        });
        console.log('--- MODE OFFLINE ACTIVÉ ---');

        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/debug-1-offline-state.png' });

        // 3. Créer une vente (Panier)
        // Fermer le toast de mise à jour s'il gène
        try {
            const plusTardBtn = page.getByRole('button', { name: /plus tard/i });
            if (await plusTardBtn.isVisible()) {
                await plusTardBtn.click();
                console.log('Toast "Mise à jour" fermé');
            }
        } catch (e) { }

        // Cliquer sur le bouton + d'un produit (on cible le bouton ambre spécifique au produit)
        const productBtns = page.locator('div.group button').filter({ has: page.locator('.lucide-plus') });
        const count = await productBtns.count();
        console.log(`Nombre de produits trouvés: ${count}`);

        if (count > 0) {
            await productBtns.first().click();
            console.log('Produit ajouté au panier via bouton +');
        } else {
            console.log('Aucun bouton + de produit trouvé, tentative via texte Beaufort');
            await page.getByText(/Beaufort|Guinness|Pils/i).first().click({ force: true });
        }

        // Attendre que le badge apparaisse sur le panier (indique l'ajout dans Zustand)
        const cartBadge = page.locator('button[aria-label="Panier"] span');
        try {
            await expect(cartBadge).toBeVisible({ timeout: 10000 });
            console.log('Badge panier détecté');
        } catch (e) {
            console.log('Note: Badge panier non détecté, tentative d\'ouverture forcée');
        }

        await page.screenshot({ path: 'test-results/test-1-clicked.png' });

        // Ouvrir le panier
        console.log('Fermeture forcée des toasts via CSS et ouverture du panier...');
        await page.addStyleTag({ content: '[role="status"], .toast, .hot-toast { display: none !important; }' });

        const cartBtn = page.locator('button[aria-label="Panier"]').first();
        await cartBtn.dispatchEvent('click');
        console.log('Bouton Panier cliqué (dispatchEvent)');

        // Attendre que le drawer soit visible (on cherche le titre ou le bouton de checkout)
        const checkoutBtn = page.getByRole('button', { name: /lancer la vente/i });
        await expect(checkoutBtn).toBeVisible({ timeout: 15000 });
        console.log('Panier (Drawer) ouvert');
        await page.waitForTimeout(1000); // Laisser l'animation finir
        await page.screenshot({ path: 'test-results/test-2-cart-open.png' });

        // Si mode simplifié, on doit sélectionner un serveur
        const serverTrigger = page.getByRole('button', { name: /serveur/i });
        if (await serverTrigger.isVisible({ timeout: 5000 }).catch(() => false)) {
            await serverTrigger.click();
            console.log('Menu serveur ouvert');

            // Cliquer sur le premier bouton de serveur dans l'overlay
            // Ces boutons ont souvent un avatar (initiales)
            const serverBtn = page.locator('div.grid button:has(div[class*="bg-"])').first();
            if (await serverBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                await serverBtn.click();
                console.log('Serveur sélectionné');
                await page.waitForTimeout(500);
            }
        }

        // Cliquer sur "Lancer la vente"
        console.log('Tentative de clic sur "Lancer la vente"...');
        await checkoutBtn.dispatchEvent('click');
        console.log('Action "Lancer la vente" effectuée via dispatchEvent');

        // Vérifier la notification de succès
        await expect(page.getByText(/Vente validée/i)).toBeVisible({ timeout: 15000 });
        console.log('Vente validée localement (Offline)');
        await page.screenshot({ path: 'test-results/test-3-sale-validated-offline.png' });

        // 4. Go Online & Intercept Sync
        console.log('Attente de la synchronisation...');
        const syncRequestPromise = page.waitForRequest(request => {
            const url = request.url();
            const method = request.method();
            // On cherche n'importe quelle requête POST vers sales ou rpc (create_sale)
            return (url.includes('/rest/v1/sales') || url.includes('/rpc/create_sale')) && method === 'POST';
        }, { timeout: 60000 });

        // Retour en ligne via CDP
        await client.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: 0,
            downloadThroughput: -1,
            uploadThroughput: -1,
        });
        console.log('--- MODE ONLINE RESTAURÉ ---');

        // Attendre la requête de synchronisation
        const syncRequest = await syncRequestPromise;
        console.log('Sync détectée vers Supabase !');
        expect(syncRequest).toBeTruthy();

        await page.screenshot({ path: 'test-results/test-4-sync-detected.png' });

        // Vérification finale du badge
        await expect(page.locator('.bg-emerald-500, .bg-green-500').filter({ hasText: /Synchronisé/i })).toBeVisible({ timeout: 20000 });
        console.log('Test E2E Offline-First : SUCCÈS COMPLET');
    });
});
