/**
 * Script for changing the prices of android products.
 * Takes as input a CSV with product_id, region, currency, new price. See testPriceRise.csv for an example.
 *
 * Usage:
 * FILE_PATH=/path/to/price-rise.csv yarn run-price-rise [--dry-run]
 *
 * Outputs to a CSV with a row per product_id + region.
 */

import {parsePriceRiseCsv, PriceAndCurrency} from "./parsePriceRiseCsv";
import {androidpublisher_v3} from "@googleapis/androidpublisher";
import {GuardianPriceRegion, regionCodeMappings} from "./regionCodeMappings";
import fs from 'fs';
import {getClient} from "./googleClient";

const packageName = 'com.guardian';

const filePath = process.env.FILE_PATH;
if (!filePath) {
    console.log('Missing FILE_PATH');
    process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
let writeStream = fs.createWriteStream('price-rise-output.csv');
writeStream.write('productId,regionCode,currency,price\n');
if (DRY_RUN) {
    console.log('*****DRY RUN*****');
}

// Load new prices for each region/product_id from sheet
const priceRiseData = parsePriceRiseCsv(filePath);

const buildPrice = (currency: string, price: number): androidpublisher_v3.Schema$Money => {
    const [units, nanos] = price.toFixed(2).split('.');
    return {
        currencyCode: currency,
        units: units,
        nanos: parseInt(`${nanos}0000000`),
    };
}

const getCurrentBasePlan = (
    client: androidpublisher_v3.Androidpublisher,
    productId: string,
    packageName: string,
): Promise<androidpublisher_v3.Schema$BasePlan> =>
    // Fetch existing regional prices from billing api
    // https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/get?apix_params=%7B%22packageName%22%3A%22com.guardian%22%2C%22productId%22%3A%22dev_testing_only_5%22%7D
    client.monetization.subscriptions
        .get({ packageName, productId })
        .then((resp) => {
            const bp = resp.data.basePlans ? resp.data.basePlans[0] : undefined;
            if (bp) {
                // console.log(bp);
                // console.log('US bp:', bp.regionalConfigs?.find(rc => rc.regionCode === 'US'));
                return bp;
            } else {
                return Promise.reject('No base plan found');
            }
        });

type GuardianRegionPriceMap = Record<GuardianPriceRegion, PriceAndCurrency>;
type GoogleRegionPriceMap = Record<string, PriceAndCurrency>;

const updatePrices = (
    basePlan: androidpublisher_v3.Schema$BasePlan,
    regionalPriceMap: GoogleRegionPriceMap,
    productId: string,
): androidpublisher_v3.Schema$BasePlan => {
    const updatedRegionalConfigs = basePlan.regionalConfigs?.map((regionalConfig) => {
        if (regionalConfig.regionCode && regionalPriceMap[regionalConfig.regionCode]) {
            // Update the price
            const priceDetails = regionalPriceMap[regionalConfig.regionCode];
            writeStream.write(`${productId},${regionalConfig.regionCode},${priceDetails.currency},${priceDetails.price}\n`);
            return {
                ...regionalConfig,
                price: buildPrice(priceDetails.currency, priceDetails.price),
            };
        } else {
            // Don't change it
            return regionalConfig;
        }
    });
    return {
        ...basePlan,
        regionalConfigs: updatedRegionalConfigs,
    };
}

// Transform guardian regions to google regions
const buildRegionCodeMappings = (guardianRegionalPrices: GuardianRegionPriceMap): GoogleRegionPriceMap => {
    const regionMappings: Record<string, {price: number; currency: string}> = {};
    Object.entries(guardianRegionalPrices).flatMap(([region, priceDetails]) => {
        const regionCodes = regionCodeMappings[region];
        regionCodes.forEach(rc => {
            regionMappings[rc] = priceDetails;
        })
    });
    return regionMappings;
}

getClient().then(client =>
    Promise.all(Object.entries(priceRiseData).map(([productId, regionalPrices]) => {
        console.log(`Updating productId ${productId} in regions: ${Object.keys(regionalPrices).join(', ')}`);

        return getCurrentBasePlan(client, productId, packageName)
            .then((currentBasePlan) => {
                const googleRegionMappings = buildRegionCodeMappings(regionalPrices);
                return updatePrices(currentBasePlan, googleRegionMappings, productId);
            })
            .then((updatedBasePlan: androidpublisher_v3.Schema$BasePlan) => {
                // console.log('updated bp:', updatedBasePlan.regionalConfigs?.find(rc => rc.regionCode === 'GB'));
                // console.log('updated bp:', updatedBasePlan);

                if (!DRY_RUN) {
                    // Update price of each product_id/region - https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/patch
                    client.monetization.subscriptions
                        .patch({
                            productId,
                            packageName,
                            "regionsVersion.version": '2022/02',
                            updateMask: 'basePlans',
                            requestBody: {
                                productId,
                                packageName,
                                basePlans: [updatedBasePlan],
                            }
                        })
                        .then((response) => {
                            console.log(response);
                        })
                        .catch(err => {
                            console.log(err);
                        });
                }
            });
    }))
)
    .catch(err => {
        console.log(err);
    })
    .finally(() => {
        writeStream.close();
    });
