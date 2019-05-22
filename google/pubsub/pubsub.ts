

const secret = process.env.Secret;

export function handler(request: any) {
    console.log("hello world");
    console.log(request.body);
    if (request.queryStringParameters.secret === secret) {
        console.log("Correct")
    }
}


