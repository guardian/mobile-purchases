import {
    HTTPResponse,
    HTTPResponses,
    HTTPRequest,
    HTTPResponseHeaders
} from "../models/apiGatewayHttp";
import {Subscription, ReadSubscription} from "../models/subscription";
import {ReadUserSubscription} from "../models/userSubscription";
import {dynamoMapper} from "../utils/aws"
import {getUserId, getIdentityToken} from "../utils/guIdentityApi";

type SubscriptionStatusEnum = "active" | "expired" | "wontRenew"

class SubscriptionStatus {
   subscriptionId: string;
   from?: string;
   to?: string;
   status: SubscriptionStatusEnum;
   autoRenewing?: boolean;
   cancellationTimestamp?: string;

   private getStatus(endTimeStamp: string, cancellelationTimestamp?: string) : SubscriptionStatusEnum{

       const now = Date.now()

       if (cancellelationTimestamp === "" || cancellelationTimestamp === undefined)   {
          return Date.parse(endTimeStamp) > now ? "active" : "expired"
       }
       else {
           return "wontRenew"
       }
   }

   constructor(subscription: ReadSubscription ) {
      this.subscriptionId = subscription.subscriptionId;
      this.from = subscription.startTimeStamp;
      this.to = subscription.endTimeStamp;
      this.status = this.getStatus(subscription.endTimeStamp, subscription.cancellationTimetamp);
      this.autoRenewing = subscription.autoRenewing;
      this.cancellationTimestamp = subscription.cancellationTimetamp === "" ? undefined : subscription.cancellationTimetamp
   }
}

class SubscriptionStatusResponse {
    activeSubscriptionIds: string[];
    subscriptions: SubscriptionStatus[]

    constructor(subscriptions: ReadSubscription[]) {
        const now = Date.now();
        this.activeSubscriptionIds = subscriptions.filter(sub => {
            let endTime = Date.parse(sub.endTimeStamp);
            return endTime > now
        }).map(activeSub => activeSub.subscriptionId )
        this.subscriptions = subscriptions.map( sub => new SubscriptionStatus(sub))
    }
}

async function getUserSubscriptionIds(userId: string): Promise<string[]> {
    const subs: string[] = [];

    for await (const sub of dynamoMapper.query({
                valueConstructor: ReadUserSubscription,
                keyCondition: {userId: userId}
            })
        ) {
        subs.push(sub.subscriptionId)
    }
    return subs
}

async function getSubscriptions(subscriptionIds: string[]) : Promise<SubscriptionStatusResponse>  {
    const subs: ReadSubscription[] = [];
    const toGet = subscriptionIds.map( subscriptionId => Object.assign( new ReadSubscription, {subscriptionId: subscriptionId} ) )

    for await (const sub of dynamoMapper.batchGet(toGet)  ) {
        subs.push(sub)
    }

    const sortedSubs = subs.sort((subscriptionA: Subscription, subscriptionB: Subscription) => {
        const endTimeA = subscriptionA.endTimeStamp && Date.parse(subscriptionA.endTimeStamp) || 0
        const endTimeB = subscriptionB.endTimeStamp && Date.parse(subscriptionB.endTimeStamp) || 0
        return endTimeA - endTimeB
    })
    return new SubscriptionStatusResponse(sortedSubs)
}


export async function handler(httpRequest: HTTPRequest): Promise<HTTPResponse> {
    if(httpRequest.headers && getIdentityToken(httpRequest.headers)) {
        return getUserId(httpRequest.headers)
            .then( userId => getUserSubscriptionIds(userId))
            .then(subIds => getSubscriptions(subIds))
            .then( subs => {
                return new HTTPResponse(200, new HTTPResponseHeaders(), JSON.stringify(subs) )
            })
            .catch( error => {
                console.log(`Error retrieving user subscriptions: ${error}`)
                return HTTPResponses.INTERNAL_ERROR
            })

    } else {
        return HTTPResponses.INTERNAL_ERROR
    }
}