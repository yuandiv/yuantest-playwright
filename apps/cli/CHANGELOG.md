# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.3.0](https://github.com/yuandiv/yuantest-playwright/compare/v1.2.4...v1.3.0) (2026-08-11)


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

* **ai,core:** declare @modelcontextprotocol/sdk and jiti dependencies ([905aed1](https://github.com/yuandiv/yuantest-playwright/commit/905aed1de1c3e55adda8cd016e79a937d532a75c))
* **ai:** break agent-loop infinite retry on identical tool calls ([4c2307f](https://github.com/yuandiv/yuantest-playwright/commit/4c2307f935bc685dd395600aa4b21eec21dd988b))
* **ai:** guard against false positives in repeated tool-call detection ([98edc09](https://github.com/yuandiv/yuantest-playwright/commit/98edc09e6e9ea2c88d47e3cef9a05c33d7ce1759))
* **ci:** build workspace before e2e/docs jobs, declare dayjs deps ([76d2cdd](https://github.com/yuandiv/yuantest-playwright/commit/76d2cdd6788e4068259d0c9772ba4755bdb8a959))
* **core:** declare express dependency for middleware types ([df44a7f](https://github.com/yuandiv/yuantest-playwright/commit/df44a7fb4ab485ed0c0bf1386fe86d23703ff076))
* **dashboard:** converge test-tree badges to final status after run ([a7c9718](https://github.com/yuandiv/yuantest-playwright/commit/a7c97187852a3c38b14d6a11f9d78c421a5d3dee))
* **dashboard:** stop restoring stale pass states after run starts ([0915cef](https://github.com/yuandiv/yuantest-playwright/commit/0915cef728a0f6b33868aa10e608f18afb662d95))
* **demo:** restore @playwright/test resolution for root demo dir ([23a2cd6](https://github.com/yuandiv/yuantest-playwright/commit/23a2cd6824730d6411b2a6e2a7ca1ccc2fa0d100))
* **executor:** align test ids and symmetric status counting in progress tracker ([5efe4ad](https://github.com/yuandiv/yuantest-playwright/commit/5efe4ad41c826837378961df43bd9a83a2c8a73a))
* **executor:** escape shell args and stream-decode output on Windows ([e4c4810](https://github.com/yuandiv/yuantest-playwright/commit/e4c4810e7392764799cd62b2c1545492447460dd))
* **lint:** resolve all eslint warnings ([9279313](https://github.com/yuandiv/yuantest-playwright/commit/92793138ceb276364e5b9c9d3b80d0c706e8fcf9))
* **reporter:** add @types/pngjs declaration dependency ([b6bc596](https://github.com/yuandiv/yuantest-playwright/commit/b6bc59647cd94c630e47a229fc68966011c7b4d0))
* **reporter:** declare ws, pngjs, pixelmatch dependencies ([c7239a9](https://github.com/yuandiv/yuantest-playwright/commit/c7239a908b65a58051f2efabfd3f77afb15624cb))


### 📝 文档

* add repository-level README and LICENSE ([90b4b51](https://github.com/yuandiv/yuantest-playwright/commit/90b4b510d7b948c0928f7d908c2b46d9d247208f))
* align documentation with monorepo structure ([54f1764](https://github.com/yuandiv/yuantest-playwright/commit/54f1764ca31dc0a8a553907e413dc7558e970716))
* fix mermaid rendering and duplicate paths in documentation ([fbb8b2d](https://github.com/yuandiv/yuantest-playwright/commit/fbb8b2def919a245d812a66ae28657186377989e))


### 👷 CI/CD

* **docs:** upload pages artifact from apps/cli/docs ([705f470](https://github.com/yuandiv/yuantest-playwright/commit/705f470e25770555e7710680a42d56b2c0260ab2))
* **release:** read changelog from apps/cli for GitHub release notes ([904e923](https://github.com/yuandiv/yuantest-playwright/commit/904e923f63a1c9c28adacba198b78a1cd3d88a47))

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
