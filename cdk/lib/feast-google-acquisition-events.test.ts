import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {FeastGoogleAcquisitionEvents} from "./feast-google-acquisition-events";

describe('The FeastGoogleAcquisitionEvents stack', () => {
    it('matches the snapshot', () => {
        const app = new App();
        const codeStack = new FeastGoogleAcquisitionEvents(app, 'feast-google-acquisition-events-CODE',{ stack: 'mobile', stage: 'CODE' });
        const prodStack = new FeastGoogleAcquisitionEvents(app, 'feast-google-acquisition-events-PROD',{ stack: 'mobile', stage: 'PROD' });

        expect(Template.fromStack(codeStack).toJSON()).toMatchSnapshot();
        expect(Template.fromStack(prodStack).toJSON()).toMatchSnapshot();
    });
});