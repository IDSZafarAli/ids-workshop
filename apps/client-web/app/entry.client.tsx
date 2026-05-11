/**
 * By default, React Router will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx react-router reveal` ✨
 * For more information, see https://reactrouter.com/explanation/special-files#entryclienttsx
 */

import {StrictMode, startTransition} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {HydratedRouter} from 'react-router/dom';
import {createRouterContext} from './core/middleware/routerContext';
import i18n from './i18n';

// Prevent tree-shaking of i18n initialization
if (!i18n.isInitialized && !i18n.isInitializing) {
  console.warn('i18n not initialized for client hydration');
}

function injectDoctorScript(): void {
  const doctorUrl = import.meta.env.VITE_DOCTOR_URL as string | undefined;
  if (import.meta.env.VITE_ENABLE_IDS_DOCTOR !== 'true' || !doctorUrl) {
    return;
  }
  if (document.querySelector('script[data-ids-doctor]')) {
    return;
  }
  (window as Window & {__DOCTOR_URL__?: string}).__DOCTOR_URL__ = doctorUrl;
  const s = document.createElement('script');
  s.dataset['idsDoctor'] = 'true';
  s.src = `${doctorUrl}/doctor.js`;
  s.async = true;
  document.head.appendChild(s);
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter getContext={createRouterContext} />
    </StrictMode>,
  );
  window.setTimeout(injectDoctorScript, 0);
});
