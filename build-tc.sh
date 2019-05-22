#!/bin/bash
set -e

npm install -g yarn

mkdir -p target

yarn install
# Will place .js files in target
yarn run clean
yarn run build

#yarn run test

cp package.json target/

pushd target
# Ensures the RiffRaff package has the node_modules needed to run
yarn install --production
popd

zip target/google.zip target/google/*.js