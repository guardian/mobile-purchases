import {getClient} from "../android-price-rise/googleClient";
import {PACKAGE_NAME, SSM_PATH} from "./shared";

const subscriptionId = process.env.SUBSCRIPTION_ID;
const token = process.env.TOKEN;

getClient(SSM_PATH).then(client => {
    client.purchases.subscriptions.get({
        packageName: PACKAGE_NAME,
        subscriptionId,
        token,
    }).then(resp => {
        console.log(resp.data);
    })
});
