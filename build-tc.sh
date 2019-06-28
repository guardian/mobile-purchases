#!/bin/bash
set -e

export NODE_OPTIONS="--max-old-space-size=2048"

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
donehttps://www.google.com/url?sa=t&rct=j&q=&esrc=s&source=web&cd=1&ved=2ahUKEwiC_dfO_YvjAhVCZcAKHYGADI8QrAIoATAAegQIBRAJ&url=https%3A%2F%2Fstackoverflow.com%2Fquestions%2F26479815%2Fhow-can-i-git-add-a-folder-but-none-of-its-contents&usg=AOvVaw0LEgAvWuLjGND8PaMa9HQn