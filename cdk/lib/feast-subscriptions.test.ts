import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {FeastSubscriptions} from "./feast-subscriptions";
//import { CloudwatchLogsManagement } fro;

describe('The FeastSubscriptions stack', () => {
    it('matches the snapshot', () => {
        const app = new App();
        const codeStack = new FeastSubscriptions(app, 'feast-subscriptions-CODE',{ stack: 'mobile', stage: 'CODE' });
        const prodStack = new FeastSubscriptions(app, 'feast-subscriptions-PROD',{ stack: 'mobile', stage: 'PROD' });

        expect(Template.fromStack(codeStack).toJSON()).toMatchSnapshot();
        expect(Template.fromStack(prodStack).toJSON()).toMatchSnapshot();
    });
});