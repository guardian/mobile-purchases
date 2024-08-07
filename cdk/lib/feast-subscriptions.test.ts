import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {FeastAndroidSubscriptions} from "./feast-android-subscriptions";
//import { CloudwatchLogsManagement } fro;

describe('The FeastAndroidSubscriptions stack', () => {
    it('matches the snapshot', () => {
        const app = new App();
        const codeStack = new FeastAndroidSubscriptions(app, 'feast-subscriptions-CODE',{ stack: 'mobile', stage: 'CODE' });
        const prodStack = new FeastAndroidSubscriptions(app, 'feast-subscriptions-PROD',{ stack: 'mobile', stage: 'PROD' });

        expect(Template.fromStack(codeStack).toJSON()).toMatchSnapshot();
        expect(Template.fromStack(prodStack).toJSON()).toMatchSnapshot();
    });
});