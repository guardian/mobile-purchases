import {parseReceipt, parseStrangeAppleJson} from "../../src/utils/receiptParser";

describe("The strange apple json parser", () => {

    test("Should parse Apple's strange Json", () => {
        const strangeJson = '{"key" = "value"; "anotherKey" = "anotherValue";}';
        const expected = {key: "value", anotherKey: "anotherValue"};

        const result = parseStrangeAppleJson(strangeJson);
        expect(result).toStrictEqual(expected)
    });

    test("Should parse Apple's strange Json, handling multiline, uneven spaces and missing semi-colons", () => {
        const strangeJson = `{"key"= "value"; 
        "anotherKey"= "anotherValue";"aWeirdKey"= "forAStrangeValue";
        }`;
        const expected = {key: "value", anotherKey: "anotherValue", aWeirdKey: "forAStrangeValue"};

        const result = parseStrangeAppleJson(strangeJson);
        expect(result).toStrictEqual(expected)
    });

    test("Should parse Apple's strange Json, and normalise key-names to key_names", () => {
        const strangeJson = `{"key-name"= "value"}`;
        const expected = {key_name: "value"};

        const result = parseStrangeAppleJson(strangeJson);
        expect(result).toStrictEqual(expected)
    });



    test("Should parse a fairly realistic (yet fake) strange Apple Json", () => {
        const strangeJson = `{
    	"original-purchase-date-pst" = "2019-06-07 08:17:23 America/Los_Angeles";
    	"quantity" = "1";
    	"unique-vendor-identifier" = "C0FDF1D2-BFF4-4885-A412-FB3C64BDB168";
    	"original-purchase-date-ms" = "1559920637000";
    	"expires-date-formatted" = "2019-06-14 15:17:23 Etc/GMT";
    	"is-in-intro-offer-period" = "false";
    	"purchase-date-ms" = "1559920637000";
    	"expires-date-formatted-pst" = "2019-06-14 08:17:23 America/Los_Angeles";
    	"is-trial-period" = "true";
    	"item-id" = "1234567";
    	"unique-identifier" = "be564172835abshb";
    	"original-transaction-id" = "1234567890";
    	"expires-date" = "1560525437000";
    	"app-item-id" = "71625784490";
    	"transaction-id" = "123456789009876";
    	"bvrs" = "98765";
    	"web-order-line-item-id" = "123456789098765";
    	"version-external-identifier" = "123456789";
    	"bid" = "uk.co.guardian.iphone2";
    	"product-id" = "uk.co.guardian.gla.1month.2018May.withFreeTrial";
    	"purchase-date" = "2019-06-07 15:17:23 Etc/GMT";
    	"purchase-date-pst" = "2019-06-07 08:17:23 America/Los_Angeles";
    	"original-purchase-date" = "2019-06-07 15:17:23 Etc/GMT";
    }`;
        const expected = {
            original_purchase_date_pst: "2019-06-07 08:17:23 America/Los_Angeles",
            quantity: "1",
            unique_vendor_identifier: "C0FDF1D2-BFF4-4885-A412-FB3C64BDB168",
            original_purchase_date_ms: "1559920637000",
            expires_date_formatted: "2019-06-14 15:17:23 Etc/GMT",
            is_in_intro_offer_period: "false",
            purchase_date_ms: "1559920637000",
            expires_date_formatted_pst: "2019-06-14 08:17:23 America/Los_Angeles",
            is_trial_period: "true",
            item_id: "1234567",
            unique_identifier: "be564172835abshb",
            original_transaction_id: "1234567890",
            expires_date: "1560525437000",
            app_item_id: "71625784490",
            transaction_id: "123456789009876",
            bvrs: "98765",
            web_order_line_item_id: "123456789098765",
            version_external_identifier: "123456789",
            bid: "uk.co.guardian.iphone2",
            product_id: "uk.co.guardian.gla.1month.2018May.withFreeTrial",
            purchase_date: "2019-06-07 15:17:23 Etc/GMT",
            purchase_date_pst: "2019-06-07 08:17:23 America/Los_Angeles",
            original_purchase_date: "2019-06-07 15:17:23 Etc/GMT",
        };

        const result = parseStrangeAppleJson(strangeJson);
        expect(result).toStrictEqual(expected)
    });
});

describe("The apple receipt parser", () => {
    test("Should parse a dummy receipt", () => {
        const base64EncodedReceipt = "ewoJInNpZ25hdHVyZSIgPSAiWm1GclpYTnBaMjVoZEhWeVpRbz0iOwoJInB1cmNoYXNlLWluZm8iID0gImV3b0pJbTl5YVdkcGJtRnNMWEIxY21Ob1lYTmxMV1JoZEdVdGNITjBJaUE5SUNJeU1ERTVMVEEyTFRBM0lEQTRPakUzT2pJeklFRnRaWEpwWTJFdlRHOXpYMEZ1WjJWc1pYTWlPd29KSW5GMVlXNTBhWFI1SWlBOUlDSXhJanNLQ1NKMWJtbHhkV1V0ZG1WdVpHOXlMV2xrWlc1MGFXWnBaWElpSUQwZ0lrTXdSa1JHTVVReUxVSkdSalF0TkRnNE5TMUJOREV5TFVaQ00wTTJORUpFUWpFMk9DSTdDZ2tpYjNKcFoybHVZV3d0Y0hWeVkyaGhjMlV0WkdGMFpTMXRjeUlnUFNBaU1UVTFPVGt5TURZek56QXdNQ0k3Q2draVpYaHdhWEpsY3kxa1lYUmxMV1p2Y20xaGRIUmxaQ0lnUFNBaU1qQXhPUzB3TmkweE5DQXhOVG94TnpveU15QkZkR012UjAxVUlqc0tDU0pwY3kxcGJpMXBiblJ5YnkxdlptWmxjaTF3WlhKcGIyUWlJRDBnSW1aaGJITmxJanNLQ1NKd2RYSmphR0Z6WlMxa1lYUmxMVzF6SWlBOUlDSXhOVFU1T1RJd05qTTNNREF3SWpzS0NTSmxlSEJwY21WekxXUmhkR1V0Wm05eWJXRjBkR1ZrTFhCemRDSWdQU0FpTWpBeE9TMHdOaTB4TkNBd09Eb3hOem95TXlCQmJXVnlhV05oTDB4dmMxOUJibWRsYkdWeklqc0tDU0pwY3kxMGNtbGhiQzF3WlhKcGIyUWlJRDBnSW5SeWRXVWlPd29KSW1sMFpXMHRhV1FpSUQwZ0lqRXlNelExTmpjaU93b0pJblZ1YVhGMVpTMXBaR1Z1ZEdsbWFXVnlJaUE5SUNKaVpUVTJOREUzTWpnek5XRmljMmhpSWpzS0NTSnZjbWxuYVc1aGJDMTBjbUZ1YzJGamRHbHZiaTFwWkNJZ1BTQWlNVEl6TkRVMk56ZzVNQ0k3Q2draVpYaHdhWEpsY3kxa1lYUmxJaUE5SUNJeE5UWXdOVEkxTkRNM01EQXdJanNLQ1NKaGNIQXRhWFJsYlMxcFpDSWdQU0FpTnpFMk1qVTNPRFEwT1RBaU93b0pJblJ5WVc1ellXTjBhVzl1TFdsa0lpQTlJQ0l4TWpNME5UWTNPRGt3TURrNE56WWlPd29KSW1KMmNuTWlJRDBnSWprNE56WTFJanNLQ1NKM1pXSXRiM0prWlhJdGJHbHVaUzFwZEdWdExXbGtJaUE5SUNJeE1qTTBOVFkzT0Rrd09UZzNOalVpT3dvSkluWmxjbk5wYjI0dFpYaDBaWEp1WVd3dGFXUmxiblJwWm1sbGNpSWdQU0FpTVRJek5EVTJOemc1SWpzS0NTSmlhV1FpSUQwZ0luVnJMbU52TG1kMVlYSmthV0Z1TG1sd2FHOXVaVElpT3dvSkluQnliMlIxWTNRdGFXUWlJRDBnSW5WckxtTnZMbWQxWVhKa2FXRnVMbWRzWVM0eGJXOXVkR2d1TWpBeE9FMWhlUzUzYVhSb1JuSmxaVlJ5YVdGc0lqc0tDU0p3ZFhKamFHRnpaUzFrWVhSbElpQTlJQ0l5TURFNUxUQTJMVEEzSURFMU9qRTNPakl6SUVWMFl5OUhUVlFpT3dvSkluQjFjbU5vWVhObExXUmhkR1V0Y0hOMElpQTlJQ0l5TURFNUxUQTJMVEEzSURBNE9qRTNPakl6SUVGdFpYSnBZMkV2VEc5elgwRnVaMlZzWlhNaU93b0pJbTl5YVdkcGJtRnNMWEIxY21Ob1lYTmxMV1JoZEdVaUlEMGdJakl3TVRrdE1EWXRNRGNnTVRVNk1UYzZNak1nUlhSakwwZE5WQ0k3Q24wPSI7CgkicG9kIiA9ICIxNiI7Cgkic2lnbmluZy1zdGF0dXMiID0gIjAiOwp9";
        const receipt = parseReceipt(base64EncodedReceipt)

        expect(receipt).toStrictEqual({
            original_purchase_date_pst: "2019-06-07 08:17:23 America/Los_Angeles",
            quantity: "1",
            unique_vendor_identifier: "C0FDF1D2-BFF4-4885-A412-FB3C64BDB168",
            original_purchase_date_ms: "1559920637000",
            expires_date_formatted: "2019-06-14 15:17:23 Etc/GMT",
            is_in_intro_offer_period: "false",
            purchase_date_ms: "1559920637000",
            expires_date_formatted_pst: "2019-06-14 08:17:23 America/Los_Angeles",
            is_trial_period: "true",
            item_id: "1234567",
            unique_identifier: "be564172835abshb",
            original_transaction_id: "1234567890",
            expires_date: "1560525437000",
            app_item_id: "71625784490",
            transaction_id: "123456789009876",
            bvrs: "98765",
            web_order_line_item_id: "123456789098765",
            version_external_identifier: "123456789",
            bid: "uk.co.guardian.iphone2",
            product_id: "uk.co.guardian.gla.1month.2018May.withFreeTrial",
            purchase_date: "2019-06-07 15:17:23 Etc/GMT",
            purchase_date_pst: "2019-06-07 08:17:23 America/Los_Angeles",
            original_purchase_date: "2019-06-07 15:17:23 Etc/GMT",
        })
    });
});