import { dateToSecondTimestamp, optionalMsToDate, thirtyMonths } from '../../src/utils/dates';

describe('The thirtyMonths function', () => {
    test('Should add thrity months', () => {
        const result = thirtyMonths(new Date(Date.UTC(2019, 0, 1)));
        expect(result).toStrictEqual(new Date(Date.UTC(2021, 6, 1)));
    });
});

describe('The dateToSecondTimestamp function', () => {
    test('Should get the timestamp to the second', () => {
        const result = dateToSecondTimestamp(new Date(Date.UTC(2019, 0, 1)));
        expect(result).toStrictEqual(1546300800);
    });
    test('Should get the timestamp rounded up to the next second', () => {
        const result = dateToSecondTimestamp(new Date(Date.UTC(2019, 0, 1, 0, 0, 0, 32)));
        expect(result).toStrictEqual(1546300801);
    });
});

describe('The optionalMsToDate function', () => {
    test('Should handle null or undefined', () => {
        expect(optionalMsToDate(null)).toEqual(null);
        expect(optionalMsToDate(undefined)).toEqual(null);
    });
    test('Should handle invalid strings', () => {
        expect(optionalMsToDate('abc')).toEqual(null);
    });
    test('Should convert numbers to timestamps', () => {
        expect(optionalMsToDate('12345')).toEqual(new Date(12345));
    });
});
