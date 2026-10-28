# Mobile Purchases

The Mobile Purchases API System (MPAPI) is a collection of software functions that keep track of IAP purchases within the Live and Feast apps and surface information about these to other downstream systems.

## Local Development

### Node

Make sure that you are using the Node version specified by the `.nvmrc` file. We recommend [`fnm`](https://github.com/Schniz/fnm) as the Node version manager.

1. Install `yarn`: `npm install -g yarn`
2. Run `yarn` to install dependencies
3. Run local tests: `yarn test`

### Linting

We have the commands 
- `yarn lint:check`
- `yarn lint:fix`
- `yarn format:check`
- `yarn format:fix`

### Data

There are three Dynamo DB tables:

- **Events** (`mobile-purchases-<stage>-subscription-events-v2`): This table records events as they are received from Google and Apple.
- **Subscriptions** (`mobile-purchases-<stage>-subscriptions`): This table records subscriptions held by our users. It contains information such as start date, expiration date, type of subscription and whether it will automatically renew at the end of its validity.
- **UserSubscriptions** (`mobile-purchases-<stage>-user-subscriptions`): This table records the link between a User (as defined by the Guardian) and a subscription.

These tables are exported daily to the datalake.

### Documentation Portal

See [Documentation Portal](docs/README.md).
