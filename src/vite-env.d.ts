/// <reference types="vite/client" />

// Recharts deep imports — utilisés pour réduire la taille du bundle
// (l'import root entraîne un grand chunk via Rollup tree-shaking imparfait).
// Recharts n'expose pas de types pour ces chemins profonds → on les réexporte.
declare module 'recharts/es6/cartesian/Bar' {
  export { Bar } from 'recharts';
}

// vite-plugin-pwa virtual module — types fournis par le plugin uniquement
// au runtime via /// <reference types="vite-plugin-pwa/react" /> (optionnel).
declare module 'virtual:pwa-register/react' {
  import type { Dispatch, SetStateAction } from 'react';
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }
  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
    offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}

// react-window — types optionnels (devDep) ; on déclare pour ne pas casser le build
declare module 'react-window';
