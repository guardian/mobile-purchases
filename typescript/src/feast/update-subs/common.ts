import { UserSubscription } from "../../models/userSubscription"
import { dynamoMapper } from "../../utils/aws"

export const storeUserSubscriptionInDynamo = (userSubscription: UserSubscription): Promise<void> => {
    return dynamoMapper.put({ item: userSubscription }).then(_ => {})
}
