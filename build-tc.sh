#!/bin/bash
set -e

npm install -g yarn

mkdir -p tsc-target

yarn install

yarn run clean

yarn run test

# Will place .js files in tsc-target
yarn run build

cd tsc-target

for BUNDLE in *.js
do
    zip "${BUNDLE%.*}.zip" "$BUNDLE"
done