#!/bin/sh

set -e

yarn clean
yarn install --frozen-lockfile
yarn validate
yarn build

cd dist

# maintenance: please maintain alphabetical order
HANDLERS=(
    "apple-fetch-offer-details"
    "apple-link-user-subscription"
    "apple-pubsub"
    "apple-revalidate-receipts"
    "apple-subscription-status"
    "apple-update-subscriptions"
    "delete-user-subscription"
    "export-historical-data"
    "export-subscription-events-table"
    "export-subscription-table-v2"
    "export-subscription-tables"
    "feast-acquisition-events-router"
    "feast-apple-acquisition-events"
    "feast-apple-pubsub"
    "feast-apple-update-subscriptions"
    "feast-google-acquisition-events"
    "feast-google-pubsub"
    "feast-google-update-subscriptions"
    "soft-opt-in-acquisitions"
    "soft-opt-in-acquisitions-dlq-processor"
    "googleoauth2"
    "google-pubsub"
    "google-link-user-subscription"
    "google-subscription-status"
    "google-update-subscriptions"
    "user-subscriptions"
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
