import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { App } from '../../models/app'
import { Subscription } from "../../models/subscription";
import { ValidationOptions, AppleValidationResponse, validateReceipt } from "../../services/appleValidateReceipts";
import { toAppleSubscription } from "../../update-subs/apple";

const processSQSRecord = async (record: SQSRecord): Promise<void> => {
    const subscription = JSON.parse(record.body);
    const receipt = subscription["receipt"];
    console.log(`[8a50f97d] receipt: ${receipt}`);
    if (receipt === undefined) {
        console.log(`[4ddde2a0] receipt is undefined`);
        return;
    }
    const validationOptions: ValidationOptions = {
        sandboxRetry: true
    }
    const appleValidationResponses: AppleValidationResponse[] = await validateReceipt(receipt, validationOptions, App.Feast);
    console.log(`[2dc25207] AppleValidationResponses: ${JSON.stringify(appleValidationResponses)}`);
    appleValidationResponses.forEach(appleValidationResponse => {
        const appleSubscription: Subscription = toAppleSubscription(appleValidationResponse)
        console.log(`[a41a0078] appleSubscription: ${JSON.stringify(appleSubscription)}`);
    })
}

export const handler = async (event: SQSEvent): Promise<void> => {
    console.log('[0a06c521] Feast Apple Acquisition Events Lambda has been called');
    console.log(`[d9a1beb1] Processing ${event.Records.length} records`);
    const promises = event.Records.map( async (record: SQSRecord) => {
        await processSQSRecord(record)
    });
    await Promise.all(promises);

    console.log('[2ebc3ffa] Finished processing records');
}
