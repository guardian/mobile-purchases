import { parsePayload } from "../../src/pubsub/apple-common";

type BuildPayloadProps = {
    app_account_token?: string;
};

const buildPayload = ({
    app_account_token = undefined,
}: BuildPayloadProps = {}): unknown => {
    return {
        original_transaction_id: "TEST",
        cancellation_date: "TEST",
        web_order_line_item_id: "TEST",
        auto_renew_adam_id: "TEST",
        expiration_intent: "TEST",
        auto_renew_product_id: "uk.co.guardian.gla.12months.2018Dec.withFreeTrial",
        auto_renew_status: "true",
        bid: "uk.co.guardian.iphone2",
        bvrs: "TEST",
        environment: "Sandbox",
        notification_type: "INITIAL_BUY",
        unified_receipt: {
            environment: "Sandbox",
            latest_receipt: "TEST",
            latest_receipt_info: [{
                app_item_id: "TEST",
                bvrs: "TEST",
                is_in_intro_offer_period: "false",
                is_trial_period: "true",
                item_id: "TEST",
                original_transaction_id: "TEST",
                product_id: "uk.co.guardian.gla.12months.2018Dec.withFreeTrial",
                quantity: "1",
                transaction_id: "TEST",
                unique_identifier: "TEST",
                unique_vendor_identifier: "TEST",
                version_external_identifier: "TEST",
                web_order_line_item_id: "TEST",
                purchase_date_ms: "TEST",
                original_purchase_date_ms: "TEST",
                expires_date: "TEST",
                expires_date_ms: "TEST",
                app_account_token,
            }],
            pending_renewal_info: [
                {
                    auto_renew_product_id: "uk.co.guardian.gla.12months.2018Dec.withFreeTrial",
                    auto_renew_status: "1",
                    original_transaction_id: "TEST",
                    product_id: "uk.co.guardian.gla.12months.2018Dec.withFreeTrial",
                    price_consent_status: '',
                    price_increase_status: '',
                }
            ],
            status: 0
        },
        promotional_offer_id: "promotional_offer_id",
        promotional_offer_name: "promotional_offer_name",
        product_id: "product_id",
        purchase_date_ms: 0,
        expires_date_ms: 0
    };
};

describe('parsePayload', () => {
    it('does not return an error when the payload is valid', () => {
        const payload = buildPayload();

        const result = parsePayload(JSON.stringify(payload));

        expect(result).not.toBeInstanceOf(Error);
    })

    it('returns an error when the payload is not valid', () => {
        const payload = 'NOT_A_VALID_PAYLOAD';

        const result = parsePayload(JSON.stringify(payload));

        expect(result).toBeInstanceOf(Error);
    })

    it('includes the app_account_token in the returned data when available)', () => {
        const app_account_token = '7fcdd33b-d111-4de3-8631-d792d213e5da';
        const payload = buildPayload({
            app_account_token,
        });

        const result = parsePayload(JSON.stringify(payload));

        expect(result).not.toBeInstanceOf(Error);
        // I wish the above assertion would narrow the type, but sadly it doesn't!
        if (!(result instanceof Error)) {
            expect(result.unified_receipt.latest_receipt_info[0].app_account_token).toBe(app_account_token);
        }
    })
})
