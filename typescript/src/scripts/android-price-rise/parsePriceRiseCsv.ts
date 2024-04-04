import fs from 'fs';
import {GuardianPriceRegion, regionCodeMappings} from "./regionCodeMappings";

/**
 * See `./testPriceRise.csv` for an example of the expected format.
 */

export type PriceAndCurrency = {
    price: number;
    currency: string;
};
export type PriceRise = {
    [productId: string]: {
        [region in GuardianPriceRegion]: PriceAndCurrency;
    };
}

export type GuardianRegionPriceMap = Record<GuardianPriceRegion, PriceAndCurrency>;
export type GoogleRegionPriceMap = Record<string, PriceAndCurrency>;

// Transforms guardian regions to google regions
export const buildGoogleRegionPriceMap = (guardianRegionalPrices: GuardianRegionPriceMap): GoogleRegionPriceMap => {
    const regionMappings: Record<string, {price: number; currency: string}> = {};
    Object.entries(guardianRegionalPrices).flatMap(([region, priceDetails]) => {
        const regionCodes = regionCodeMappings[region];
        regionCodes.forEach(rc => {
            regionMappings[rc] = priceDetails;
        })
    });
    return regionMappings;
}

export const parsePriceRiseCsv = (filePath: string): PriceRise => {
    const data = fs.readFileSync(filePath, 'utf8');

    const lines = data.split('\n');

    const priceRiseData: PriceRise = {};

    lines.forEach((line) => {
        const [productId, regionRaw, currency, priceRaw] = line.split(',');
        const region = regionRaw as GuardianPriceRegion;
        const price = parseFloat(priceRaw);

        if (!priceRiseData[productId]) {
            priceRiseData[productId] = {};
        }

        priceRiseData[productId][region] = {
            price,
            currency,
        };
    });

    return priceRiseData;
};
