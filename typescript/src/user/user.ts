import "source-map-support/register";
import { HTTPResponses } from "../models/apiGatewayHttp";
import { Subscription, SubscriptionEmpty } from "../models/subscription";
import { UserSubscriptionEmpty } from "../models/userSubscription";
import { dynamoMapper } from "../utils/aws";
import {
  getUserId,
  getAuthToken,
  UserIdResolution,
} from "../utils/guIdentityApi";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { plusDays } from "../utils/dates";
import { getConfigValue } from "../utils/ssmConfig";
import { mapPlatformToSoftOptInProductName } from "../utils/softOptIns";

interface SubscriptionStatus {
  subscriptionId: string;
  from: string;
  to: string;
  cancellationTimestamp?: string;
  valid: boolean;
  gracePeriod: boolean;
  autoRenewing: boolean;
  productId: string;
  softOptInProductName: string;
}

interface SubscriptionStatusResponse {
  subscriptions: SubscriptionStatus[];
}

async function getUserSubscriptionIds(userId: string): Promise<string[]> {
  const subs: string[] = [];

  // ( comment group #488db8c1 )
  // TODO:
  // In PR: https://github.com/guardian/mobile-purchases/pull/1698
  // we performed a renaming of ReadSubscription to UserSubscriptionEmpty
  // With that said it should now be possible to use UserSubscription instead of
  // UserSubscriptionEmpty as first argument of the dynamoMapper.query(

  const subscriptionResults = dynamoMapper.query(UserSubscriptionEmpty, {
    userId: userId,
  });

  for await (const sub of subscriptionResults) {
    subs.push(sub.subscriptionId);
  }
  return subs;
}

async function getSubscriptions(
  subscriptionIds: string[],
): Promise<SubscriptionStatusResponse> {
  const subs: SubscriptionEmpty[] = [];
  const toGet = subscriptionIds.map((subscriptionId) =>
    new SubscriptionEmpty().setSubscriptionId(subscriptionId),
  );

  for await (const sub of dynamoMapper.batchGet(toGet)) {
    subs.push(sub);
  }

  const sortedSubs = subs.sort(
    (subscriptionA: Subscription, subscriptionB: Subscription) => {
      const endTimeA =
        (subscriptionA.endTimestamp &&
          Date.parse(subscriptionA.endTimestamp)) ||
        0;
      const endTimeB =
        (subscriptionB.endTimestamp &&
          Date.parse(subscriptionB.endTimestamp)) ||
        0;
      return endTimeA - endTimeB;
    },
  );

  const now = new Date();

  const subscriptionStatuses: SubscriptionStatus[] = sortedSubs.map((sub) => {
    const end = new Date(Date.parse(sub.endTimestamp));
    const endWithGracePeriod = plusDays(end, 30);
    const valid: boolean = now.getTime() <= endWithGracePeriod.getTime();
    const gracePeriod: boolean = now.getTime() > end.getTime() && valid;

    return {
      subscriptionId: sub.subscriptionId,
      from: sub.startTimestamp,
      to: sub.endTimestamp,
      cancellationTimestamp: sub.cancellationTimestamp,
      valid: valid,
      gracePeriod: gracePeriod,
      autoRenewing: sub.autoRenewing,
      productId: sub.productId,
      softOptInProductName: mapPlatformToSoftOptInProductName(sub.platform),
    };
  });

  return {
    subscriptions: subscriptionStatuses,
  };
}

async function apiKeysConfig(): Promise<string[]> {
  // returning an array just in case we get more than one client one day
  const apiKey0Default = await getConfigValue<string>("user.api-key.0");
  const apiKey1Salesforce = await getConfigValue<string>(
    "user.api-key.1.salesforce",
  );
  return [apiKey0Default, apiKey1Salesforce];
}

export async function handler(
  httpRequest: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const apiKeys = await apiKeysConfig();
    const authToken = getAuthToken(httpRequest.headers);

    let userId: string;

    if (authToken && apiKeys.includes(authToken)) {
      if (httpRequest.pathParameters && httpRequest.pathParameters["userId"]) {
        userId = httpRequest.pathParameters["userId"];
      } else {
        return HTTPResponses.INVALID_REQUEST;
      }
    } else {
      const resolution: UserIdResolution = await getUserId(httpRequest.headers);
      switch (resolution.status) {
        case "incorrect-token": {
          return HTTPResponses.UNAUTHORISED;
        }
        case "incorrect-scope": {
          return HTTPResponses.FORBIDDEN;
        }
        case "missing-identity-id": {
          return HTTPResponses.INVALID_REQUEST;
        }
        case "success": {
          userId = resolution.userId as string;
          break;
        }
      }
    }

    const userSubscriptionIds = await getUserSubscriptionIds(userId);
    const subscriptionStatuses = await getSubscriptions(userSubscriptionIds);

    return { statusCode: 200, body: JSON.stringify(subscriptionStatuses) };
  } catch (error) {
    console.log(`Error retrieving user subscriptions: ${error}`);
    return HTTPResponses.INTERNAL_ERROR;
  }
}
