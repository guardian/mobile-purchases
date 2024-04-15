export const withEnv = async (env: Record<string, string>, callback: () => any) => {
    const oldEnv = process.env;
    process.env = env;

    await callback();

    process.env = oldEnv;
}
