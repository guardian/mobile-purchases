// Set environment variables that Guardian CDK might expect
process.env.AWS_REGION = 'eu-west-1';
process.env.Stage = 'TEST';
process.env.Stack = 'mobile';
process.env.App = 'mobile-purchases';

jest.mock("@guardian/cdk/lib/constants/tracking-tag", () => ({
	TrackingTag: {
		Value: "TEST"
	}
}));
