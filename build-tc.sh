#!/bin/bash
set -e

export NODE_OPTIONS="--max-old-space-size=2048"

mkdir -p tsc-target

yarn install

yarn run clean

yarn run test

# Will place .js files in tsc-target
yarn run build
