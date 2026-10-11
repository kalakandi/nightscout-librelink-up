/**
 * Conversion of glucose entries into Apple Health friendly samples.
 *
 * SPDX-License-Identifier: MIT
 */
import {Entry} from "../nightscout/interface";

export type GlucoseUnit = "mg/dL" | "mmol/L";

export interface HealthSample
{
    timestamp: string;
    value: number;
    unit: GlucoseUnit;
    trend?: string;
}

const MG_DL_PER_MMOL_L = 18.0182;

export function isGlucoseUnit(value: string): value is GlucoseUnit
{
    return value === "mg/dL" || value === "mmol/L";
}

export function convertGlucose(mgPerDl: number, unit: GlucoseUnit): number
{
    if (unit === "mmol/L")
    {
        return Math.round((mgPerDl / MG_DL_PER_MMOL_L) * 10) / 10;
    }
    return Math.round(mgPerDl);
}

export function toHealthSamples(entries: Entry[], unit: GlucoseUnit, since?: Date): HealthSample[]
{
    return entries
        .filter(entry => since === undefined || entry.date > since)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map(entry => ({
            timestamp: entry.date.toISOString(),
            value: convertGlucose(entry.sgv, unit),
            unit,
            ...(entry.direction ? {trend: entry.direction} : {}),
        }));
}

/**
 * Bounded in-memory store of recent readings, de-duplicated by timestamp.
 */
export class ReadingBuffer
{
    private readings: Map<number, Entry> = new Map();

    constructor(private readonly maxSize: number = 1000)
    {
    }

    add(entries: Entry[]): void
    {
        for (const entry of entries)
        {
            this.readings.set(entry.date.getTime(), entry);
        }

        if (this.readings.size > this.maxSize)
        {
            const newestFirst = [...this.readings.keys()].sort((a, b) => b - a);
            for (const key of newestFirst.slice(this.maxSize))
            {
                this.readings.delete(key);
            }
        }
    }

    all(): Entry[]
    {
        return [...this.readings.values()];
    }
}
