import {parsePriceRiseCsv} from "./parsePriceRiseCsv";
import {initialiseAndroidPublisherClient} from "../../services/google-play-v2";
import {androidpublisher_v3} from "@googleapis/androidpublisher";
const packageName = 'com.guardian';

const ALL_REGIONS = ['AU', 'CA', 'EU', 'UK', 'US', 'NZ', 'ROW'];
export type PriceRegion = (typeof ALL_REGIONS)[number];

export type PriceRise = {
    [productId: string]: {
        [region in PriceRegion]: {
            price: number;
            currency: string;
        };
    };
}

const filePath = process.env.FILE_PATH;
if (!filePath) {
    console.log('Missing FILE_PATH');
    process.exit(1);
}

// Load new prices for each region/product_id from sheet
const priceRiseData = parsePriceRiseCsv(filePath);
console.log(priceRiseData);

const buildPrice = (currency: string, price: number): androidpublisher_v3.Schema$Money => {
    const [units, nanos] = price.toFixed(2).split('.');
    return {
        currencyCode: currency,
        units: units,
        nanos: parseInt(nanos),
    };
}

initialiseAndroidPublisherClient().then(client => {

    Object.entries(priceRiseData).map(([productId, regionalPrices]) => {

        // Fetch existing regional prices from billing api
        // https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/get?apix_params=%7B%22packageName%22%3A%22com.guardian%22%2C%22productId%22%3A%22dev_testing_only_5%22%7D
        client.monetization.subscriptions.get({ packageName, productId }).then((resp) => {
            const bp = resp.data.basePlans ? resp.data.basePlans[0] : undefined;
            if (bp) {
                console.log(bp.regionalConfigs)
            }
        }).catch(err => {
            console.log(err)
        });

        // Update price of each product_id/region - https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/patch

        // TODO - how do we map regions from google to our regions? What do we do where there is no mapping?
        // const regionalConfigs = Object.entries(regionalPrices).map(([region, price]) => ({
        //     price: buildPrice(price.currency, price.price),
        //     regionCode: region, // TODO - get correct regionCode
        // }));
        //
        // client.monetization.subscriptions.patch({
        //     productId,
        //     requestBody: {
        //         basePlans: [{
        //             basePlanId: 'TODO', // TODO - do we need this?
        //             regionalConfigs,
        //         }]
        //     }
        // });
    });

    // Migrate each product_id/region - https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions.basePlans/migratePrices
    // client.monetization.subscriptions.basePlans.migratePrices({
    //     packageName,
    //     productId,
    //     requestBody: {
    //         regionalPriceMigrations: [
    //             {
    //                 // TODO
    //                 priceIncreaseType: 'PRICE_INCREASE_TYPE_OPT_OUT',
    //                 regionCode: region,
    //             }
    //         ]
    //     }
    // })
});
