import { withEnv } from './withEnv';

describe('withEnv', () => {
	it('restores the environment when the callback throws', async () => {
		delete process.env.LEAKY_KEY;
		await expect(
			withEnv({ LEAKY_KEY: 'value' }, async () => {
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');
		expect(process.env.LEAKY_KEY).toBeUndefined();
	});

	it('restores a pre-existing value after the callback', async () => {
		process.env.LEAKY_KEY = 'original';
		await withEnv({ LEAKY_KEY: 'override' }, async () => {
			expect(process.env.LEAKY_KEY).toBe('override');
		});
		expect(process.env.LEAKY_KEY).toBe('original');
		delete process.env.LEAKY_KEY;
	});
});
