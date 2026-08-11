# 更新日志

本文件记录了项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，
本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。

## [1.3.0](https://github.com/yuandiv/yuantest-playwright/compare/v1.2.4...v1.3.0) (2026-08-10)


### ✨ 新增功能

* **monorepo:** split dashboard app, migrate CI to pnpm+turbo ([d91fce2](https://github.com/yuandiv/yuantest-playwright/commit/d91fce2ef9a16ef0009e68e48f6b94449a5d01b6))


### ✅ 测试

* **e2e:** add AI chat conversation e2e suite and wire into CI ([1a2282f](https://github.com/yuandiv/yuantest-playwright/commit/1a2282f2ce25490bb80fdf96a55be90739a9c6e8))


### ♻️ 重构

* **ai:** extract @yuantest/ai package + inject ITestExecutor ([12e1d33](https://github.com/yuandiv/yuantest-playwright/commit/12e1d33c3b918bf00ffd8c9d31e6a03644d2ea9f))
* **ai:** extract MCPService and streamline chat/agent tool wiring ([40b40f3](https://github.com/yuandiv/yuantest-playwright/commit/40b40f3dfa787d5be8289c55ab5925ea4b070b13))
* **executor:** extract @yuantest/executor package with result-manager interface injection ([f4271b8](https://github.com/yuandiv/yuantest-playwright/commit/f4271b8d655d9ed16b7a75c5b0655f299ee6d4d8))
* **flaky:** extract @yuantest/flaky package ([5d12269](https://github.com/yuandiv/yuantest-playwright/commit/5d122697615c17fc05a51b9ffcecb7f44287444d))
* **monorepo:** bootstrap pnpm+turbo workspace, extract contracts & core packages ([c25a952](https://github.com/yuandiv/yuantest-playwright/commit/c25a9520b418982db025e71e220610dbde58a3bb))
* **monorepo:** bootstrap pnpm+turbo workspace, move package to apps/cli ([65a4f90](https://github.com/yuandiv/yuantest-playwright/commit/65a4f90c6554d44b9645db7cc23f7162ad6036d1))
* **reporter:** extract @yuantest/reporter + @yuantest/diagnosis packages ([c1859d3](https://github.com/yuandiv/yuantest-playwright/commit/c1859d33cc3fc731ec89643411654250d72a257b))


### 🐛 Bug 修复

* **ai:** break agent-loop infinite retry on identical tool calls ([4c2307f](https://github.com/yuandiv/yuantest-playwright/commit/4c2307f935bc685dd395600aa4b21eec21dd988b))
* **ai:** guard against false positives in repeated tool-call detection ([98edc09](https://github.com/yuandiv/yuantest-playwright/commit/98edc09e6e9ea2c88d47e3cef9a05c33d7ce1759))
* **dashboard:** converge test-tree badges to final status after run ([a7c9718](https://github.com/yuandiv/yuantest-playwright/commit/a7c97187852a3c38b14d6a11f9d78c421a5d3dee))
* **dashboard:** stop restoring stale pass states after run starts ([0915cef](https://github.com/yuandiv/yuantest-playwright/commit/0915cef728a0f6b33868aa10e608f18afb662d95))
* **demo:** restore @playwright/test resolution for root demo dir ([23a2cd6](https://github.com/yuandiv/yuantest-playwright/commit/23a2cd6824730d6411b2a6e2a7ca1ccc2fa0d100))
* **executor:** align test ids and symmetric status counting in progress tracker ([5efe4ad](https://github.com/yuandiv/yuantest-playwright/commit/5efe4ad41c826837378961df43bd9a83a2c8a73a))
* **executor:** escape shell args and stream-decode output on Windows ([e4c4810](https://github.com/yuandiv/yuantest-playwright/commit/e4c4810e7392764799cd62b2c1545492447460dd))
* **lint:** resolve all eslint warnings ([9279313](https://github.com/yuandiv/yuantest-playwright/commit/92793138ceb276364e5b9c9d3b80d0c706e8fcf9))

