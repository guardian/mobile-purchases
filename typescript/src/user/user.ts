import {HTTPResponse, HTTPResponses, HTTPRequest, HttpRequestHeaders} from "../models/apiGatewayHttp";
import {ReadUserSubscription} from "../models/userSubscription";
import {Subscription, ReadSubscription} from "../models/subscription";
import * as restm from "typed-rest-client/RestClient";
import {catchClause} from "@babel/types";
import {dynamoMapper} from "../utils/aws"
import {SubscriptionUpdate} from "../updatesubs/updatesub";
import {tagFilter} from "aws-sdk/clients/health";
import {subscriptionARN} from "aws-sdk/clients/sns";
import {getUserId, getIdentityToken} from "../utils/guIdentityApi";

class SubscriptionStatus {
   subscriptionId: string;
   from?: string;
   to?: string;
   status: string;
   cancelled?: string;

   private getStatus(endTimeStamp: string, cancellelationTimestamp?: string) {

       const now = Date.now()

       if (cancellelationTimestamp === "")   {
          return Date.parse(endTimeStamp) > now ? "active" : "expired"
       }
       else {
           return "cancelled"
       }
   }

   constructor(subscription: ReadSubscription ) {
      this.subscriptionId = subscription.subscriptionId;
      this.from = subscription.startTimeStamp;
      this.to = subscription.endTimeStamp;
      this.status = this.getStatus(subscription.endTimeStamp, subscription.cancellationTimetamp);
      this.cancelled = subscription.cancellationTimetamp;
   }
}

class SubscriptionStatusResponse {
    activeSubscriptions: string[];
    subscriptions: SubscriptionStatus[]

    constructor(subscriptions: ReadSubscription[]) {
        const now = Date.now()
        this.activeSubscriptions = subscriptions.filter( sub => {
            let endTime = Date.parse(sub.endTimeStamp);
            console.log(`Ended: ${sub.endTimeStamp} Now: ${now} End: ${endTime} Keep: ${endTime > now}`)
            return endTime > now
        }).map(activeSub => activeSub.subscriptionId )
        this.subscriptions = subscriptions.map( sub => new SubscriptionStatus(sub))
    }
}

async function getUserSubscriptions(userId: string): Promise<string[]> {
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
            .then( userId => {
                return getUserSubscriptions(userId)
            })
            .then(subIds => {
                return getSubscriptions(subIds)

            })
            .then( subs => {
                console.log(`Subs: ${JSON.stringify(subs)}`)
                return HTTPResponses.OK
            })
            .catch( error => {
                console.log(`Error retrieving user subscriptions: ${error}`)
                return HTTPResponses.INTERNAL_ERROR
            })

    } else {
        return HTTPResponses.INTERNAL_ERROR
    }


}