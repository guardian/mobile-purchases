
### Introduction

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

The file is generated every 15 minutes (the lambda is generated every 15 mins) and the bearer token is valid 1 hour.

### Credentials generation

First we retrieve the information contained in SSM parameter

```
/mobile-purchases/<STAGE>/google-oauth-lambda/google.serviceAccountJson
```

```
/mobile-purchases/PROD/google-oauth-lambda/google.serviceAccountJson
```

This is a standard google service account credential object of the form

```
{
    "type": "service_account",
    "project_id": "[REMOVED]",
    "private_key_id": "[REMOVED]",
    "private_key": "[REMOVED]",
    "client_email": "[REMOVED]",
    "client_id": "[REMOVED]",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "[REMOVED]"
}
```

Then using the google auth library we get the bearer token that we can then 
write to the file access_token2.json file.

