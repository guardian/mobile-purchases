// Author: Pascal
// This file was introduced in July 2025 to implement the service that queries the Google API
// to retrieve subscription and subscription product metadata in order to populate
// the `extra` field for android records.

// -----------------------------------------------

export async function build_extra_string(stage: string): Promise<string> {
    // stage is going to be used to retrieve the token from S3
    const extra = `(work in progress)`;
    return Promise.resolve(extra);
}
