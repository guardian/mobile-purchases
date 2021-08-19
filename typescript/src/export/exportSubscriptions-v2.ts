import "source-map-support/register";
import { aws } from "../utils/aws";
import { plusDays } from "../utils/dates";
import { ExportTableToPointInTimeOutput } from "aws-sdk/clients/dynamodb";
import { AWSError } from "aws-sdk";
import { PromiseResult } from "aws-sdk/lib/request";

function prefix_creator(): string {
  const yesterday = plusDays(new Date(), -1).toISOString().substr(0, 10);
  return `v2/data/date=${yesterday}`;
}

export async function handler(): Promise<
  PromiseResult<ExportTableToPointInTimeOutput, AWSError>
> {
  const bucket = process.env["ExportBucket"];
  const tableArn = process.env["TableArn"];
  const S3BucketOwner = process.env["S3BucketOwner"];

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

  return aws.exportTableToPointInTime(params).promise();
}
