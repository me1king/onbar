import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Online Bar | Early Access',
    short_name: 'Online Bar',
    description: 'Early-access waitlist, referral rewards, quick countdown widget and launch updates.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F9F4EC',
    theme_color: '#D91C1C',
    orientation: 'portrait',
    scope: '/',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
