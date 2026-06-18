
The purpose of this lambda is essentially to write the S3 file 

```
[mobile] [S3] /gu-mobile-access-tokens/PROD/google-play-developer-api/access_token.json
```

Which contains a JSON object of the form 

```
{
    "token":"[REMOVED]",
    "expiry":"Thu Jun 18 11:54:00 UTC 2026"
}
```

The token is a bearer token used by a certain number of services which know to find it there. 
