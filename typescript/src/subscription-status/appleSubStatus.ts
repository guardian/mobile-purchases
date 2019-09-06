import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {Platform} from "../models/platform";
import {AppleValidationResponse, validateReceipt} from "../services/appleValidateReceipts";
import {HTTPResponses} from "../models/apiGatewayHttp";
import {msToDate, plusDays} from "../utils/dates";

type AppleSubscription = {
    receipt: string
    originalTransactionId: string
}

type AppleLinkPayload = {
    platform: Platform.DailyEdition | Platform.Ios,
    subscriptions: AppleSubscription[]
}

function toResponse(validationResponse: AppleValidationResponse): any {
    const now = new Date();

    const receiptInfo = validationResponse.latest_receipt_info;
    const start = msToDate(receiptInfo.original_purchase_date_ms);
    const end = msToDate(receiptInfo.expires_date);
    const endWithGracePeriod = plusDays(end, 30);
    const valid: boolean = now.getTime() <= endWithGracePeriod.getTime();
    const gracePeriod: boolean = now.getTime() > end.getTime() && valid;

    return {
        originalTransactionId: receiptInfo.original_transaction_id,
        valid: valid,
        gracePeriod: gracePeriod,
        start: start.toISOString(),
        end: end.toISOString(),
        product: receiptInfo.product_id
    }
}

export async function handler(httpRequest: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const payload = JSON.parse(httpRequest.body || "") as AppleLinkPayload;

    try {
        const validationResults = await Promise.all(payload.subscriptions.map(sub => validateReceipt(sub.receipt)));
        const responsePayload = JSON.stringify(validationResults.map(toResponse));
        return {statusCode: 200, body: responsePayload};
    } catch (e) {
        console.log(`Unable to validate receipt(s)`, e);
        return HTTPResponses.INTERNAL_ERROR;
    }
}