// This function is duplicated from the copy in src/update-subs/google.ts
// This will be corrected in the future refactoring

export type AcquisitionApiPayloadQueryParameter = {
    name: string,
    value: string
}

// This schema simply follows the one given here: 
// direct link: https://github.com/guardian/support-frontend/blob/main/support-modules/acquisition-events/src/main/scala/com/gu/support/acquisitions/models/AcquisitionDataRow.scala
// permalink  : https://github.com/guardian/support-frontend/blob/4d8c76a16bddd01ab91e59f89adbcf0867923c69/support-modules/acquisition-events/src/main/scala/com/gu/support/acquisitions/models/AcquisitionDataRow.scala

export type AcquisitionApiPayload = {
    eventTimeStamp: string,
    product: string,
    amount?: number,
    country: string,
    currency: string,
    componentId?: string,
    componentType?: string,
    campaignCode?: string,
    source?: string,
    referrerUrl?: string,
    abTests: void[], // this will have to be updated later if we want to use it
    paymentFrequency: string,
    paymentProvider?: void, // this will have to be updated later if we want to use it
    printOptions?: void, // this will have to be updated later if we want to use it
    browserId?: string,
    identityId?: string,
    pageViewId?: string,
    referrerPageViewId?: string,
    labels: void[],
    promoCode?: string,
    reusedExistingPaymentMethod: boolean,
    readerType: string,
    acquisitionType: string,
    zuoraSubscriptionNumber?: string,
    contributionId?: string,
    paymentId: string, // optional in the acquisition API model, but required by Data Design, see comment id: e3f790af 
    queryParameters: AcquisitionApiPayloadQueryParameter[],
    platform?: string,
    postalCode?: string,
    state?: string,
    email?: string
}
