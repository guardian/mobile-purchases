import { Platform } from '../models/platform';

export type SoftOptInEventProductName = 'InAppPurchase' | 'FeastInAppPurchase';

export const mapPlatformToSoftOptInProductName = (
  platform: string | undefined,
): SoftOptInEventProductName => {
  switch (platform) {
    case Platform.IosFeast:
    case Platform.AndroidFeast:
      return 'FeastInAppPurchase';
    default:
      return 'InAppPurchase';
  }
};
