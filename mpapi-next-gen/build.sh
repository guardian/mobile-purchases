#!/bin/sh

set -e

yarn clean
yarn install
yarn validate
yarn build

cd dist

# maintenance: please maintain alphabetical order
HANDLERS=(
    "apple-subscription-status"
    "apple-update-subscriptions"
    "delete-user-subscription"
    "export-historical-data"
    "export-subscription-events-table"
    "export-subscription-table-v2"
    "soft-opt-in-acquisitions"
    "soft-opt-in-acquisitions-dlq-processor"
    "googleoauth2"
    "google-subscription-status"
    "google-update-subscriptions"
)

for HANDLER in "${HANDLERS[@]}"; do
    mkdir -p "${HANDLER}_tmp"
    cp "${HANDLER}.js" "${HANDLER}_tmp/"
    cp -r ../node_modules "${HANDLER}_tmp/"
    pushd "${HANDLER}_tmp" > /dev/null
    zip -r "../${HANDLER}.zip" .
    popd > /dev/null
    rm -rf "${HANDLER}_tmp"
done
