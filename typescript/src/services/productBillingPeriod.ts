// product billing period is expressed using the ISO duration format
// see https://en.wikipedia.org/wiki/ISO_8601#Durations
export const PRODUCT_BILLING_PERIOD: Record<string, string> = {
    // com.guardian.subscription*
    'com.guardian.subscription.6monthly.12': 'P6M',
    'com.guardian.subscription.6monthly.13.freetrial': 'P6M',
    'com.guardian.subscription.monthly.10': 'P1M',
    'com.guardian.subscription.monthly.10.freetrial': 'P1M',
    'com.guardian.subscription.monthly.11.freetrial': 'P1M',
    'com.guardian.subscription.annual.13': 'P1Y',
    'com.guardian.subscription.annual.13.freetrial': 'P1Y',
    'com.guardian.subscription.annual.14.freetrial': 'P1Y',

    // uk.co.guardian.gia*
    'uk.co.guardian.gia.1month': 'P1M',
    'uk.co.guardian.gia.6months': 'P6M',

    // uk.co.guardian.gla*
    'uk.co.guardian.gla.1month.2023Mar.metered': 'P1M',
    'uk.co.guardian.gla.1month': 'P1M',
    'uk.co.guardian.gla.1month.2017Q2.variantA': 'P1M',
    'uk.co.guardian.gla.1month.2017Q2.variantB': 'P1M',
    'uk.co.guardian.gla.1month.2018April.withFreeTrial': 'P1M',
    'uk.co.guardian.gla.1month.2018May.meteredoffer': 'P1M',
    'uk.co.guardian.gla.1month.2018May.withFreeTrial': 'P1M',
    'uk.co.guardian.gla.1month.2018May.stepUp': 'P1M',
    'uk.co.guardian.gla.6months': 'P6M',
    'uk.co.guardian.gla.6months.2018May.withFreeTrial': 'P6M',
    'uk.co.guardian.gla.12months.2018Dec.withFreeTrial': 'P1Y',
    'uk.co.guardian.gla.12months.2018Dec.stepUp': 'P1Y',
    'uk.co.guardian.gla.12months.2023Mar.metered': 'P1Y',

    // uk.co.guardian.subscription*
    'uk.co.guardian.subscription': 'P1M',
    'uk.co.guardian.subscription.2': 'P1M',
    'uk.co.guardian.subscription.3': 'P1M',
    'uk.co.guardian.subscription.4': 'P1M',
    'uk.co.guardian.subscription.5': 'P1M',
    'uk.co.guardian.subscription.6': 'P1M',
    'uk.co.guardian.subscription.7': 'P1M',
    'uk.co.guardian.subscription.8': 'P1M',
    'uk.co.guardian.subscription.9': 'P6M',

    // uk.co.guardain* ; "guardain" is an unfortunate typo that exists upstream and must be mirrored here
    'uk.co.guardain.Feast.yearly.discounted': 'P1Y',

    // uk.co.guardian.Feast*
    'uk.co.guardian.Feast.yearly': 'P1Y',
    'uk.co.guardian.Feast.monthly': 'P1M',
    'uk.co.guardian.Feast.monthly.discounted': 'P1M',

    // guardian.subscription*
    'guardian.subscription.month.meteredoffer': 'P1M',
    'guardian.subscription.annual.meteroffer': 'P1Y',
    'guardian.subscription.annual.meter.offer': 'P1Y',

    // guardian.annual.*
    'guardian.annual.114.99': 'P1Y',

    // guardian.month.*
    'guardian.month.meteroffer': 'P1M',
    'guardian.month.11.99': 'P1M',
    'guardian.month.promo.11.99': 'P1M',
};
