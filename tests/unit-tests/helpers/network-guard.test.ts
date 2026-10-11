import "jest";
import axios from "axios";

describe("Test network guard", () =>
{
    it("fails requests that no mock handles instead of reaching the real network", async () =>
    {
        await expect(axios.get("https://api-eu.libreview.io/llu/connections")).rejects.toThrow(
            "Unmocked HTTP request in test: GET https://api-eu.libreview.io/llu/connections");
    });
});
