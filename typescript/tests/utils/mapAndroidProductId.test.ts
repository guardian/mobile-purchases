import { mapAndroidProductId } from '../../src/utils/mapAndroidProductId';

describe('mapAndroidProductId', () => {
  it('returns the product_id if not Feast Android', () => {
    const productId = 'test-product-id';
    const googlePackageName = 'com.guardian';
    const testPurchase = true;

    const determinedProductId = mapAndroidProductId(
      productId,
      googlePackageName,
      testPurchase
    );

    expect(determinedProductId).toEqual(productId);
  });

  it('returns the product_id if Feast Android and not a test', () => {
    const productId = 'test-product-id';
    const googlePackageName = 'uk.co.guardian.feast';
    const testPurchase = false;

    const determinedProductId = mapAndroidProductId(
      productId,
      googlePackageName,
      testPurchase
    );

    expect(determinedProductId).toEqual(productId);
  });

  it('returns dev_testing_feast for a Feast Android test purchase', () => {
    const productId = 'test-product-id';
    const googlePackageName = 'uk.co.guardian.feast';
    const testPurchase = true;

    const determinedProductId = mapAndroidProductId(
      productId,
      googlePackageName,
      testPurchase
    );

    expect(determinedProductId).toEqual('dev_testing_feast');
  });
});
