
// product billing period is expressed using the ISO duration format
// see https://en.wikipedia.org/wiki/ISO_8601#Durations
export const PRODUCT_BILLING_PERIOD: {[productId: string]: string} = {
    "com.guardian.subscription.6monthly.12": "P6M",
    "com.guardian.subscription.annual.13": "P1Y",
    "com.guardian.subscription.monthly.10": "P1M",
    "uk.co.guardian.gia.1month": "P1M",
    "uk.co.guardian.gia.6months": "P6M",
    "uk.co.guardian.gla.12months.2018Dec.withFreeTrial": "P1Y",
    "uk.co.guardian.gla.1month": "P1M",
    "uk.co.guardian.gla.1month.2017Q2.variantA": "P1M",
    "uk.co.guardian.gla.1month.2017Q2.variantB": "P1M",
    "uk.co.guardian.gla.1month.2018April.withFreeTrial": "P1M",
    "uk.co.guardian.gla.1month.2018May.withFreeTrial": "P1M",
    "uk.co.guardian.gla.6months": "P6M",
    "uk.co.guardian.gla.6months.2018May.withFreeTrial": "P6M",
    "uk.co.guardian.subscription": "P1M",
    "uk.co.guardian.subscription.2": "P1M",
    "uk.co.guardian.subscription.3": "P1M",
    "uk.co.guardian.subscription.4": "P1M",
    "uk.co.guardian.subscription.5": "P1M",
    "uk.co.guardian.subscription.6": "P1M",
    "uk.co.guardian.subscription.7": "P1M",
    "uk.co.guardian.subscription.8": "P1M",
    "uk.co.guardian.subscription.9": "P6M",
    "uk.co.guardian.Feast.yearly": "P1Y",
    // "guardain" is an unfortunate typo that exists upstream and must be mirrored here
    "uk.co.guardain.Feast.yearly.discounted": "P1Y",
    "uk.co.guardian.Feast.monthly": "P1M",
    "uk.co.guardian.Feast.monthly.discounted": "P1M",
};