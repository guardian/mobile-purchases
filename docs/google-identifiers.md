In this file we explain an interesting idiosyncrasy affecting the Google pubsub logic and how it has affected how models.

### Purchase tokens are the subscriptions unique identifiers

The original notification from Google which triggers `feast/pubsub/google.ts` looks like this 

```
{
    "packageName": "uk.co.guardian.feast",
    "purchaseToken": "Example-kokmikjooafaEUsuLAO3RKjfwtmyQ",
    "subscriptionId": "uk.co.guardian.feast.access"
}
```

Sadly the attribute `subscriptionId` is not a unique identifer for the corresponding subscription and instead the information carried by `purchaseToken` is what we have been using as unique identifer for google subscriptions in our backend.

To maintain consitency with the google naming, our models are using the same attribute name for that information, causing mental confusion to people reading the code. 

In the case of "classic" google, a `Subscription` ends up like this: (source: src/update-subs/google.ts)

```
{
    subscriptionId        | - <-- Purchase token!
    startTimestamp        | -
    endTimestamp          | -
    cancellationTimestamp | -
    autoRenewing          | -
    productId             | - <-- subscriptionId (from Google)
    platform              | - <-- googlePackageNameToPlatform(packageName)?.toString()  # package name is now visible as "platform"
    freeTrial             | -
    billingPeriod         | -
    googlePayload         | -
    receipt               | -
    applePayload          | -
    ttl                   | -
}
```

In the case of a feast google, a `Subscription` end up like this: (source: src/feast/update-subs/google.ts)

```
{
    subscriptionId        | - <-- Purchase token!
    startTimestamp        | -
    endTimestamp          | -
    cancellationTimestamp | -
    autoRenewing          | -
    productId             | - <-- productId from a google subscription acquired using the v2 API.
    platform              | - <-- googlePackageNameToPlatform(packageName)  # package name is now visible as "platform"
    freeTrial             | -
    billingPeriod         | -
    googlePayload         | -
    receipt               | -
    applePayload          | -
    ttl                   | -
}
```

### Beware of our models

Beware that our models have adopted the Google naming, and for instance, a `GoogleSubscriptionReference` is defined like this

```
interface GoogleSubscriptionReference {
    packageName: string,
    purchaseToken: string,
    subscriptionId: string
}
```

Where the `subscriptionId` mirror the attribute of a google pubsub notification and not the unique identifier of a `models/Subscription`!
