let verboseEnabled = false;

export function setVerbose(value: boolean): void {
  verboseEnabled = value;
}

export function isVerbose(): boolean {
  return verboseEnabled;
}

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export function info(message: string): void {
  console.log(`${stamp()} ${message}`);
}

export function warn(message: string): void {
  console.warn(`${stamp()} WARN ${message}`);
}

export function error(message: string): void {
  console.error(`${stamp()} ERROR ${message}`);
}

export function debug(message: string): void {
  if (verboseEnabled) console.log(`${stamp()} [debug] ${message}`);
}
