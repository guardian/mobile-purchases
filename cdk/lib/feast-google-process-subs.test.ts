import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {FeastGoogleProcessSubscriptions } from "./feast-google-process-subs";

describe('The FeastAndroidSubscriptions stack', () => {
    it('matches the snapshot', () => {
        const app = new App();
        const codeStack = new FeastGoogleProcessSubscriptions(app, 'feast-subscriptions-CODE',{ stack: 'mobile', stage: 'CODE' });
        const prodStack = new FeastGoogleProcessSubscriptions(app, 'feast-subscriptions-PROD',{ stack: 'mobile', stage: 'PROD' });

        expect(Template.fromStack(codeStack).toJSON()).toMatchSnapshot();
        expect(Template.fromStack(prodStack).toJSON()).toMatchSnapshot();
    });
});