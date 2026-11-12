# Stepwhere QA bench agent

A small Node.js program that runs on a QA bench PC. The bench has an ST-LINK probe (SWD) and a USB-TTL adapter wired to a Stepwhere shoe tracker (STM32G071CB). The agent:

- opens **one outbound** WebSocket to the Stepwhere API (no inbound ports, works behind NAT and firewalls),
- reports the hardware it sees (ST-LINK probes, serial ports),
- flashes firmware through STM32CubeProgrammer's command line (`STM32_Programmer_CLI`),
- streams the device's TTL serial output and lets the admin panel type into it.

You drive it from **Admin > QA > Bench**. The agent only performs the fixed operations the panel offers (identify, flash, serial open/close/write). It never runs a command line sent by the server.

Jobs on different ST-LINKs run side by side (one job per probe, so several boards can be flashed at once). A job without a chosen ST-LINK may use any probe, so it runs alone and is rejected while other jobs run.

## Prerequisites

| | |
| --- | --- |
| Node.js | 20 or newer |
| STM32CubeProgrammer | Install from st.com ("STM32CubeProg"). The agent finds `STM32_Programmer_CLI` in the default install location, on `PATH`, or via `STM32_PROGRAMMER_CLI`. |
| Windows | ST-LINK driver (STSW-LINK009) and the driver for your USB-TTL adapter (CP210x or CH340). |
| Linux | Add your user to the `dialout` group (`sudo usermod -aG dialout $USER`, then log out and in) and install ST's udev rules (`49-stlinkv*.rules` from the STM32CubeProgrammer `Drivers/rules` folder, copy to `/etc/udev/rules.d/`). |
| macOS | Nothing extra. |

## Wiring

SWD (ST-LINK to board):

| ST-LINK | Board |
| --- | --- |
| SWDIO | PA13 |
| SWCLK | PA14 |
| GND | GND |
| 3V3 (target voltage sense) | 3V3 |
| NRST (optional) | NRST |

NRST is optional, but required for the **Under reset** connect mode (use it when the firmware disables SWD or sleeps deeply).

TTL debug UART (USART1, 115200 8N1):

| USB-TTL adapter | Board |
| --- | --- |
| RX | PB6 (device TX) |
| TX | PB7 (device RX) |
| GND | GND |

Never connect the adapter's VCC/5V to the board's 3V3 rail while the board is powered. Leave the adapter's VCC unconnected.

## Install

From the release tarball:

```sh
npm install -g ./stepwhere-qa-agent-0.2.0.tgz
```

Or from the repo:

```sh
pnpm install
pnpm --filter @stepwhere/qa-agent build
node apps/qa-agent/dist/cli.js --help
```

(Replace `stepwhere-qa-agent` below with `node apps/qa-agent/dist/cli.js` when running from the repo.)

To produce a release tarball: `pnpm --filter @stepwhere/qa-agent pack:release` (writes `apps/qa-agent/release/stepwhere-qa-agent-<version>.tgz`).

## Pair the station

In the admin panel go to **QA > Bench > Pair station**, create a station and copy its code (`XXXX-XXXX`, valid for a short time). Then:

```sh
stepwhere-qa-agent pair --server https://<api host> --code XXXX-XXXX
```

Add `--programmer "<full path to STM32_Programmer_CLI>"` if CubeProgrammer is installed somewhere unusual. The token is stored in `~/.stepwhere-qa-agent/config.json` (mode 600; override the folder with `STEPWHERE_QA_AGENT_HOME`).

## Run

```sh
stepwhere-qa-agent start            # add --verbose to log every message type
```

Leave it running; it reconnects automatically (1 s to 30 s backoff). Ctrl+C closes serial ports and stops any running flash.

Check the setup at any time:

```sh
stepwhere-qa-agent doctor
```

It prints the config location, paired station, CubeProgrammer path and version, ST-LINK probes, serial ports (USB-TTL adapters marked) and whether the server's `/health` answers. To forget the station on this PC: `stepwhere-qa-agent unpair`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `STM32_Programmer_CLI not found` | Install STM32CubeProgrammer, or set `STM32_PROGRAMMER_CLI` to the full path of the executable, or re-run `pair --programmer <path>`. |
| `No ST-Link detected` | Check the USB cable, try another port, install the ST-LINK driver (Windows) or udev rules (Linux). Close STM32CubeIDE/CubeProgrammer GUI sessions that hold the probe. |
| `No STM32 target found!` / `No debug probe detected` | Check SWDIO/SWCLK/GND wiring and that the board is powered. Retry with connect mode **Under reset** (needs NRST wired). |
| Serial port busy / permission denied | Close other serial monitors (Arduino IDE, PuTTY, screen). On Linux make sure you are in `dialout`. |
| No serial ports listed | Replug the adapter and install its driver (CP210x / CH340). |
| `This station's token was rejected` | Ask an admin to re-pair the station in the panel, then run `stepwhere-qa-agent pair` again. |
| Panel shows the station offline | Run `doctor`; check the server URL and that the PC can reach it over HTTPS/WSS. |

## Run at login / as a service

Use the full path from `which stepwhere-qa-agent` (or `where stepwhere-qa-agent` on Windows) in the examples below.

### Windows (Task Scheduler)

```bat
schtasks /Create /TN "Stepwhere QA Agent" /SC ONLOGON /RL LIMITED /TR "cmd /c stepwhere-qa-agent start >> %USERPROFILE%\stepwhere-qa-agent.log 2>&1"
```

### macOS (launchd)

`~/Library/LaunchAgents/in.stepwhere.qa-agent.plist` (adjust the paths; Node must be on the `PATH` set here):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>in.stepwhere.qa-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/stepwhere-qa-agent</string>
    <string>start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/stepwhere-qa-agent.log</string>
  <key>StandardErrorPath</key><string>/tmp/stepwhere-qa-agent.log</string>
</dict>
</plist>
```

```sh
launchctl load ~/Library/LaunchAgents/in.stepwhere.qa-agent.plist
```

### Linux (systemd user unit)

`~/.config/systemd/user/stepwhere-qa-agent.service`:

```ini
[Unit]
Description=Stepwhere QA bench agent
After=network-online.target

[Service]
ExecStart=/usr/local/bin/stepwhere-qa-agent start
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

```sh
systemctl --user daemon-reload
systemctl --user enable --now stepwhere-qa-agent
loginctl enable-linger $USER   # keep it running without an open session
journalctl --user -u stepwhere-qa-agent -f
```

A token rejection exits with code 2; with `Restart=always` change that to `Restart=on-failure` plus `RestartPreventExitStatus=2` so a revoked station does not restart in a loop.
