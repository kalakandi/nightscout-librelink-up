import "jest";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import {default as loginSuccessResponse} from "../../data/login.json";
import {default as connectionsResponse} from "../../data/connections.json";
import {default as graphResponse} from "../../data/graph.json";
import {default as entriesResponse} from "../../data/entries.json";

const NIGHTSCOUT_ENTRIES_URL = "http://localhost:1337/api/v1/entries";

// Importing the app starts a single-shot run (see tests/setup.js). Every mock is registered first and the app is
// imported afterwards, in beforeAll, so that run stays off the real network.
process.env.LINK_UP_USERNAME = "test@example.com";
process.env.LINK_UP_PASSWORD = "test-password";
process.env.HEALTH_EXPORT_ENABLED = "true";
process.env.HEALTH_EXPORT_TOKEN = "test-token";
process.env.HEALTH_EXPORT_PORT = String(20000 + Math.floor(Math.random() * 20000));

const mock = new MockAdapter(axios);
mock.onPost("https://api-eu.libreview.io/llu/auth/login").reply(200, loginSuccessResponse);
mock.onGet("https://api-eu.libreview.io/llu/connections").reply(200, connectionsResponse);
mock.onGet("https://api-eu.libreview.io/llu/connections/7ad66b40-ba9b-401e-9845-4f49f998cf16/graph").reply(200, graphResponse);
// Nightscout already has part of the data, so only the newer readings are uploaded to it.
mock.onGet(NIGHTSCOUT_ENTRIES_URL + "?count=1").reply(200, entriesResponse);
mock.onPost(NIGHTSCOUT_ENTRIES_URL).reply(200, {});

const waitFor = async (condition: () => boolean, timeoutMs = 5000) =>
{
    const start = Date.now();
    while (!condition())
    {
        if (Date.now() - start > timeoutMs)
        {
            throw new Error("Timed out waiting for the startup run to upload to Nightscout");
        }
        await new Promise(resolve => setTimeout(resolve, 20));
    }
};

describe("Health export wiring", () =>
{
    let app: typeof import("../../../src");
    let log: jest.SpyInstance;

    beforeAll(async () =>
    {
        // Config validation reports the SINGLE_SHOT conflict from tests/setup.js; it is irrelevant here.
        log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        app = await import("../../../src");
        await waitFor(() => mock.history.post.some(request => request.url === NIGHTSCOUT_ENTRIES_URL));
        await new Promise(resolve => setImmediate(resolve));
    });

    afterAll(async () =>
    {
        log.mockRestore();
        await new Promise<void>(resolve => app.healthServer ? app.healthServer.close(() => resolve()) : resolve());
    });

    it("sends only the readings Nightscout does not have yet to Nightscout", () =>
    {
        const upload = mock.history.post.find(request => request.url === NIGHTSCOUT_ENTRIES_URL);
        expect(JSON.parse(upload?.data)).toHaveLength(112);
    });

    it("gives the health export every reading, regardless of what Nightscout already has", () =>
    {
        expect(app.healthBuffer.all()).toHaveLength(142);
    });
});
