
In this file I am going to document the calls to Apple (through api-storekit.ts) and the two currently used versions of the Google API (through google-play.ts and googleplay-v2.ts).

This is written in June 2025, as part of preparing the code for doing for the google subscriptions the work we did for the apple ones. 


```
                                              --------------------------------- /src/update-subs/apple.ts
                                             |       -------------------------- /src/update-subs/google.ts
 ----------------                            |      |
| api-storekit.ts|                           |      |
 ----------------                            |---<- | -<----------------------- /src/pubsub/apple.ts
                                             |      |-------------------------- /src/pubsub/google-common.ts
 - apple(...)FeastPipeline     <~~~~~~~~~~~~ | ~~~~ | ~~~~~~~~~~~~
                                             |      |            |
 - transactingId(...)ForExtra  <-------------       |             ~~~~~~~~~~~~~ /src/feast/acquisation-events/apple.ts
                                                    |               ----------- /src/feast/acquisation-events/google.ts
                                                    |              |
 ----------------                                   |              |
| google-play.ts |                                  |-----------<- | -<-----------
 ----------------                                   v              |              |
                                                    |               ------------/src/subscription-status/googleSubStatus.ts
- fetchGoogleSubscription      <--------------------               |
                                                                   |
                                                                   |
 ------------------                                                |
| googleplay-v2.ts |                                               |
 ------------------                                                |
                                                                   |
- fetchGoogleSubscriptionV2    <-----------------------------------

```
