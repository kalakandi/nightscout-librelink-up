import "jest";
import {getUtcDateFromString, mapTrendArrow, redactHeaders} from "../../../src/helpers/helpers";

describe("Helpers", () => {
    it("Redacting credential headers for logging", async () =>
    {
        const headers = {
            "User-Agent": "test-agent",
            "Authorization": "Bearer secret-token",
            "account-id": "abc123",
            "API-SECRET": "hunter2",
            "version": "4.16.0",
        };

        expect(redactHeaders(headers)).toEqual({
            "User-Agent": "test-agent",
            "Authorization": "[REDACTED]",
            "account-id": "[REDACTED]",
            "API-SECRET": "[REDACTED]",
            "version": "4.16.0",
        });
        // The original object must stay untouched, because it is used for real requests.
        expect(headers.Authorization).toBe("Bearer secret-token");
    });

    it("Mapping Trend Arrows from LibreLink Up to Nightscout", async () =>
    {
        expect(mapTrendArrow(1)).toBe("SingleDown");
        expect(mapTrendArrow(2)).toBe("FortyFiveDown");
        expect(mapTrendArrow(3)).toBe("Flat");
        expect(mapTrendArrow(4)).toBe("FortyFiveUp");
        expect(mapTrendArrow(5)).toBe("SingleUp");
        expect(mapTrendArrow(0)).toBe("NOT COMPUTABLE");
    });

    it("Converting LibreLink Up timestamp to UTC epoch time", async () =>
    {
        const sampleFactoryTimestamp = "12/30/2022 4:42:41 PM";
        const utcDateFromString = getUtcDateFromString(sampleFactoryTimestamp);
        expect(utcDateFromString.getTime()).toBe(1672418561000);
    });
});
