import * as restm from "typed-rest-client/RestClient";

export const restClient = new restm.RestClient('guardian-mobile-purchases', undefined,undefined, {socketTimeout: 10000});