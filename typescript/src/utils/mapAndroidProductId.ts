import { Platform } from "../models/platform";
import { fromGooglePackageName } from "../services/appToPlatform";

export const mapAndroidProductId = (productId: string, packageName: string, isTestPurchase: boolean): string => {
    if (isTestPurchase && fromGooglePackageName(packageName) === Platform.AndroidFeast) {
        return "dev_testing_feast";
    }

    return productId;
}
