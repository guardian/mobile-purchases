import {
    AppleValidationResponse,
    AppleValidationServerResponse,
    toSensiblePayloadFormat
} from "../../src/services/appleValidateReceipts";

describe("The apple validation service", () => {
    test("Should transform a dirty apple payload with an expired receipt info into a sane one", () => {
        const appleResponse: AppleValidationServerResponse = {
            auto_renew_status: 0,
            latest_expired_receipt_info: {
                original_transaction_id: "1234",
                product_id: "uk.co.guardian.gla.1month.2018May.withFreeTrial",
                expires_date: "1570705794000",
                original_purchase_date_ms: "1567081703000"
            },
            status: 21006
        };

        const expected: AppleValidationResponse = {
            autoRenewStatus: false,
            isRetryable: false,
            latestReceipt: "cmVjZWlwdA==",
            latestReceiptInfo: {
                cancellationDate: null,
                expiresDate: new Date(1570705794000),
                originalPurchaseDate: new Date(1567081703000),
                originalTransactionId: "1234",
                productId: "uk.co.guardian.gla.1month.2018May.withFreeTrial",
            },
        };

        expect(toSensiblePayloadFormat(appleResponse, "cmVjZWlwdA==")).toStrictEqual(expected);
    });


    test("Should transform a dirty apple payload with the latest receipt info into a sane one", () => {
        const appleResponse: AppleValidationServerResponse = {
            auto_renew_status: 0,
            latest_receipt_info: {
                original_transaction_id: "1234",
                product_id: "uk.co.guardian.gla.1month.2018May.withFreeTrial",
                expires_date: "2019-09-10 11:09:54 Etc/GM",
                expires_date_ms: "1570705794000",
                original_purchase_date_ms: "1567081703000"
            },
            status: 0
        };

        const expected: AppleValidationResponse = {
            autoRenewStatus: false,
            isRetryable: false,
            latestReceipt: "cmVjZWlwdA==",
            latestReceiptInfo: {
                cancellationDate: null,
                expiresDate: new Date(1570705794000),
                originalPurchaseDate: new Date(1567081703000),
                originalTransactionId: "1234",
                productId: "uk.co.guardian.gla.1month.2018May.withFreeTrial",
            },
        };

        expect(toSensiblePayloadFormat(appleResponse, "cmVjZWlwdA==")).toStrictEqual(expected);
    })

    test("Should transform a dirty apple payload with an array of latest receipts into sane one", () => {
        const appleResponse: AppleValidationServerResponse = {
            auto_renew_status: 0,
            latest_receipt_info: [{
                original_transaction_id: "1234",
                product_id: "uk.co.guardian.gla.1month.2018May.withFreeTrial",
                expires_date: "2019-09-10 11:09:54 Etc/GM",
                expires_date_ms: "1570705794000",
                original_purchase_date_ms: "1567081703000"
            }],
            status: 0
        };

        const expected: AppleValidationResponse = {
            autoRenewStatus: false,
            isRetryable: false,
            latestReceipt: "cmVjZWlwdA==",
            latestReceiptInfo: {
                cancellationDate: null,
                expiresDate: new Date(1570705794000),
                originalPurchaseDate: new Date(1567081703000),
                originalTransactionId: "1234",
                productId: "uk.co.guardian.gla.1month.2018May.withFreeTrial",
            },
        };

        expect(toSensiblePayloadFormat(appleResponse, "cmVjZWlwdA==")).toStrictEqual(expected);
    })

    test("Should transform a dirty apple payload with an array of latest receipts into sane one, picking the relevant receipt in the array", () => {
        const appleResponse: AppleValidationServerResponse = {
            auto_renew_status: 0,
            latest_receipt_info: [
                {
                    original_transaction_id: "1234",
                    product_id: "uk.co.guardian.gla.1month.2018May.withFreeTrial",
                    expires_date: "2019-09-10 11:09:54 Etc/GM",
                    expires_date_ms: "1570705793000",
                    original_purchase_date_ms: "1567081703000"
                },
                {
                    original_transaction_id: "1235",
                    product_id: "uk.co.guardian.gla.1month.2018May.withFreeTrial",
                    expires_date: "2019-09-10 11:09:54 Etc/GM",
                    expires_date_ms: "1570705794000",
                    original_purchase_date_ms: "1567081703000"
                }
            ],
            status: 0
        };

        const expected: AppleValidationResponse = {
            autoRenewStatus: false,
            isRetryable: false,
            latestReceipt: "cmVjZWlwdA==",
            latestReceiptInfo: {
                cancellationDate: null,
                expiresDate: new Date(1570705794000),
                originalPurchaseDate: new Date(1567081703000),
                originalTransactionId: "1235",
                productId: "uk.co.guardian.gla.1month.2018May.withFreeTrial",
            },
        };

        expect(toSensiblePayloadFormat(appleResponse, "cmVjZWlwdA==")).toStrictEqual(expected);
    })
});