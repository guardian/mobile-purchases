CREATE EXTERNAL TABLE ddb_saved_articles_S{hiveconf:stage}
    (user_id   STRING,
     articles  STRING,
     version STRING)
  STORED BY 'org.apache.hadoop.hive.dynamodb.DynamoDBStorageHandler'
  TBLPROPERTIES(
     "dynamodb.table.name" = "mobile-save-for-later-S{hiveconf:stage}-articles",
     "dynamodb.column.mapping"="user_id:UserId,articles:articles,version:version"
  );

CREATE EXTERNAL TABLE IF NOT EXISTS saved_articles_export
 (user_id string, articles string, version string)
 ROW FORMAT DELIMITED FIELDS TERMINATED BY '\t'
 STORED AS TEXTFILE
 LOCATION 's3://gu-mobile-hive-test/test';

INSERT OVERWRITE TABLE  saved_articles_export
     select * from ddb_saved_articles_S{hiveconf:stage};


