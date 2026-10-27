import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name || 'ShopFit',
  slug: config.slug || 'shopfit',
  plugins: [
    ...(config.plugins || []).filter(plugin => plugin !== 'expo-build-properties'),
    ['expo-build-properties', { android: { usesCleartextTraffic: process.env.SHOPFIT_PREVIEW === '1' } }],
    './plugins/with-build-limits',
  ],
});
