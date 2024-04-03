import fs from 'fs';
import {GuardianPriceRegion} from "./regionCodeMappings";

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
