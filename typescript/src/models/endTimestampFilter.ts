import { DynamoDbTable } from '@aws/dynamodb-data-mapper';
import {
  attribute,
  hashKey,
  rangeKey,
} from '@aws/dynamodb-data-mapper-annotations';
import { App, Stage } from '../utils/appIdentity';

export class Subscription {
  @hashKey()
  subscriptionId: string;

  @rangeKey()
  endTimestamp: string;

  @attribute()
  receipt?: string;

  @attribute()
  autoRenewing: boolean;

  @attribute()
  platform: string;

  constructor(
    subscriptionId: string,
    endTimestamp: string,
    autoRenewStatus: boolean,
    platform: string,
    receipt?: string,
  ) {
    this.subscriptionId = subscriptionId;
    this.endTimestamp = endTimestamp;
    this.receipt = receipt;
    this.autoRenewing = autoRenewStatus;
    this.platform = platform;
  }

  get [DynamoDbTable]() {
    return `${App}-${Stage}-subscriptions`;
  }
}

export class EndTimeStampFilterSubscription extends Subscription {
  constructor() {
    super('', '', false, '');
  }
}
