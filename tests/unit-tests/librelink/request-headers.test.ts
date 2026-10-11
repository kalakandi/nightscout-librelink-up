import "jest";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import {default as loginSuccessResponse} from "../../data/login.json";
import {default as connectionsResponse} from "../../data/connections.json";
import {default as graphResponse} from "../../data/graph.json";

const LOGIN_URL = "https://api-eu.libreview.io/llu/auth/login";
const CONNECTIONS_URL = "https://api-eu.libreview.io/llu/connections";
const NIGHTSCOUT_ENTRIES_URL = "http://localhost:1337/api/v1/entries";

// The app starts a single-shot run when it is imported, so every mock is registered before the import (in beforeAll).
process.env.LINK_UP_USERNAME = "test@example.com";
process.env.LINK_UP_PASSWORD = "test-password";

const mock = new MockAdapter(axios);
mock.onPost(LOGIN_URL).reply(200, loginSuccessResponse);
mock.onGet(CONNECTIONS_URL).reply(200, connectionsResponse);
mock.onGet(CONNECTIONS_URL + "/7ad66b40-ba9b-401e-9845-4f49f998cf16/graph").reply(200, graphResponse);
mock.onGet(NIGHTSCOUT_ENTRIES_URL + "?count=1").reply(200, []);
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

describe("LibreLink Up request headers", () =>
{
    let app: typeof import("../../../src");

    beforeAll(async () =>
    {
        app = await import("../../../src");
        await waitFor(() => mock.history.post.some(request => request.url === NIGHTSCOUT_ENTRIES_URL));
        await new Promise(resolve => setImmediate(resolve));
    });

    it("sends authenticated requests with the bearer token and account id", () =>
    {
        const connections = mock.history.get.find(request => request.url === CONNECTIONS_URL);
        expect(String(connections?.headers?.Authorization)).toMatch(/^Bearer .{20,}/);
        expect(String(connections?.headers?.["account-id"])).toMatch(/^[0-9a-f]{64}$/);
    });

    it("does not send the previous session's token or account id when logging in again", async () =>
    {
        mock.resetHistory();

        await app.login();

        const login = mock.history.post.find(request => request.url === LOGIN_URL);
        expect(login).toBeDefined();
        expect(login?.headers?.Authorization).toBeUndefined();
        expect(login?.headers?.["account-id"]).toBeFalsy();
    });
});
