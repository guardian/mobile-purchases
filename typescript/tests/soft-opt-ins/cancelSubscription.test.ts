import {dateToSecondTimestamp, thirtyMonths, optionalMsToDate} from "../../src/utils/dates";


describe("The thirtyMonths function", () => {
	test("Should add thrity months", () => {
		const result = thirtyMonths(new Date(Date.UTC(2019, 0, 1)));
		expect(result).toStrictEqual(new Date(Date.UTC(2021, 6, 1)));
	})
});