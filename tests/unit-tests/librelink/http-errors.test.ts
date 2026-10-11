import "jest";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import {default as loginSuccessResponse} from "../../data/login.json";
import {default as connectionsResponse} from "../../data/connections.json";
import {default as graphResponse} from "../../data/graph.json";

const CONNECTIONS_URL = "https://api-eu.libreview.io/llu/connections";
const GRAPH_URL = "https://api-eu.libreview.io/llu/connections/7ad66b40-ba9b-401e-9845-4f49f998cf16/graph";

// The app starts a single-shot run as soon as it is imported (see tests/setup.js). To keep that run off the
// real network, every mock is registered first and the app is imported afterwards, in beforeAll.
process.env.LINK_UP_USERNAME = "test@example.com";
process.env.LINK_UP_PASSWORD = "test-password";

const mock = new MockAdapter(axios);
mock.onPost("https://api-eu.libreview.io/llu/auth/login").reply(200, loginSuccessResponse);
mock.onGet(CONNECTIONS_URL).reply(200, connectionsResponse);
mock.onGet(GRAPH_URL).reply(200, graphResponse);
mock.onGet("http://localhost:1337/api/v1/entries?count=1").reply(200, []);
mock.onPost("http://localhost:1337/api/v1/entries").reply(200, {});

let app: typeof import("../../../src");

const waitFor = async (condition: () => boolean, timeoutMs = 5000) =>
{
    const start = Date.now();
    while (!condition())
    {
        if (Date.now() - start > timeoutMs)
        {
            throw new Error("Timed out waiting for the startup run to finish");
        }
        await new Promise(resolve => setTimeout(resolve, 20));
    }
};

describe("HTTP error handling", () =>
{
    beforeAll(async () =>
    {
        app = await import("../../../src");
        // The upload is the last step of the run started on import, so once it happened the app holds a ticket.
        await waitFor(() => mock.history.post.some(request => request.url === "http://localhost:1337/api/v1/entries"));
        await new Promise(resolve => setImmediate(resolve));
    });

    afterEach(() =>
    {
        jest.restoreAllMocks();
    });

    it("does not write the bearer token to the debug log", async () =>
    {
        // Runs first on purpose: a failed request later clears the auth ticket held by the app.
        const token = loginSuccessResponse.data.authTicket.token;
        const debugLog = jest.spyOn(app.logger, "debug").mockImplementation(() => app.logger);

        await app.getLibreLinkUpConnection();

        const logged = debugLog.mock.calls.map(call => String(call[0])).join("\n");
        expect(logged).toContain("authenticatedHttpHeaders");
        expect(logged).toContain("[REDACTED]");
        expect(logged).not.toContain(token);
    });

    it("lets failed HTTP calls reject instead of resolving with the error", async () =>
    {
        mock.onGet("https://example.test/fail").reply(500, {message: "upstream exploded"});
        jest.spyOn(app.logger, "error").mockImplementation(() => app.logger);

        await expect(axios.get("https://example.test/fail")).rejects.toMatchObject({
            response: {status: 500},
        });
    });

    it("reports the real cause when fetching the connection fails with a 500", async () =>
    {
        mock.onGet(CONNECTIONS_URL).reply(500, {message: "upstream exploded"});
        const errorLog = jest.spyOn(app.logger, "error").mockImplementation(() => app.logger);

        const connectionId = await app.getLibreLinkUpConnection();
        mock.onGet(CONNECTIONS_URL).reply(200, connectionsResponse);

        expect(connectionId).toBeNull();
        const messages = (errorLog.mock.calls as unknown[][]).map(call => String((call[1] as Error | undefined)?.message ?? call[0]));
        expect(messages.some(m => m.includes("status code 500"))).toBe(true);
        expect(messages.some(m => m.includes("reading 'data'"))).toBe(false);
    });

});
