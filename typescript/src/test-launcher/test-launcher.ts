import * as fs from 'fs';
import * as process from 'process';

if (process.argv.length == 4) {
	const rawPayload = fs.readFileSync(
		`mobile-purchases-payload/${process.argv[3]}`,
	);
	import(`../${process.argv[2]}`)
		.then((module) => {
			module.handler(JSON.parse(rawPayload.toString())).then((res: unknown) => {
				console.log(`Completed: result: ${JSON.stringify(res)}`);
			});
		})
		.catch((error) => {
			console.log(`Error: ${error}`);
			throw error;
		});
} else {
	console.log(
		'Please run  tsc && node ./tsc-target/src/test-launcher/test-launcher.js <../module/path> <payload-filename> ',
	);
}
