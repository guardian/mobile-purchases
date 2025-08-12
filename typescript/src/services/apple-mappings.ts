const storefrontToCountryMap = {
    GBR: 'GB', // United Kingdom
    USA: 'US', // United States
    CAN: 'CA', // Canada
    AUS: 'AU', // Australia
    DEU: 'DE', // Germany
    FRA: 'FR', // France
    ITA: 'IT', // Italy
    ESP: 'ES', // Spain
    NLD: 'NL', // Netherlands
    BRA: 'BR', // Brazil
    IND: 'IN', // India
    JPN: 'JP', // Japan
    KOR: 'KR', // South Korea
    CHN: 'CN', // China
    RUS: 'RU', // Russia
    MEX: 'MX', // Mexico
    ZAF: 'ZA', // South Africa
    ARG: 'AR', // Argentina
    CHE: 'CH', // Switzerland
    TUR: 'TR', // Turkey
    POL: 'PL', // Poland
    SWE: 'SE', // Sweden
    NOR: 'NO', // Norway
    DNK: 'DK', // Denmark
    FIN: 'FI', // Finland
    IRL: 'IE', // Ireland
    AUT: 'AT', // Austria
    BEL: 'BE', // Belgium
    PRT: 'PT', // Portugal
    HUN: 'HU', // Hungary
    CZE: 'CZ', // Czech Republic
    SVK: 'SK', // Slovakia
    GRC: 'GR', // Greece
    ROU: 'RO', // Romania
    BGR: 'BG', // Bulgaria
    HRV: 'HR', // Croatia
    EST: 'EE', // Estonia
    LVA: 'LV', // Latvia
    LTU: 'LT', // Lithuania
    SVN: 'SI', // Slovenia
    LUX: 'LU', // Luxembourg
    CYP: 'CY', // Cyprus
    MLT: 'MT', // Malta
    SAU: 'SA', // Saudi Arabia
    ARE: 'AE', // United Arab Emirates
    IDN: 'ID', // Indonesia
    THA: 'TH', // Thailand
    VNM: 'VN', // Vietnam
    PHL: 'PH', // Philippines
    SGP: 'SG', // Singapore
    MYS: 'MY', // Malaysia
    NZL: 'NZ', // New Zealand
    ISR: 'IL', // Israel
    EGY: 'EG', // Egypt
    CHL: 'CL', // Chile
    COL: 'CO', // Colombia
    PER: 'PE', // Peru
    VEN: 'VE', // Venezuela
    KWT: 'KW', // Kuwait
    QAT: 'QA', // Qatar
    OMN: 'OM', // Oman
    MAR: 'MA', // Morocco
    TUN: 'TN', // Tunisia
    JAM: 'JM', // Jamaica
    PAN: 'PA', // Panama
    URY: 'UY', // Uruguay
    ECU: 'EC', // Ecuador
    KEN: 'KE', // Kenya
    NGA: 'NG', // Nigeria
    GHA: 'GH', // Ghana
    UGA: 'UG', // Uganda
    TZA: 'TZ', // Tanzania
    ETH: 'ET', // Ethiopia
    SRB: 'RS', // Serbia
    ALB: 'AL', // Albania
    AND: 'AD', // Andorra
    BLR: 'BY', // Belarus
    BIH: 'BA', // Bosnia and Herzegovina
    ISL: 'IS', // Iceland
    XKX: 'XK', // Kosovo
    LIE: 'LI', // Liechtenstein
    MCO: 'MC', // Monaco
    MNE: 'ME', // Montenegro
    MKD: 'MK', // North Macedonia
    SMR: 'SM', // San Marino
    UKR: 'UA', // Ukraine
    VAT: 'VA', // Vatican City
    HKG: 'HK', // Hong Kong
    JOR: 'JO', // Jordan
    MDV: 'MV', // Maldives
    TTO: 'TT', // Trinidad and Tobago
    PAK: 'PK', // Pakistan
    BHR: 'BH', // Bahrain
    NPL: 'NP', // Nepal
    CIV: 'CI', // Côte d'Ivoire
};

export const storefrontToCountry = (storefront: string): string => {
    const supportedCountries = Object.keys(storefrontToCountryMap);
    if (supportedCountries.includes(storefront)) {
        return storefrontToCountryMap[storefront as keyof typeof storefrontToCountryMap];
    }
    // Throwing an error here is not ideal, but it will do for the moment...
    throw new Error(`[898812c2] storefront ${storefront} is not supported`);
};

const productIdToPaymentFrequencyMap = {
    'uk.co.guardian.Feast.yearly': 'ANNUALLY',
    'uk.co.guardain.Feast.yearly.discounted': 'ANNUALLY',
    'uk.co.guardian.Feast.monthly': 'MONTHLY',
    'uk.co.guardian.Feast.monthly.discounted': 'MONTHLY',
};

export const productIdToPaymentFrequency = (productId: string): string => {
    const supportedproductIds = Object.keys(productIdToPaymentFrequencyMap);
    if (supportedproductIds.includes(productId)) {
        return productIdToPaymentFrequencyMap[
            productId as keyof typeof productIdToPaymentFrequencyMap
        ];
    }
    // Throwing an error here is not ideal, but it will do for the moment...
    throw new Error(`[9f6fa4a0] productId ${productId} is not supported`);
};
