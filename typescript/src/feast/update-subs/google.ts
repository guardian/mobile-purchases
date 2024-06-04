import {SQSEvent} from "aws-lambda";
import {parseAndStoreSubscriptionUpdate} from "../../update-subs/updatesub";
import {getGoogleSubResponse} from "../../update-subs/google";

export async function handler(event: SQSEvent) {
    const promises = event.Records.map(record => parseAndStoreSubscriptionUpdate(record, getGoogleSubResponse));

    return Promise.all(promises)
        .then(_  => "OK")

}
