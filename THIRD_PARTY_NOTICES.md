# Attribution and third-party notices

## Design origin

The session-projection / browser-slot delivery approach was informed by:

- **omdsh-dev/dsh-notification**, commit `675aab9b43d5011738feb6185281596c0365ccba`, version 0.1.4.
- Source: https://github.com/omdsh-dev/dsh-notification/tree/675aab9b43d5011738feb6185281596c0365ccba
- Original MIT notice: **Copyright (c) 2026 DeepSeek**.

The original MIT permission and warranty notice is preserved in this repository's LICENSE. This is an independent package with new preference, presentation, lifetime, settings and test modules, not the upstream project or an official DeepSeek product. The earlier local chat-title adaptation is the functional starting point, not a promise of upstream compatibility.

## Dependencies

Host runtime dependencies are installed separately by the package manager and retain their own license files:

| Package | Use | License |
| --- | --- | --- |
| @deepseek-ai/schemastery | Host configuration schema | MIT |
| @deepseek-ai/cosmokit | Transitive schema utility | MIT |
| zod | Projection validation | MIT |
| @standard-schema/spec | Transitive schema types | MIT |

React is provided by the DSH renderer at runtime. React, React DOM and their transitive dependencies are used for local build/test development under their original licenses. esbuild (MIT) is a build-time tool. The build marks React and Host schema dependencies external; no third-party runtime implementation is intentionally copied into the Client artifact.

DeepSeek, macOS, Apple and GitHub names are used descriptively. No sponsorship, endorsement or trademark ownership is claimed.
