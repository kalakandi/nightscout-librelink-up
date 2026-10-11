import "jest";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import {getLibreLinkUpConnection, logger} from "../../../src";
import {default as loginSuccessResponse} from "../../data/login.json";
import {default as connectionsResponse} from "../../data/connections.json";

const CONNECTIONS_URL = "https://api-eu.libreview.io/llu/connections";

// Registered right after the import, before the single-shot run started on import reaches the network,
// so that run logs in successfully and the app holds a (fake) auth ticket.
const mock = new MockAdapter(axios);
mock.onPost("https://api-eu.libreview.io/llu/auth/login").reply(200, loginSuccessResponse);
mock.onGet(CONNECTIONS_URL).reply(200, connectionsResponse);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("HTTP error handling", () =>
{
    beforeAll(async () =>
    {
        await sleep(300);
    });

    afterEach(() =>
    {
        jest.restoreAllMocks();
    });

    it("does not write the bearer token to the debug log", async () =>
    {
        // Runs first on purpose: a failed request later clears the auth ticket held by the app.
        const token = loginSuccessResponse.data.authTicket.token;
        const debugLog = jest.spyOn(logger, "debug").mockImplementation(() => logger);

        await getLibreLinkUpConnection();

        const logged = debugLog.mock.calls.map(call => String(call[0])).join("\n");
        expect(logged).toContain("authenticatedHttpHeaders");
        expect(logged).toContain("[REDACTED]");
        expect(logged).not.toContain(token);
    });

    it("lets failed HTTP calls reject instead of resolving with the error", async () =>
    {
        mock.onGet("https://example.test/fail").reply(500, {message: "upstream exploded"});
        jest.spyOn(logger, "error").mockImplementation(() => logger);

        await expect(axios.get("https://example.test/fail")).rejects.toMatchObject({
            response: {status: 500},
        });
    });

    it("reports the real cause when fetching the connection fails with a 500", async () =>
    {
        mock.onGet(CONNECTIONS_URL).reply(500, {message: "upstream exploded"});
        const errorLog = jest.spyOn(logger, "error").mockImplementation(() => logger);

        const connectionId = await getLibreLinkUpConnection();
        mock.onGet(CONNECTIONS_URL).reply(200, connectionsResponse);

        expect(connectionId).toBeNull();
        const messages = (errorLog.mock.calls as unknown[][]).map(call => String((call[1] as Error | undefined)?.message ?? call[0]));
        expect(messages.some(m => m.includes("status code 500"))).toBe(true);
        expect(messages.some(m => m.includes("reading 'data'"))).toBe(false);
    });

});
