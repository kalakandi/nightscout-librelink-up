import "jest";
import {AddressInfo, connect} from "node:net";
import {Server} from "node:http";
import {Direction} from "../../../src/nightscout/interface";
import {convertGlucose, ReadingBuffer, toHealthSamples} from "../../../src/health/samples";
import {createHealthServer} from "../../../src/health/server";

type Payload = {unit: string, samples: {value: number}[]};

const entry =(iso: string, sgv: number, direction?: Direction) => ({date: new Date(iso), sgv, direction});

describe("Health samples", () =>
{
    it("converts mg/dL to mmol/L with one decimal", () =>
    {
        expect(convertGlucose(180, "mmol/L")).toBe(10);
        expect(convertGlucose(100, "mmol/L")).toBe(5.5);
        expect(convertGlucose(99.6, "mg/dL")).toBe(100);
    });

    it("sorts samples oldest first and keeps the trend", () =>
    {
        const samples = toHealthSamples([
            entry("2026-01-01T10:05:00Z", 120, Direction.Flat),
            entry("2026-01-01T10:00:00Z", 110),
        ], "mg/dL");

        expect(samples.map(s => s.value)).toEqual([110, 120]);
        expect(samples[0]).not.toHaveProperty("trend");
        expect(samples[1].trend).toBe("Flat");
        expect(samples[1].timestamp).toBe("2026-01-01T10:05:00.000Z");
    });

    it("only returns samples newer than 'since'", () =>
    {
        const samples = toHealthSamples([
            entry("2026-01-01T10:00:00Z", 110),
            entry("2026-01-01T10:05:00Z", 120),
        ], "mg/dL", new Date("2026-01-01T10:00:00Z"));

        expect(samples.map(s => s.value)).toEqual([120]);
    });
});

describe("ReadingBuffer", () =>
{
    it("de-duplicates by timestamp", () =>
    {
        const buffer = new ReadingBuffer();
        buffer.add([entry("2026-01-01T10:00:00Z", 110)]);
        buffer.add([entry("2026-01-01T10:00:00Z", 110)]);
        expect(buffer.all()).toHaveLength(1);
    });

    it("drops the oldest readings beyond its max size", () =>
    {
        const buffer = new ReadingBuffer(2);
        buffer.add([
            entry("2026-01-01T10:10:00Z", 120),
            entry("2026-01-01T10:00:00Z", 100),
            entry("2026-01-01T10:05:00Z", 110),
        ]);
        expect(buffer.all().map(e => e.sgv).sort()).toEqual([110, 120]);
    });
});

describe("Health server", () =>
{
    let server: Server;
    let base: string;

    beforeAll(async () =>
    {
        const buffer = new ReadingBuffer();
        buffer.add([entry("2026-01-01T10:00:00Z", 180), entry("2026-01-01T10:05:00Z", 90)]);
        server = createHealthServer({token: "secret", unit: "mmol/L", buffer});
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

    const get = (path: string, token?: string) =>
        fetch(base + path, {headers: token ? {Authorization: `Bearer ${token}`} : {}});

    it("rejects requests without the right token", async () =>
    {
        expect((await get("/readings")).status).toBe(401);
        expect((await get("/readings", "wrong")).status).toBe(401);
    });

    it("returns samples in the configured unit", async () =>
    {
        const res = await get("/readings", "secret");
        expect(res.status).toBe(200);
        const body = await res.json() as Payload;
        expect(body.unit).toBe("mmol/L");
        expect(body.samples.map(s => s.value)).toEqual([10, 5]);
    });

    it("supports the 'since' filter and rejects invalid ones", async () =>
    {
        const filtered = await (await get("/readings?since=2026-01-01T10:00:00Z", "secret")).json() as Payload;
        expect(filtered.samples).toHaveLength(1);
        expect((await get("/readings?since=nope", "secret")).status).toBe(400);
    });

    it("answers a malformed request line with 400 instead of crashing", async () =>
    {
        const port = (server.address() as AddressInfo).port;
        const response = await new Promise<string>((resolve, reject) =>
        {
            const socket = connect(port, "127.0.0.1", () => socket.write("GET //[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"));
            let data = "";
            socket.on("data", chunk => data += chunk);
            socket.on("end", () => resolve(data));
            socket.on("error", reject);
        });
        expect(response).toContain("400");
        expect((await get("/readings", "secret")).status).toBe(200);
    });

    it("returns 404 for unknown paths", async () =>
    {
        expect((await get("/other", "secret")).status).toBe(404);
    });
});
