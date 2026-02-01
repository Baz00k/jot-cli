# Changelog

## [0.9.0](https://github.com/Baz00k/jot-cli/compare/v0.8.3...v0.9.0) (2026-02-01)


### Features

* add support for openai compatible providers ([1a0c5da](https://github.com/Baz00k/jot-cli/commit/1a0c5da4595a5c626bd02d5aa7be6034a74e65d6))


### Bug Fixes

* add capacity exhausted errors retrying ([b671425](https://github.com/Baz00k/jot-cli/commit/b671425d6a70b98ac511916126e82b51c01b63aa))

## [0.8.3](https://github.com/Baz00k/jot-cli/compare/v0.8.2...v0.8.3) (2026-01-23)


### Bug Fixes

* add discard changes tool so agent can remove mistakes ([93a920e](https://github.com/Baz00k/jot-cli/commit/93a920e54d32b070bd36168ac9e69ba8ac2e264f))
* duplicated text when pasting, missing undo ([85c0841](https://github.com/Baz00k/jot-cli/commit/85c084112b4392f60f6d4d3c09d553a1912906c3))
* include formatting instructions in prompt ([39dd36f](https://github.com/Baz00k/jot-cli/commit/39dd36f87d184492e40e0112534f51e8c0fe5860))
* limit max results, update definitions to Effect.fn ([514cb48](https://github.com/Baz00k/jot-cli/commit/514cb489f152658e46a653c89b106cf994f53e69))
* restarting the agent with existing session ([f7730f7](https://github.com/Baz00k/jot-cli/commit/f7730f7fb14b34d9bc4d35a95651336a54dbe710))

## [0.8.2](https://github.com/Baz00k/jot-cli/compare/v0.8.1...v0.8.2) (2026-01-17)


### Bug Fixes

* install packages for all system versions ([aa42410](https://github.com/Baz00k/jot-cli/commit/aa424108ad2228b00bb38bec739b1b493a65891e))

## [0.8.1](https://github.com/Baz00k/jot-cli/compare/v0.8.0...v0.8.1) (2026-01-17)


### Bug Fixes

* failing ci builds ([6eef80a](https://github.com/Baz00k/jot-cli/commit/6eef80af9b6502b7ef922ef475a23d0967a64cb3))

## [0.8.0](https://github.com/Baz00k/jot-cli/compare/v0.7.0...v0.8.0) (2026-01-17)


### Features

* add installation scripts, scoop and homebrew support ([eb3fc6f](https://github.com/Baz00k/jot-cli/commit/eb3fc6fbd53bd0d4f1b13e9bbbc46c23d4f12432))

## [0.7.0](https://github.com/Baz00k/jot-cli/compare/v0.6.0...v0.7.0) (2026-01-17)


### Features

* improved agent ([#31](https://github.com/Baz00k/jot-cli/issues/31)) ([53f6ce5](https://github.com/Baz00k/jot-cli/commit/53f6ce5a021535339fdfa2e253065bc5e767a5e5))


### Bug Fixes

* double inject the json instructions to increase probability of generating corrent json object ([0a41121](https://github.com/Baz00k/jot-cli/commit/0a4112153662a4c1f7eb5c85758438569f36c111))
* increate the number of max steps for more advanced queries ([307e5da](https://github.com/Baz00k/jot-cli/commit/307e5da0e0935d2e2db1f702c65b70a60b134b99))
* reject empty queries and fetches to empty urls ([a97d84a](https://github.com/Baz00k/jot-cli/commit/a97d84aeffa32bb826692bd23e057db89c741739))
* windows compilation ([276c8b5](https://github.com/Baz00k/jot-cli/commit/276c8b5c60ebeaf9f9c7e5770a72fafb76def379))

## [0.6.0](https://github.com/Baz00k/jot-cli/compare/v0.5.0...v0.6.0) (2026-01-12)


### Features

* add clipboard paste support ([90a175f](https://github.com/Baz00k/jot-cli/commit/90a175f5be3c6c902e9e756e1e49a43348977c98))
* check antigravity quota command ([970d0fa](https://github.com/Baz00k/jot-cli/commit/970d0fac821989c057c9e2e5472f88e13d23f750))


### Bug Fixes

* agent status display ([148d6a1](https://github.com/Baz00k/jot-cli/commit/148d6a17393e3f904b7782d926730727edb81f24))
* antigravity constant quota exhausted error ([3b6cb44](https://github.com/Baz00k/jot-cli/commit/3b6cb446ac4531693b4bcaf099e746ad2f707c2f))
* antigravity provider failing with 429 errors ([1339775](https://github.com/Baz00k/jot-cli/commit/1339775724ba643551192b87cdd1bc06a82b0d76))
* broken non-streaming generation ([5aaa56b](https://github.com/Baz00k/jot-cli/commit/5aaa56ba4611c25162d57820af1628c83d5f991a))
* settings dialog error ([a52a8bc](https://github.com/Baz00k/jot-cli/commit/a52a8bc148e7cee6dfa067fea76f9ca06b922aa0))

## [0.5.0](https://github.com/Baz00k/jot-cli/compare/v0.4.1...v0.5.0) (2026-01-08)


### Features

* add TUI ([#27](https://github.com/Baz00k/jot-cli/issues/27)) ([e1aa8d6](https://github.com/Baz00k/jot-cli/commit/e1aa8d6bd761db57166b85d97b75c3cc38e67aaa))


### Bug Fixes

* exit with exit code 0 ([5470054](https://github.com/Baz00k/jot-cli/commit/5470054ec1332b41e77ed7a10326f9208cd9b2e7))
* failed response parsing by stripping markdown wrapper ([1437290](https://github.com/Baz00k/jot-cli/commit/1437290f10b5f886cdd81319359a12d6c47983cf))
* improve tools by providing meaningful output messages to ai model ([17db0b6](https://github.com/Baz00k/jot-cli/commit/17db0b6f873e4f7cad9f719e718625b7d341e39b))
* min height for status bar ([7c31417](https://github.com/Baz00k/jot-cli/commit/7c314179565765fb465eebe2c3a80df2e7529338))

## [0.4.1](https://github.com/Baz00k/jot-cli/compare/v0.4.0...v0.4.1) (2026-01-04)


### Bug Fixes

* allow generation with Antigravity auth without OpenRouter key ([fe875a8](https://github.com/Baz00k/jot-cli/commit/fe875a87986f34aa7e988654b5e88bd0513ad94e))

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
