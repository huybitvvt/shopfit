import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name || 'ShopFit',
  slug: config.slug || 'shopfit',
  plugins: [
    ...(config.plugins || []).filter(plugin => plugin !== 'expo-build-properties'),
    ['expo-build-properties', { android: { usesCleartextTraffic: process.env.SHOPFIT_PREVIEW === '1' } }],
    // Google's sample app IDs: this coursework integration only requests test ads.
    ['react-native-google-mobile-ads', {
      androidAppId: 'ca-app-pub-3940256099942544~3347511713',
      iosAppId: 'ca-app-pub-3940256099942544~1458002511',
      delayAppMeasurementInit: true,
    }],
    './plugins/with-build-limits',
  ],
});
