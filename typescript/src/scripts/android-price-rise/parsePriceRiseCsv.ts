import fs from 'fs';

/**
 * See `./testPriceRise.csv` for an example of the expected format.
 */

export type PriceAndCurrency = {
  price: number;
  currency: string;
};

export type RegionPriceMap = Record<string, PriceAndCurrency>;

export type PriceRise = Record<string, RegionPriceMap>;

export const parsePriceRiseCsv = (filePath: string): PriceRise => {
  const data = fs.readFileSync(filePath, 'utf8');

  const lines = data.split('\n');

  const priceRiseData: PriceRise = {};

  lines.forEach((line) => {
    if (line.trim() === '') {
      return;
    }
    const [productId, region, currency, priceRaw] = line.split(',');
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
