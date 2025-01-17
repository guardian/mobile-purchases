
## storekit signatures

This page describes the process of forging a bearer token for querying extra subscription information as part of the Apple Feast acquisition pipeline.

## Apple API

As part of the Feast acquisition pipeline, the mobile-purchases-feast-apple-acquisition-events-PROD lambda performs a call to apple's API

```
https://api.storekit.itunes.apple.com
```

and notably the end point

```
https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/{transactionId}
```

as documented in [Get All Subscription Statuses (https://developer.apple.com/documentation/)](https://developer.apple.com/documentation/appstoreserverapi/get-v1-subscriptions-_transactionid_). 

In order to be authenticated a JSON Web Token needs to be generated as per the instruction in [generating-json-web-tokens-for-api-requests](https://developer.apple.com/documentation/appstoreserverapi/generating-json-web-tokens-for-api-requests).

## JSON Web Token

JSON Web Tokens, described here: [https://jwt.io/introduction](https://jwt.io/introduction), are a neat way to generate bearer tokens for API authentication without the use of an API key. Instead, the secret is a private key that is used to sign a JSON object and the package (object and signature) are base64 and url encoded, and serve as the bearer token.

There are several JSON Web Token libraries available in the wild, but the one that turned out to work, and more importantly present a signatures close to the specs (and therefore useful to us) is [https://www.npmjs.com/package/jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken).

we set the token with a one hour expiry as per standard recommendation.

## Private Keys and Private informations

The header and payload of the JSON Web Token, as well as the signature process require a few information that are private and the following Parameter Store keys have been introduced


- /mobile-purchases/PROD/mobile/feastAppleStoreKitConfigIssuerId
- /mobile-purchases/PROD/mobile/feastAppleStoreKitConfigKeyId
- /mobile-purchases/PROD/mobile/feastAppleStoreKitConfigAudience
- /mobile-purchases/PROD/mobile/feastAppleStoreKitConfigAppBunbleId
- /mobile-purchases/PROD/mobile/feastAppleStoreKitConfigPrivateKey1

Note that although the keys are specific to Feast acquisition, we have reused the same private key that we used for promotional offers.

Also note that there is not consistency in how the private key needs to be presented from one library to another, and in this case it needs to be given in this format

```
-----BEGIN PRIVATE KEY-----
D3G1AgEsds(etc)
-----END PRIVATE KEY-----;
```
