import {PriceRegion, PriceRise} from './runPriceRise';
import fs from 'fs';

export const parsePriceRiseCsv = (filePath: string): PriceRise => {
    const data = fs.readFileSync(filePath, 'utf8');

    const lines = data.split('\n');

    const priceRiseData: PriceRise = {};

    lines.forEach((line) => {
        const [productId, regionRaw, currency, priceRaw] = line.split(',');
        const region = regionRaw as PriceRegion;
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
