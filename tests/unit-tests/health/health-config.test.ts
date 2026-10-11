import "jest";
import readConfig from "../../../src/config";

describe("Health export config", () =>
{
    const originalEnv = process.env;
    let log: jest.SpyInstance;

    beforeEach(() =>
    {
        process.env = {
            ...originalEnv,
            NIGHTSCOUT_URL: "example.com",
            HEALTH_EXPORT_ENABLED: "true",
            HEALTH_EXPORT_TOKEN: "secret",
            SINGLE_SHOT: "false",
        };
        log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() =>
    {
        process.env = originalEnv;
        log.mockRestore();
    });

    it("is disabled by default and needs no token", () =>
    {
        process.env = {...originalEnv, NIGHTSCOUT_URL: "example.com", SINGLE_SHOT: "false"};
        const config = readConfig();
        expect(config.healthExportEnabled).toBe(false);
        expect(log).not.toHaveBeenCalled();
    });

    it("uses sensible defaults when enabled", () =>
    {
        const config = readConfig();
        expect(config.healthExportEnabled).toBe(true);
        expect(config.healthExportPort).toBe(8787);
        expect(config.healthExportUnit).toBe("mg/dL");
        expect(log).not.toHaveBeenCalled();
    });

    it("requires a token when enabled", () =>
    {
        delete process.env.HEALTH_EXPORT_TOKEN;
        readConfig();
        expect(log).toHaveBeenCalledWith(expect.stringContaining("HEALTH_EXPORT_TOKEN"));
    });

    it("rejects an unknown unit", () =>
    {
        process.env.HEALTH_EXPORT_UNIT = "mmol";
        readConfig();
        expect(log).toHaveBeenCalledWith(expect.stringContaining("HEALTH_EXPORT_UNIT"));
    });

    it.each(["8787abc", "0", "70000", "1.5"])("rejects the invalid port %s", (port) =>
    {
        process.env.HEALTH_EXPORT_PORT = port;
        readConfig();
        expect(log).toHaveBeenCalledWith(expect.stringContaining("HEALTH_EXPORT_PORT"));
    });

    it("accepts a valid port", () =>
    {
        process.env.HEALTH_EXPORT_PORT = "9000";
        expect(readConfig().healthExportPort).toBe(9000);
        expect(log).not.toHaveBeenCalled();
    });

    it("cannot be combined with SINGLE_SHOT", () =>
    {
        process.env.SINGLE_SHOT = "true";
        readConfig();
        expect(log).toHaveBeenCalledWith(expect.stringContaining("SINGLE_SHOT"));
    });
});
