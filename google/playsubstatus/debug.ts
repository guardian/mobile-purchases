import { handler } from './playsubstatus';

let result = handler({
    headers: {
        "Play-Purchase-Token": "hoofgeonpgdfcnjdiofeadbe.AO-J1Oz1chlwrlUQnFQDBD2J3JDFiVPXnvkG7BYSYrv9FsjdWf4yyJd76jDhorOcTUU-Zx3r2VYccNAlFGljcdvPnsglwXWivMrR9b6rE7OIg4WGdLCR1W9bFu_lQvltMnQUQlGgkZ4WYe_eTt44wml5TatT70ew8g"
    },
    pathParameters: {
        "subscriptionId": "com.guardian.subscription.monthly.10"
    }
});

result.then(JSON.stringify).then(console.log);