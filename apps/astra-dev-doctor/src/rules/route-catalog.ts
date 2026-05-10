type RouteEntry = {
  backend: string[];
  frontend: string[];
};

const catalog: Record<string, RouteEntry> = {
  '/api/parts': {
    backend: [
      'apps/astra-apis/src/part/part.controller.ts',
      'apps/astra-apis/src/part/part.service.ts',
    ],
    frontend: [
      'apps/client-web/app/pages/parts/PartList.tsx',
      'apps/client-web/app/pages/parts/PartDetail.tsx',
    ],
  },
  '/api/locations': {
    backend: [
      'apps/astra-apis/src/location/location.controller.ts',
      'apps/astra-apis/src/location/location.service.ts',
    ],
    frontend: [
      'apps/client-web/app/pages/locations/LocationList.tsx',
      'apps/client-web/app/pages/locations/LocationDetail.tsx',
    ],
  },
  '/api/user/context': {
    backend: [
      'apps/astra-apis/src/user/user.controller.ts',
      'apps/astra-apis/src/user/user.service.ts',
    ],
    frontend: [
      'apps/client-web/app/core/contexts/auth/AuthProvider.tsx',
      'apps/client-web/app/core/contexts/location/LocationProvider.tsx',
    ],
  },
  '/api/SystemHealth/ping': {
    backend: ['apps/astra-apis/src/ping/systemhealth.controller.ts'],
    frontend: ['apps/client-web/app/core/services/networkMonitor.ts'],
  },
};

// Match a URL against the catalog, longest-prefix wins
export function lookupRoute(url: string): RouteEntry {
  const cleaned = url.split('?')[0];
  let best = '';
  for (const key of Object.keys(catalog)) {
    if (cleaned.startsWith(key) && key.length > best.length) {
      best = key;
    }
  }
  return catalog[best] ?? {backend: [], frontend: []};
}
