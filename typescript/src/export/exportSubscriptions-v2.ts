import "source-map-support/register";
import { aws } from "../utils/aws";
import { plusDays } from "../utils/dates";

const stage = process.env["Stage"];

function prefix_creator(): string {
  const yesterday = plusDays(new Date(), -1).toISOString().substr(0, 10);
  if(stage == "CODE") {
    return `v2/code-data/date=${yesterday}`;
  } else {
    return `v2/data/date=${yesterday}`;
  }
}

export async function handler(): Promise<string> {
  const bucket = process.env["ExportBucket"];
  const s3BucketOwner = process.env["BucketOwner"];
  const account = process.env["AccountId"];
  const app = process.env["App"];
  const className = process.env["ClassName"];

  if (!bucket) throw new Error("Variable ExportBucket must be set");
  if (!account) throw new Error("Variable AccountId must be set");
  if (!s3BucketOwner) throw new Error("Variable BucketOwner must be set");
  if (!app) throw new Error("Variable App must be set");
  if (!stage) throw new Error("Variable Stage must be set");
  if (!className) throw new Error("Variable ClassName must be set");

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

  if (!tableArn) throw new Error("Variable TableArn must be set");

  const params = {
    TableArn: tableArn,
    S3Bucket: bucket,
    S3BucketOwner: s3BucketOwner,
    S3Prefix: prefix_creator(),
    ExportFormat: "DYNAMODB_JSON",
  };

  return aws
    .exportTableToPointInTime(params)
    .promise()
    .then((result) => {
      console.log(`Exporting subscription data to ${bucket}`);
      return `Dynamo export started, with status: ${result.ExportDescription?.ExportStatus}`;
    })
    .catch((err) => {
      throw new Error("Failed to start dynamo export");
    });
}
