#!/bin/bash
set -e

cd tsc-target

for BUNDLE in *.js
do
    zip "${BUNDLE%.*}.zip" "$BUNDLE"
done
