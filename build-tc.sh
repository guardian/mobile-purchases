#!/bin/bash
set -e

npm install -g yarn

mkdir -p tsc-target

yarn install
yarn run clean

# Will place .js files in tsc-target
yarn run build

yarn run test

cp package.json tsc-target/

cd tsc-target

# Create the .zip which will be uploaded to AWS
zip -r mobile-purchases-google.zip . -i /google/src/*.js

# Ensure node_modules (which are required by the lambdas at runtime) are included in the .zip
yarn install --production
zip -u -r mobile-purchases-google.zip node_modules/*