#!/bin/bash
set -e

export NODE_OPTIONS="--max-old-space-size=4096"

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