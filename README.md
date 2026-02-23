---
created_at: 2026-02-22T04:27
updated_at: 2026-02-23T04:32
---
<div align="center">

<a href="https://anikku-app.github.io">
    <img src="./.github/assets/icon.png" alt="Relay logo" title="Relay logo" width="80"/>
</a>

# Relay [App](#)

### Full-featured player, based on Aniyomi.
Discover and watch anime, cartoons, series, and more – easier than ever on your Android device.

## Fork notice

Relay is a fork of [Anikku](https://github.com/komikku-app/anikku), maintained with Relay-specific branding and workflow changes.

| Releases | Preview |
|----------|---------|
| <div align="center"> [![GitHub downloads](https://img.shields.io/github/downloads/komikku-app/anikku/latest/total?label=Latest%20Downloads&labelColor=27303D&color=0D1117&logo=github&logoColor=FFFFFF&style=flat)](https://github.com/komikku-app/anikku/releases/latest) [![GitHub downloads](https://img.shields.io/github/downloads/komikku-app/anikku/total?label=Total%20Downloads&labelColor=27303D&color=0D1117&logo=github&logoColor=FFFFFF&style=flat)](https://github.com/komikku-app/anikku/releases) [![Stable build](https://img.shields.io/github/actions/workflow/status/komikku-app/anikku/build_release.yml?labelColor=27303D&label=Stable&labelColor=06599d&color=043b69)](https://github.com/komikku-app/anikku/actions/workflows/build_release.yml) | <div align="center"> [![GitHub downloads](https://img.shields.io/github/downloads/komikku-app/anikku-preview/latest/total?label=Latest%20Downloads&labelColor=27303D&color=0D1117&logo=github&logoColor=FFFFFF&style=flat)](https://github.com/komikku-app/anikku-preview/releases/latest) [![GitHub downloads](https://img.shields.io/github/downloads/komikku-app/anikku-preview/total?label=Total%20Downloads&labelColor=27303D&color=0D1117&logo=github&logoColor=FFFFFF&style=flat)](https://github.com/komikku-app/anikku-preview/releases) [![Preview build](https://img.shields.io/github/actions/workflow/status/komikku-app/anikku-preview/build_app.yml?labelColor=27303D&label=Preview&labelColor=2c2c47&color=1c1c39)](https://github.com/komikku-app/anikku-preview/actions/workflows/build_app.yml) |

[![Discord](https://img.shields.io/discord/1242381704459452488.svg?label=&labelColor=6A7EC2&color=7389D8&logo=discord&logoColor=FFFFFF)](https://discord.gg/85jB7V5AJR)
[![CI](https://img.shields.io/github/actions/workflow/status/komikku-app/anikku/build_push.yml?labelColor=27303D&label=CI)](https://github.com/komikku-app/anikku/actions/workflows/build_push.yml)
[![License: Apache-2.0](https://img.shields.io/github/license/komikku-app/anikku?labelColor=27303D&color=0877d2)](/LICENSE)
[![Translation status](https://hosted.weblate.org/widget/komikku-app/anikku/svg-badge.svg)](https://hosted.weblate.org/projects/komikku-app/anikku/)

## Download

[![Stable](https://img.shields.io/github/release/komikku-app/anikku.svg?maxAge=3600&label=Stable&labelColor=06599d&color=043b69)](https://github.com/komikku-app/anikku/releases/latest)
[![Preview](https://img.shields.io/github/v/release/komikku-app/anikku-preview.svg?maxAge=3600&label=Preview&labelColor=2c2c47&color=1c1c39)](https://github.com/komikku-app/anikku-preview/releases/latest)

*Requires Android 8.0 or higher.*

[![Sponsor me on GitHub](https://custom-icon-badges.demolab.com/badge/-Sponsor-ea4aaa?style=for-the-badge&logo=heart&logoColor=white)](https://github.com/sponsors/cuong-tran "Sponsor me on GitHub")

## Features

![screenshots of app](./.github/readme-images/screens.png)

<div align="left">

### Features include:

* **Relay**:
  * `Anime Suggestions` automatically showing source-website's recommendations / suggestions / related to current entry for all sources.
  * `Auto theme color` based on each entry's cover for entry View & Reader.
  * `App custom theme` with `Color palettes` for endless color lover.
  * `Bulk-favorite` multiple entries all at once.
  * `Fast browsing` (for who with large library experiencing slow loading)
  * Auto `2-way sync` progress with trackers.
  * From SY:
    * `Anime Recommendations` from Anilist and MyAnimeList.
    * Edit `Anime Info` manually, or fill data from MyAnimeList.
    * `Custom cover` with files or URL.
    * `Pin anime` to top of Library with `Tag` sort.
    * `Merge anime` allow merging separated anime/episodes into one entry.
    * `Tracking filter`, filter your tracked anime so you can see them or see non-tracked anime.
    * `Search tracking` status in library.
    * `Mass-migration` all your anime from one source to another at same time.
    * `Dynamic Categories`, view the library in multiple ways.
    * `Custom categories` for sources, liked the pinned sources, but you can make your own versions and put any sources in them.
    * Cross device `Library sync` with SyncYomi & Google Drive.
  * Anime `cover on Updates notification`.
  * `Panorama cover` showing wide cover in full.
  * `to-be-updated` screen: which entries are going to be checked with smart-update?
  * `Update Error` screen & migrating them away.
  * `Source & Language icon` on Library & various places. (Some language flags are not really accurate)
  * `Grouped updates` in Update tab (inspired by J2K).
  * Drag & Drop re-order `Categories`.
  * Ability to `enable/disable repo`, with icon.
  * Streamlined extension install flow using `PRIVATE` installer mode only.
  * Extension download/install now runs in foreground worker with `retry + resume` to avoid stuck `Downloading`.
  * `Search for sources` & Quick NSFW sources filter in Extensions, Browse & Migration screen.
  * In-app `progress banner` shows Library syncing / Backup restoring / Library updating progress.
  * Long-click to add/remove single entry to/from library, everywhere.
  * Docking Watch/Resume button to left/right.
  * Auto-install app update.
  * Configurable interval to refresh entries from downloaded storage.
  * And many more from same maintainer's app for Manga reader: [Komikku](https://github.com/komikku-app/komikku)
* Aniyomi:
  * Watching videos
  * Local watching of downloaded content
  * A configurable player built on mpv-android with multiple options and settings
  * Tracker support: [MyAnimeList](https://myanimelist.net/) and [AniList](https://anilist.co/)
  * Categories to organize your library
  * Create backups locally to watch offline or to your desired cloud service
* Other forks' features:
  * Torrent support (Needs right extensions) (@Diegopyl1209)
  * Support for Cast functionality (Animetail)
  * Group by tags in library (Kuukiyomi)
  * Discord Rich Presence (Animiru, Kuukiyomi, Animetail)

# Issues, Feature Requests and Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

<details><summary>Issues</summary>

[Website](https://anikku-app.github.io/)

1. **Before reporting a new issue, take a look at the [FAQ](https://anikku-app.github.io/docs/faq/general), the [changelog](https://github.com/komikku-app/anikku/releases) and the already opened [issues](https://github.com/komikku-app/anikku/issues).**
2. If you are unsure, ask here: [![Discord](https://img.shields.io/discord/1242381704459452488.svg?label=&labelColor=6A7EC2&color=7389D8&logo=discord&logoColor=FFFFFF)](https://discord.gg/85jB7V5AJR)

</details>

<details><summary>Bugs</summary>

* Include version (More → About → Version)
 * If not latest, try updating, it may have already been solved
 * Preview version is equal to the number of commits as seen on the main page
* Include steps to reproduce (if not obvious from description)
* Include screenshot (if needed)
* If it could be device-dependent, try reproducing on another device (if possible)
* Don't group unrelated requests into one issue

Use the [issue forms](https://github.com/komikku-app/anikku/issues/new/choose) to submit a bug.

</details>

<details><summary>Feature Requests</summary>

* Write a detailed issue, explaining what it should do or how.
* Include screenshot (if needed).
</details>

<details><summary>Contributing</summary>

See [CONTRIBUTING.md](./CONTRIBUTING.md).
</details>

<details><summary>Code of Conduct</summary>

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
</details>

</div>

### Credits

Thank you to all the people who have contributed!

<a href="https://github.com/komikku-app/anikku/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=aniyomiorg/aniyomi" alt="Relay app contributors" title="Relay app contributors" width="800"/>
</a>

![Visitor Count](https://count.getloli.com/get/@komikku-app?theme=capoo-2)

### Disclaimer

The developer(s) of this application does not have any affiliation with the content providers available, and this application hosts zero content.

<div align="left">

## License

<pre>
Copyright © 2015 Javier Tomás
Copyright © 2024 The Mihon Open Source Project
Copyright © 2024 The Aniyomi Open Source Project

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
</pre>

</div>
