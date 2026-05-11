import type {LogtoConfig} from '@logto/react';
import {LogtoProvider, UserScope} from '@logto/react';
import {useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {Links, Meta, Scripts, ScrollRestoration} from 'react-router';
import {ColorModeProvider} from '../contexts/ColorModeContext';
import {API_CONFIG} from '../core/config/api';
import {AUTH_CONFIG} from '../core/config/auth';
import {AuthProvider} from '../core/contexts/auth/AuthProvider';
import {LocationChangeGuardProvider} from '../core/contexts/location/LocationChangeGuardContext';
import {LocationProvider} from '../core/contexts/location/LocationProvider';
import {QueryProvider} from '../core/queries/QueryProvider';
import {ThemedApp} from './ThemedApp';

const logtoConfig: LogtoConfig = {
  endpoint: AUTH_CONFIG.endpoint,
  appId: AUTH_CONFIG.appId,
  resources: [API_CONFIG.resourceIdentifier],
  scopes: [UserScope.Organizations, UserScope.OrganizationRoles],
};

export function RootShell({children}: {children: React.ReactNode}) {
  const {t, i18n} = useTranslation();

  useEffect(() => {
    document.title = t('appName');
  }, [t]);

  const baseLanguage = i18n.language?.split('-')[0] || 'en';

  return (
    <html lang={baseLanguage}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <ColorModeProvider>
          <ThemedApp>
            <LogtoProvider config={logtoConfig}>
              <QueryProvider>
                <AuthProvider>
                  <LocationProvider>
                    <LocationChangeGuardProvider>
                      {children}
                      <ScrollRestoration />
                      <Scripts />
                    </LocationChangeGuardProvider>
                  </LocationProvider>
                </AuthProvider>
              </QueryProvider>
            </LogtoProvider>
          </ThemedApp>
        </ColorModeProvider>
      </body>
    </html>
  );
}
