# Changelog

## [0.4.0](https://github.com/Baz00k/jot-cli/compare/v0.3.0...v0.4.0) (2026-01-04)


### Features

* add model specific settings for temperature etc to improve output quality ([11aa6f7](https://github.com/Baz00k/jot-cli/commit/11aa6f7552636ca28f76b318c93c681b624a2f9f))
* add session saving (with no option to resume for now) ([3d5db41](https://github.com/Baz00k/jot-cli/commit/3d5db41e91ff19ef27c5139a351b7d774574f39d))
* add web fetch and web search tools to agent ([84e1179](https://github.com/Baz00k/jot-cli/commit/84e117996104798cfaadf7284aae2f52242b5938))
* **docs:** add docs about google antigravity integration ([aadd89e](https://github.com/Baz00k/jot-cli/commit/aadd89e3c154507f5dac0e4d52503cc3ddb7f0ef))
* **docs:** update to newest glm model ([bed3d72](https://github.com/Baz00k/jot-cli/commit/bed3d72aa6165b0c9f5b4962b4d087dbdf344458))
* google antigravity auth and models support ([7984cdb](https://github.com/Baz00k/jot-cli/commit/7984cdb10df4bf0f215680fa7b740b16fc97fa42))
* improve agent performance by retaining read files in context ([42c69e4](https://github.com/Baz00k/jot-cli/commit/42c69e4e0460942fbaf6a78211da311a7ee37fcc))
* improve writer prompt ([ac03d99](https://github.com/Baz00k/jot-cli/commit/ac03d99afaa2cafc8c103d5380d21fd56b52f8ce))
* more robust workflow error handling, ability to save unfinished draft if agent fails ([3e94ac0](https://github.com/Baz00k/jot-cli/commit/3e94ac0ada606184684e36ce9be3bdf63e8d2c52))


### Bug Fixes

* auto retrieve project id for antigravity provider ([2739ddc](https://github.com/Baz00k/jot-cli/commit/2739ddc2c4cea1a3c276dd329f538ccafecf1df0))
* **docs:** fix working model ids, update descriptions ([e62dc96](https://github.com/Baz00k/jot-cli/commit/e62dc96c8fb48d523f8f588f61c6813664a0830b))
* improve the reviewer prompt to accept markdown with code blocks ([fb10a89](https://github.com/Baz00k/jot-cli/commit/fb10a893a8d5024f5a0f83093acbf8f8b9a8347e))
* increase max step count ([ba87989](https://github.com/Baz00k/jot-cli/commit/ba87989138d650ab77b7d6b63500f63a6bbd10bf))
* json structured object generation using antigravity provider ([c201ea8](https://github.com/Baz00k/jot-cli/commit/c201ea8e8ef6c2c3b11d28fb5a64744991d87347))
* move instructions from system prompt to task prompt ([247a231](https://github.com/Baz00k/jot-cli/commit/247a23163de1df163ed178f1539d63078e498350))
* properly return name in listFiles ([171ce34](https://github.com/Baz00k/jot-cli/commit/171ce34bdf844de431f27e5331d0e5fb5f86f767))
* strip unsupported language from markdown render ([938e069](https://github.com/Baz00k/jot-cli/commit/938e069b97ebb492caf23450aeac31dd952050e8))
* update disallowed properties list for mapper ([5644e25](https://github.com/Baz00k/jot-cli/commit/5644e25a4941cf35f3b8eee5ce49bdc93dca3a08))

## [0.3.0](https://github.com/Baz00k/jot-cli/compare/v0.2.0...v0.3.0) (2025-12-22)


### Features

* add cost tracking ([603e34b](https://github.com/Baz00k/jot-cli/commit/603e34bead429c7f28ab4d9cbedc97399b4d6c87))
* **docs:** add section about recommended models ([0359015](https://github.com/Baz00k/jot-cli/commit/03590152a7b8e7d3027fcc37568066e4f8a1ca85))
* render markdown from responses ([6a6537d](https://github.com/Baz00k/jot-cli/commit/6a6537d22e9a0228d9b35ceb59a9b4ed452159bf))


### Bug Fixes

* catch and properly handle AI streaming errors ([03bc5c2](https://github.com/Baz00k/jot-cli/commit/03bc5c26da8d54d5dd3e00a8b85eb64e7319467c))
* improve agent prompts ([e3c1ffa](https://github.com/Baz00k/jot-cli/commit/e3c1ffa33fa258f938e0adecb7fb0ddd872d2c2b))
* instruct agent to always save files ([9814109](https://github.com/Baz00k/jot-cli/commit/981410987f42f2284d884d748099ba5a978f1163))

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
