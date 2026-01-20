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
    KHM: 'KH', // Kingdom of Cambodia
    CYM: 'KY', // Cayman Islands
    KAZ: 'KZ', // Kazakhstan
    PRY: 'PY', // Paraguay
    CRI: 'CR', // Costa Rica
    AFG: 'AF', // Afghanistan
    DZA: 'DZ', // Algeria
    ASM: 'AS', // American Samoa
    AGO: 'AO', // Angola
    AIA: 'AI', // Anguilla
    ATA: 'AQ', // Antarctica
    ATG: 'AG', // Antigua and Barbuda
    ARM: 'AM', // Armenia
    ABW: 'AW', // Aruba
    AZE: 'AZ', // Azerbaijan
    BHS: 'BS', // Bahamas (the)
    BGD: 'BD', // Bangladesh
    BRB: 'BB', // Barbados
    BLZ: 'BZ', // Belize
    BEN: 'BJ', // Benin
    BMU: 'BM', // Bermuda
    BTN: 'BT', // Bhutan
    BOL: 'BO', // Bolivia (Plurinational State of)
    BES: 'BQ', // Bonaire, Sint Eustatius and Saba
    BWA: 'BW', // Botswana
    BVT: 'BV', // Bouvet Island
    IOT: 'IO', // British Indian Ocean Territory (the)
    BRN: 'BN', // Brunei Darussalam
    BFA: 'BF', // Burkina Faso
    BDI: 'BI', // Burundi
    CPV: 'CV', // Cabo Verde
    CMR: 'CM', // Cameroon
    CAF: 'CF', // Central African Republic (the)
    TCD: 'TD', // Chad
    CXR: 'CX', // Christmas Island
    CCK: 'CC', // Cocos (Keeling) Islands (the)
    COM: 'KM', // Comoros (the)
    COD: 'CD', // Congo (the Democratic Republic of the)
    COG: 'CG', // Congo (the)
    COK: 'CK', // Cook Islands (the)
    CUB: 'CU', // Cuba
    CUW: 'CW', // Curaçao
    DJI: 'DJ', // Djibouti
    DMA: 'DM', // Dominica
    DOM: 'DO', // Dominican Republic (the)
    SLV: 'SV', // El Salvador
    GNQ: 'GQ', // Equatorial Guinea
    ERI: 'ER', // Eritrea
    SWZ: 'SZ', // Eswatini
    FLK: 'FK', // Falkland Islands (the) [Malvinas]
    FRO: 'FO', // Faroe Islands (the)
    FJI: 'FJ', // Fiji
    GUF: 'GF', // French Guiana
    PYF: 'PF', // French Polynesia
    ATF: 'TF', // French Southern Territories (the)
    GAB: 'GA', // Gabon
    GMB: 'GM', // Gambia (the)
    GEO: 'GE', // Georgia
    GIB: 'GI', // Gibraltar
    GRL: 'GL', // Greenland
    GRD: 'GD', // Grenada
    GLP: 'GP', // Guadeloupe
    GUM: 'GU', // Guam
    GTM: 'GT', // Guatemala
    GGY: 'GG', // Guernsey
    GIN: 'GN', // Guinea
    GNB: 'GW', // Guinea-Bissau
    GUY: 'GY', // Guyana
    HTI: 'HT', // Haiti
    HMD: 'HM', // Heard Island and McDonald Islands
    HND: 'HN', // Honduras
    IRN: 'IR', // Iran (Islamic Republic of)
    IRQ: 'IQ', // Iraq
    IMN: 'IM', // Isle of Man
    JEY: 'JE', // Jersey
    KIR: 'KI', // Kiribati
    PRK: 'KP', // Korea (the Democratic People's Republic of)
    KGZ: 'KG', // Kyrgyzstan
    LAO: 'LA', // Lao People's Democratic Republic (the)
    LBN: 'LB', // Lebanon
    LSO: 'LS', // Lesotho
    LBR: 'LR', // Liberia
    LBY: 'LY', // Libya
    MAC: 'MO', // Macao
    MDG: 'MG', // Madagascar
    MWI: 'MW', // Malawi
    MLI: 'ML', // Mali
    MHL: 'MH', // Marshall Islands (the)
    MTQ: 'MQ', // Martinique
    MRT: 'MR', // Mauritania
    MUS: 'MU', // Mauritius
    MYT: 'YT', // Mayotte
    FSM: 'FM', // Micronesia (Federated States of)
    MDA: 'MD', // Moldova (the Republic of)
    MNG: 'MN', // Mongolia
    MSR: 'MS', // Montserrat
    MOZ: 'MZ', // Mozambique
    MMR: 'MM', // Myanmar
    NAM: 'NA', // Namibia
    NRU: 'NR', // Nauru
    NCL: 'NC', // New Caledonia
    NIC: 'NI', // Nicaragua
    NER: 'NE', // Niger (the)
    NIU: 'NU', // Niue
    NFK: 'NF', // Norfolk Island
    MNP: 'MP', // Northern Mariana Islands (the)
    PLW: 'PW', // Palau
    PSE: 'PS', // Palestine, State of
    PNG: 'PG', // Papua New Guinea
    PCN: 'PN', // Pitcairn
    PRI: 'PR', // Puerto Rico
    RWA: 'RW', // Rwanda
    REU: 'RE', // Réunion
    BLM: 'BL', // Saint Barthélemy
    SHN: 'SH', // Saint Helena, Ascension and Tristan da Cunha
    KNA: 'KN', // Saint Kitts and Nevis
    LCA: 'LC', // Saint Lucia
    MAF: 'MF', // Saint Martin (French part)
    SPM: 'PM', // Saint Pierre and Miquelon
    VCT: 'VC', // Saint Vincent and the Grenadines
    WSM: 'WS', // Samoa
    STP: 'ST', // Sao Tome and Principe
    SEN: 'SN', // Senegal
    SYC: 'SC', // Seychelles
    SLE: 'SL', // Sierra Leone
    SXM: 'SX', // Sint Maarten (Dutch part)
    SLB: 'SB', // Solomon Islands
    SOM: 'SO', // Somalia
    SGS: 'GS', // South Georgia and the South Sandwich Islands
    SSD: 'SS', // South Sudan
    LKA: 'LK', // Sri Lanka
    SDN: 'SD', // Sudan (the)
    SUR: 'SR', // Suriname
    SJM: 'SJ', // Svalbard and Jan Mayen
    SYR: 'SY', // Syrian Arab Republic
    TWN: 'TW', // Taiwan (Province of China)
    TJK: 'TJ', // Tajikistan
    TLS: 'TL', // Timor-Leste
    TGO: 'TG', // Togo
    TKL: 'TK', // Tokelau
    TON: 'TO', // Tonga
    TKM: 'TM', // Turkmenistan
    TCA: 'TC', // Turks and Caicos Islands (the)
    TUV: 'TV', // Tuvalu
    UMI: 'UM', // United States Minor Outlying Islands (the)
    UZB: 'UZ', // Uzbekistan
    VUT: 'VU', // Vanuatu
    VGB: 'VG', // Virgin Islands (British)
    VIR: 'VI', // Virgin Islands (U.S.)
    WLF: 'WF', // Wallis and Futuna
    ESH: 'EH', // Western Sahara
    YEM: 'YE', // Yemen
    ZMB: 'ZM', // Zambia
    ZWE: 'ZW', // Zimbabwe
    ALA: 'AX', // Åland Islands
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
