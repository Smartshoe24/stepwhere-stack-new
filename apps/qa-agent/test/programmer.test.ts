import { describe, expect, it } from "vitest";
import {
  buildConnectArgs,
  buildFlashArgs,
  buildIdentifyArgs,
  createLineSplitter,
  createProgressTracker,
  defaultProgrammerPaths,
  findErrorLine,
  parseProbes,
  parseTargetInfo,
  parseUid,
  parseVersion,
  sawVerified,
  splitProgrammerOutput,
  stripAnsi,
  validateAddress,
  validateProbeSerial,
} from "../src/programmer.js";

const C = "\u001b[36m\u001b[01m";
const R = "\u001b[0m";

describe("output splitting", () => {
  it("strips ANSI colour codes", () => {
    expect(stripAnsi(`${C}STM32CubeProgrammer version: 2.23.0${R}`)).toBe("STM32CubeProgrammer version: 2.23.0");
  });

  it("splits on CR and LF, drops empty lines", () => {
    const text = `${C}Line one${R}\r\n\r\nDownload in Progress:\n[====   ]  10%\r[======= ]  50%\r[========] 100%\rDone\n`;
    expect(splitProgrammerOutput(text)).toEqual([
      "Line one",
      "Download in Progress:",
      "[====   ]  10%",
      "[======= ]  50%",
      "[========] 100%",
      "Done",
    ]);
  });

  it("keeps partial lines across chunks and flushes the tail", () => {
    const lines: string[] = [];
    const splitter = createLineSplitter((l) => lines.push(l));
    splitter.push("Erasing mem");
    splitter.push("ory\nFile downl");
    expect(lines).toEqual(["Erasing memory"]);
    splitter.flush();
    expect(lines).toEqual(["Erasing memory", "File downl"]);
  });
});

describe("version and probes", () => {
  it("parses the version from coloured output", () => {
    const lines = splitProgrammerOutput(`${C}      -------------------------------------------------------------------\r\n        STM32CubeProgrammer version: 2.23.0 \r\n${R}`);
    expect(parseVersion(lines)).toBe("2.23.0");
    expect(parseVersion(["nothing"])).toBeNull();
  });

  it("returns no probes when none are plugged in", () => {
    const lines = splitProgrammerOutput(`${C}===== STLink Interface =====${R}\r\n\r\n${C}No ST-Link detected!${R}\r\n`);
    expect(parseProbes(lines)).toEqual([]);
  });

  it("parses two probes, with a missing and a -- board name", () => {
    const lines = splitProgrammerOutput(`
===== STLink Interface =====

-------- Connected ST-LINK Probes List --------

ST-Link Probe 0 :
   ST-LINK SN  : 066DFF485550755187121723
   ST-LINK FW  : V2J45M31
   Access Port Number  : 2
   Board Name  : NUCLEO-G071RB

ST-Link Probe 1 :
   ST-LINK SN  : 0030001A3133511737393935
   ST-LINK FW  : V3J12M3
   Board Name  : --
-----------------------------------------------
`);
    expect(parseProbes(lines)).toEqual([
      { serial: "066DFF485550755187121723", firmware: "V2J45M31", boardName: "NUCLEO-G071RB" },
      { serial: "0030001A3133511737393935", firmware: "V3J12M3", boardName: null },
    ]);
    const noBoard = splitProgrammerOutput("ST-Link Probe 0 :\n   ST-LINK SN  : ABCD1234\n   ST-LINK FW  : V2J1\n");
    expect(parseProbes(noBoard)).toEqual([{ serial: "ABCD1234", firmware: "V2J1", boardName: null }]);
  });
});

describe("target info", () => {
  const connect = splitProgrammerOutput(`${C}ST-LINK SN  : 066DFF485550755187121723${R}\r
ST-LINK FW  : V2J45M31\r
Board       : NUCLEO-G071RB\r
Voltage     : 3.27V\r
SWD freq    : 4000 KHz\r
Connect mode: Normal\r
Reset mode  : Software reset\r
Device ID   : 0x460\r
Revision ID : Rev Z\r
Debug in Low Power mode is not supported for this device.\r
Device name : STM32G071/STM32G081\r
Flash size  : 128 KBytes\r
Device type : MCU\r
Device CPU  : Cortex-M0+\r
BL Version  : 0xB2\r
0x1FFF7590 : 00390029 3A2F5143 91C40000\r
`);

  it("parses device id, name, flash size and voltage", () => {
    expect(parseTargetInfo(connect)).toEqual({
      deviceId: "0x460",
      deviceName: "STM32G071/STM32G081",
      flashSizeKb: 128,
      voltage: "3.27V",
      uid: "003900293A2F514391C40000",
    });
  });

  it("parses the UID with arbitrary word spacing and rejects short reads", () => {
    expect(parseUid(["0x1FFF7590 : 00390029 3A2F5143 91C40000"])).toBe("003900293A2F514391C40000");
    expect(parseUid(["0x1FFF7590 :  0039002 93a2f5143   91c40000"])).toBe("003900293A2F514391C40000");
    expect(parseUid(["0x1FFF7590 : 00390029 3A2F5143"])).toBeNull();
    expect(parseUid(["nothing"])).toBeNull();
  });

  it("converts MByte flash sizes", () => {
    expect(parseTargetInfo(["Flash size  : 1 MBytes"]).flashSizeKb).toBe(1024);
  });
});

describe("download progress", () => {
  it("maps CubeProgrammer lines to phases and percentages", () => {
    const output = `
Erasing memory corresponding to segment 0:
Erasing internal memory sectors [0 45]
Download in Progress:
[====                ]  20%\r[==========          ]  50%\r[====================] 100%
File download complete
Time elapsed during download operation: 00:00:03.412

Verifying ...
Read progress:
[==========          ]  50%\r[====================] 100%
Download verified successfully
MCU Reset
Software reset is performed
`;
    const tracker = createProgressTracker();
    const updates = splitProgrammerOutput(output)
      .map((line) => tracker.update(line))
      .filter((u) => u !== null);
    expect(updates).toEqual([
      { phase: "erasing", percent: null },
      { phase: "programming", percent: 0 },
      { phase: "programming", percent: 20 },
      { phase: "programming", percent: 50 },
      { phase: "programming", percent: 100 },
      { phase: "verifying", percent: 0 },
      { phase: "verifying", percent: 50 },
      { phase: "verifying", percent: 100 },
      { phase: "resetting", percent: null },
    ]);
    expect(sawVerified(splitProgrammerOutput(output))).toBe(true);
  });

  it("starts in connecting and ignores percent outside transfer phases", () => {
    const tracker = createProgressTracker();
    expect(tracker.current()).toEqual({ phase: "connecting", percent: null });
    expect(tracker.update("Voltage : 3.27V 50%")).toBeNull();
  });
});

describe("error detection", () => {
  it("finds the first Error: line", () => {
    const lines = splitProgrammerOutput(`${C}Error: No STM32 target found!${R}\nError: failed to download the File\n`);
    expect(findErrorLine(lines)).toBe("No STM32 target found!");
    expect(findErrorLine(["Download verified successfully"])).toBeNull();
    expect(findErrorLine(["Some Error: not at start"])).toBeNull();
  });
});

describe("argument builders", () => {
  it("builds connect and identify args", () => {
    expect(buildConnectArgs(null, "normal")).toEqual(["-c", "port=SWD", "freq=4000", "mode=NORMAL"]);
    expect(buildConnectArgs("066DFF485550755187121723", "underReset")).toEqual([
      "-c", "port=SWD", "freq=4000", "sn=066DFF485550755187121723", "mode=UR",
    ]);
    expect(buildConnectArgs(null, "hotPlug").at(-1)).toBe("mode=HOTPLUG");
    expect(buildIdentifyArgs(null, "normal")).toEqual([
      "-c", "port=SWD", "freq=4000", "mode=NORMAL", "-r32", "0x1FFF7590", "12",
    ]);
  });

  it("builds flash args for bin and hex", () => {
    const base = { probeSerial: null, connectMode: "normal" as const, address: "0x08000000" };
    expect(buildFlashArgs({ ...base, filePath: "/tmp/a.bin", format: "bin" })).toEqual([
      "-c", "port=SWD", "freq=4000", "mode=NORMAL", "-r32", "0x1FFF7590", "12", "-d", "/tmp/a.bin", "0x08000000", "-v", "-rst",
    ]);
    expect(buildFlashArgs({ ...base, filePath: "/tmp/a.hex", format: "hex", address: "garbage; ignored" })).toEqual([
      "-c", "port=SWD", "freq=4000", "mode=NORMAL", "-r32", "0x1FFF7590", "12", "-d", "/tmp/a.hex", "-v", "-rst",
    ]);
  });

  it("rejects injection attempts", () => {
    expect(() => validateProbeSerial("123 -e all")).toThrow();
    expect(() => validateProbeSerial("abc")).toThrow();
    expect(() => validateProbeSerial("ABCD1234;rm")).toThrow();
    expect(() => validateProbeSerial("")).toThrow();
    expect(validateProbeSerial("ABCD1234")).toBe("ABCD1234");
    expect(validateProbeSerial(null)).toBeNull();
    expect(() => validateAddress("0x08000000; rm")).toThrow();
    expect(() => validateAddress("08000000")).toThrow();
    expect(() => validateAddress("0x123456789")).toThrow();
    expect(validateAddress("0x08000000")).toBe("0x08000000");
    expect(() => buildConnectArgs("123 -e all", "normal")).toThrow();
    expect(() => buildConnectArgs(null, "bogus" as never)).toThrow();
    const base = { probeSerial: null, connectMode: "normal" as const, format: "bin" as const, address: "0x08000000" };
    expect(() => buildFlashArgs({ ...base, filePath: "-e all", })).toThrow();
    expect(() => buildFlashArgs({ ...base, filePath: "relative.bin" })).toThrow();
    expect(() => buildFlashArgs({ ...base, filePath: "/tmp/a.bin\n-e" })).toThrow();
    expect(() => buildFlashArgs({ ...base, filePath: "/tmp/a.bin", address: "0x0; -e all" })).toThrow();
    expect(() => buildFlashArgs({ ...base, filePath: "/tmp/a.bin", format: "elf" as never })).toThrow();
  });
});

describe("default install locations", () => {
  it("lists the documented paths per OS", () => {
    expect(defaultProgrammerPaths("darwin")[0]).toContain("STM32CubeProgrammer.app/Contents/Resources/bin/STM32_Programmer_CLI");
    expect(defaultProgrammerPaths("win32")).toHaveLength(2);
    expect(defaultProgrammerPaths("linux", "/home/qa")[0]).toBe("/home/qa/STMicroelectronics/STM32Cube/STM32CubeProgrammer/bin/STM32_Programmer_CLI");
  });
});
