import * as fs from "fs";

import path from 'path';

if(process.argv.length == 4) {
    let rawPayload = fs.readFileSync(`mobile-purchases-payload/${process.argv[3]}`)
    import(path.resolve(__dirname, process.argv[2])).then( module => {
        module.handler(JSON.parse(rawPayload.toString()))
            .then((res: any) => {
                console.log(`Completed: result: ${JSON.stringify(res)}`)
             })
    })
   .catch(
       error => {
           console.log(`Error: ${error}`)
           throw error
       }
   )
}
else {
    console.log("Please run  tsc && node ./tsc-target/src/test-launcher/test-launcher.js <../module/path> <payload-filename> ")
}
