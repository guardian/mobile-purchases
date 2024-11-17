
## Signing Promotional offers


### Introduction and live end-points

The server side signature for promotional offers was implemented in 2023 in this PR: [mobile-purchases/pull/1160](https://github.com/guardian/mobile-purchases/pull/1160), following the specifications presented in 

1. [Implementing promotional offers in your app](https://developer.apple.com/documentation/storekit/in-app_purchase/original_api_for_in-app_purchase/subscriptions_and_offers/implementing_promotional_offers_in_your_app), and 
2. [Generating a signature for promotional offers](https://developer.apple.com/documentation/storekit/in-app_purchase/original_api_for_in-app_purchase/subscriptions_and_offers/generating_a_signature_for_promotional_offers)

The two live endpoints for signatures are

- CODE: https://mobile-purchases.mobile-aws.code.dev-guardianapis.com/apple/fetchOfferDetails
- PROD: https://mobile-purchases.mobile-aws.guardianapis.com/apple/fetchOfferDetails

The private keys are stored in these two parameter store, locations

- /mobile-purchases/CODE/mobile/promotional-offers-encryption-private-key
- /mobile-purchases/PROD/mobile/promotional-offers-encryption-private-key

And the appBundleId and keyIdentifier, here:

- /mobile-purchases/CODE/mobile/promotional-offers-appBundleId
- /mobile-purchases/PROD/mobile/promotional-offers-appBundleId
- /mobile-purchases/CODE/mobile/promotional-offers-keyIdentifier
- /mobile-purchases/PROD/mobile/promotional-offers-keyIdentifier

### Signature example

```
curl \
    -X POST \
    -d '{"username": "hashedusername", "productIdentifier": "product1", "offerIdentifier": "offer1"}' \
    https://mobile-purchases.mobile-aws.code.dev-guardianapis.com/apple/fetchOfferDetails
```

Which then return the following signature

```
{
    "nonce":"8ef8a6f8-2916-4c4a-a7d6-ad97258ee56f",
    "timestamp":1693856897490,
    "keyIdentifier":"PGRFM5F82T",
    "signature":"MEUCIQCoaq1pzCQW6wsf7ga6iareWJ41dvsRXL+LlbO/JgNM+wIgFLwty/Ycz2nDXD4vhBxPJTddwg+Mo9v8gn4T+z4DPxY="
}
```



