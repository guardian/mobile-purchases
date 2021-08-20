import "source-map-support/register";
import { aws } from "../utils/aws";
import { plusDays } from "../utils/dates";

function prefix_creator(): string {
  const yesterday = plusDays(new Date(), -1).toISOString().substr(0, 10);
  return `v2/data/date=${yesterday}`;
}

export async function handler(): Promise<string> {
  const bucket = process.env["ExportBucket"];
  const S3BucketOwner = process.env["S3BucketOwner"];
  const account = process.env["AccountId"];
  const app = process.env["App"];
  const stage = process.env["Stage"];
  const className = process.env["ClassName"];

  let tableArn = null;
  switch (className) {
    case "subscriptions":
      console.log("Reading subscription from subscriptions");
      tableArn = `arn:aws:dynamodb:eu-west-1:${account}:table/${app}-${stage}-${className}`;
      break;
    case "user-subscriptions":
      console.log("Reading user subscription from user subscription");
      tableArn = `arn:aws:dynamodb:eu-west-1:${account}:table/${app}-${stage}-${className}`;
      break;
    default:
      throw new Error(`Invalid ClassName value ${className}`);
  }

  if (!bucket) throw new Error("Variable ExportBucket must be set");
  if (!tableArn) throw new Error("Variable TableArn must be set");
  if (!S3BucketOwner) throw new Error("Variable S3BucketOwner must be set");

  const params = {
    TableArn: tableArn,
    S3Bucket: bucket,
    S3BucketOwner: S3BucketOwner,
    S3Prefix: prefix_creator(),
    ExportFormat: "DYNAMODB_JSON",
  };

  return aws.exportTableToPointInTime(params)
      .promise()
      .then(result => {
        console.log(`Exporting subscription data to ${bucket}`);
        return `Dynamo export started, with status: ${result.ExportDescription?.ExportStatus}`;
      }
  ).catch(err => {
    throw new Error("Failed to start dynamo export");
  });
}
