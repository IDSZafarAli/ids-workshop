import type {LinksFunction, MetaFunction} from 'react-router';
import {Outlet} from 'react-router';
import {API_CONFIG} from './core/config/api';
import {AUTH_CONFIG} from './core/config/auth';
import './i18n';

export {AppLoading as HydrateFallback} from './components/AppLoading';
export {RootErrorBoundary as ErrorBoundary} from './components/RootErrorBoundary';
export {RootShell as Layout} from './components/RootShell';

const doctorOrigin =
  import.meta.env.VITE_ENABLE_IDS_DOCTOR === 'true' && import.meta.env.VITE_DOCTOR_URL
    ? new URL(import.meta.env.VITE_DOCTOR_URL).origin
    : '';

export const meta: MetaFunction = () => [
  {
    title: 'IDS AI Skeleton',
  },
  {
    httpEquiv: 'Content-Security-Policy',
    content: `default-src 'self'; script-src 'self' 'unsafe-inline' ${doctorOrigin}; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https: http://localhost:*; connect-src 'self' ${AUTH_CONFIG.endpoint} ${new URL(API_CONFIG.baseUrl).origin} ${doctorOrigin}`,
  },
];

export const links: LinksFunction = () => [
  {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
  },
];

export default function App() {
  return <Outlet />;
}
