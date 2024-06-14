import { Platform } from "../models/platform";
import { fromGooglePackageName } from "../services/appToPlatform";

// Map the product_id for test Feast purchases so that they can be easily
// identified downstream. For other (non-Feast) Android test purchases the
// product_id is already distinct and there are mechanisms for filtering out in
// the lake.
export const mapAndroidProductId = (productId: string, packageName: string, isTestPurchase: boolean): string => {
    if (isTestPurchase && fromGooglePackageName(packageName) === Platform.AndroidFeast) {
        return "dev_testing_feast";
    }

    return productId;
}
