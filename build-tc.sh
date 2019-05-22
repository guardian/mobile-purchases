#!/bin/bash
set -e

npm install -g yarn

mkdir -p tsc-target

yarn install
# Will place .js files in target
yarn run clean
yarn run build

#yarn run test

cp package.json tsc-target/

pushd tsc-target
# Ensures the RiffRaff package has the node_modules needed to run
yarn install --production
popd

cd tsc-target/google
zip ../mobile-purchases-google.zip *.js