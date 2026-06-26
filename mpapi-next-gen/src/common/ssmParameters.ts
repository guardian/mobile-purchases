import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { App, Stack, Stage } from './appIdentity';

const ssmClient = new SSMClient({
	region: process.env.AWS_REGION || 'us-east-1',
});

export async function getParameterValue(
	parameterName: string,
): Promise<string> {
	/*
        the input value `parameterName` is expected to be the full name in AWS
        for instance:
        `/mobile-purchases/${Stage}/google-oauth-lambda/google.serviceAccountJson`
    */

	try {
		const command = new GetParameterCommand({
			Name: parameterName,
			WithDecryption: true,
		});

		const response = await ssmClient.send(command);

		if (!response.Parameter?.Value) {
			throw new Error('[df35dc74] no credentials found in SSM');
		}

		return response.Parameter.Value;
	} catch (error) {
		console.error('[5446b6c6] error retrieving credentials from SSM:', error);
		throw error;
	}
}

export async function getParameterValueUsingAppStageStackConvention<A>(
	key: string,
): Promise<A> {
	// This function was introduced to help migrating the old
	// getConfigValue<A>(key: string, defaultValue?: A): Promise<A>
	// from the legacy code.
	// We will get rid of it later on.
	const parameterName = `/${App}/${Stage}/${Stack}/${key}`;
	const value = await getParameterValue(parameterName);
	return value as A;
}
