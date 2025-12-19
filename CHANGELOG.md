# Changelog

## [0.2.0](https://github.com/Baz00k/jot-cli/compare/v0.1.0...v0.2.0) (2025-12-19)


### Features

* agent autonomous project files editing ([#19](https://github.com/Baz00k/jot-cli/issues/19)) ([63fcf62](https://github.com/Baz00k/jot-cli/commit/63fcf62b420982f956ba9c607a0d18cb367415ef))
* improve reviewer prompt ([cbc0f31](https://github.com/Baz00k/jot-cli/commit/cbc0f31831419f0aeac147e6745c6030e11faddb))

## [0.1.0](https://github.com/Baz00k/jot-cli/compare/v0.0.2...v0.1.0) (2025-12-17)


### Features

* add ability to save user models and reasoning params ([73ebb4b](https://github.com/Baz00k/jot-cli/commit/73ebb4b9ff7aac387a65d4557d95f12231de49bf))
* improved, multi step autonomous agent ([a1980e2](https://github.com/Baz00k/jot-cli/commit/a1980e20527e737296b925d72953954db3b1fd7e))


### Bug Fixes

* logger not writing files properly, disable default bun pretty logger ([e751fa0](https://github.com/Baz00k/jot-cli/commit/e751fa0b8a0e46348aa1f119fec0177c9477c639))
* possible EventTarget memory leak ([b165775](https://github.com/Baz00k/jot-cli/commit/b1657756abafdc637b1c3fc3dfa1d0035a5841f0))
* possible unhandler errors and race conditions ([839a19e](https://github.com/Baz00k/jot-cli/commit/839a19e20a128cd24cf1f8aeac2b946dfdb13692))
* remove args from bare config command so it returs usage info ([d265645](https://github.com/Baz00k/jot-cli/commit/d265645e9538471988a1b1ac02970e5908dc84cb))

## [0.0.2](https://github.com/Baz00k/jot-cli/compare/v0.0.1...v0.0.2) (2025-12-10)


### Bug Fixes

* agent step message ([dfb9d54](https://github.com/Baz00k/jot-cli/commit/dfb9d54b3210656c93c481af67d8447f7a208bad))
* do not attempt to retry unretryable errors ([f842c2c](https://github.com/Baz00k/jot-cli/commit/f842c2c13af9dbec96887a859f72c9d7948f9aa5))
* ensure reasoning is enabled by default ([d79cd40](https://github.com/Baz00k/jot-cli/commit/d79cd404e766cb8ef1ea57a3974446849901d50e))
* use select for append/overwrite options, only show prompt if file exists ([4880a52](https://github.com/Baz00k/jot-cli/commit/4880a525cdf6ff86ef55d5423595a1c38c77b563))
* writing to read only object ([217da86](https://github.com/Baz00k/jot-cli/commit/217da8672065d0924ebfaf354546da39bc566633))
* wrong tool json schema introduced by effect rewrite ([ef68f4c](https://github.com/Baz00k/jot-cli/commit/ef68f4c563f4e5f8823e780e0d50e4de08325d00))

## 0.0.1 (2025-12-08)


### Features

* add live response streaming ([b9f1d3f](https://github.com/Baz00k/jot-cli/commit/b9f1d3f9a922263a5aea66915d23fb16a6ec006e))
* add optional reasoning ([002f00e](https://github.com/Baz00k/jot-cli/commit/002f00e3c7cd17fd21bc4dd3d76f642918183164))
* give agent ability to search files ([060dfc5](https://github.com/Baz00k/jot-cli/commit/060dfc5662585f25bb75d72b984d8e0397d0e8b5))


### Bug Fixes

* model max step count ([a22365c](https://github.com/Baz00k/jot-cli/commit/a22365c630f07ffd1c1cad48a635bc4dbaed2668))
* tool calls and progress formatting ([d48e301](https://github.com/Baz00k/jot-cli/commit/d48e3017fdee9d7142146b725cb0222e465bddd9))
* tool usage config and context passing ([d0aec69](https://github.com/Baz00k/jot-cli/commit/d0aec69d45cc6e15d1bac19c96b86e36f34f2493))
* wrap terminal output to prevent broken formatting ([c3efb0e](https://github.com/Baz00k/jot-cli/commit/c3efb0e34dc6b0e483abcfec8b4ba03e650cab50))


### Miscellaneous Chores

* release 0.0.1 ([876223d](https://github.com/Baz00k/jot-cli/commit/876223d117b8b42d8bd48e4f488d2d848ffce179))
