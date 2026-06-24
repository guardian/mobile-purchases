#!/bin/sh

set -e

yarn clean
yarn install
yarn validate
yarn build

cd dist

for HANDLER in googleoauth2 export-subscription-table-v2 export-historical-data export-subscription-events-table; do
	mkdir -p temp_${HANDLER}
	cp ${HANDLER}.js temp_${HANDLER}/
	cp -r ../node_modules temp_${HANDLER}/
	cd temp_${HANDLER}
	zip -r "../${HANDLER}.zip" .
	cd ..
	rm -rf temp_${HANDLER}
done
