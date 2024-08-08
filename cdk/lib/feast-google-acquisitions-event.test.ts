import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {FeastGoogleAcquisitionsEvent } from "./feast-google-acquisitions-event";

describe('The FeastAndroidSubscriptions stack', () => {
    it('matches the snapshot', () => {
        const app = new App();
        const codeStack = new FeastGoogleAcquisitionsEvent(app, 'feast-subscriptions-CODE',{ stack: 'mobile', stage: 'CODE' });
        const prodStack = new FeastGoogleAcquisitionsEvent(app, 'feast-subscriptions-PROD',{ stack: 'mobile', stage: 'PROD' });

        expect(Template.fromStack(codeStack).toJSON()).toMatchSnapshot();
        expect(Template.fromStack(prodStack).toJSON()).toMatchSnapshot();
    });
});