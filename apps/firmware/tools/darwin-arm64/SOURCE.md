# Arduino ctags for macOS ARM64

The `ctags` executable in this directory is a native ARM64 build of Arduino's
`5.8-arduino11` release. Arduino does not publish a macOS ARM64 binary for this
release, so the firmware build substitutes this executable for the x86-only
tool installed by Arduino CLI.

## Source and license

- Project: <https://github.com/arduino/ctags>
- Tag: `5.8-arduino11`
- Commit: `abc8fca7499f44c725122881cd380a88c37abe0e`
- License: GPLv2; see `COPYING`
- Corresponding source: `ctags-5.8-arduino11-source.tar.gz`
- Source archive SHA-256: `86ca843c62aecb9bc531a73d9b6cef33179bd885b1bf8df9e0c7e9761aa9794d`
- Binary SHA-256: `986781b08ac7ee98286a3d4f148a638e2b0b202f99d6600ab230c93cd594af4b`

The source is unmodified. The `-include dirent.h` compiler flag prevents the
legacy source's `__unused__` macro from interfering with the modern macOS SDK.

## Reproduce the binary

The committed executable was built with Apple Clang 21.0 and the macOS 27 SDK,
with a macOS 11.0 minimum deployment target. From this directory:

```bash
tar -xzf ctags-5.8-arduino11-source.tar.gz
cd ctags-5.8-arduino11

export SOURCE_DATE_EPOCH=1479894772
export MACOSX_DEPLOYMENT_TARGET=11.0
export CFLAGS="-O2 -mmacosx-version-min=11.0 -include dirent.h"
export LDFLAGS="-mmacosx-version-min=11.0"

CC=clang ./configure
make -j"$(sysctl -n hw.ncpu)"
strip -x ctags
codesign --force --sign - ctags
shasum -a 256 ctags
```

The fixed source date is the tagged commit timestamp and makes the embedded
compile date reproducible. A different Apple Clang or SDK version may produce a
different checksum even when the resulting executable is functionally
equivalent.
