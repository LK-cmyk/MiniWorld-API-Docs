# MiniWorld API Description

![VS Code](https://img.shields.io/badge/VS%20Code-^1.125.0-blue)
![Lua](https://img.shields.io/badge/Lua-5.1%2B-yellow)

A VS Code extension providing Lua type declarations, API search, and event completion for *Mini World* (迷你世界) UGC development.

## Features

### 📦 Type Declarations

Provides complete Lua type declaration files for **UGC 3.0** & **UGC 2.0**, working with the [Lua Language Server (sumneko.lua)](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) to deliver:

- Intelligent autocompletion
- Type hints and parameter documentation
- Inline function signatures

The **`miniworld.completion`** setting automatically loads the corresponding declaration version into the Lua language server. Manual commands are also available:

| Command | Description |
| :-: | :-: |
| `MiniWorld API Description: Add MiniWorld UGC Declarations` | Add 2.0 or 3.0 declarations to `Lua.workspace.library` |

2.0 and 3.0 declarations are mutually exclusive; switching the completion mode replaces them automatically.

### 🔍 API Search

Search all MiniWorld APIs directly from the VS Code sidebar — no need to leave your editor.

| Method | Action |
| :-: | :-: |
| **Command Palette** | `Ctrl+Shift+P` → **MiniWorld API Description: Open API Search** |
| **Sidebar** | Click the 🔍 **MiniWorld API Search** icon in the activity bar |

- **Fuzzy Search** — Type keywords to fuzzy-match API names, parameters, and descriptions (e.g., `GP` matches `GetPosition`)
- **Filters** — Filter by version (2.0 / 3.0), module, and type (function / enum / event)
- **Detail View** — Click a result to see full parameter lists, return values, and more
- **Click to Navigate** — Click any result to jump to the declaration source
- **Quick Clear** — Press `Ctrl+K` in the search input to clear the query

### ⚡ Completion

The **`miniworld.completion`** setting controls the entire completion capability of the extension (enabled by default, based on UGC 2.0):

| Value | Behavior |
| :-: | :-: |
| `2.0` (default) | Automatically loads 2.0 declarations (API/type completion), and completes 2.0 event names inside `ScriptSupportEvent([=[...]=])` long brackets (auto-wraps with `[=[ ... ]=]`) |
| `3.0` | Automatically loads 3.0 declarations (API/type completion), and completes 3.0 event fields after `TriggerEvent.` / `ObjectEvent.` (enum references, no long brackets) |
| `off` | Removes MiniWorld declarations and disables event completion — completely disables completion |

> Changes apply without reloading the window; the extension automatically syncs declarations and reloads the corresponding event definitions.

## First-Time Setup

When you open any `.lua` file, the extension automatically enables the corresponding declaration version based on the completion mode setting (default 2.0) — no manual setup required.

## Requirements

- [VS Code](https://code.visualstudio.com/) ^1.125.0
- [Lua Language Server extension (sumneko.lua)](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) — automatically installed as a dependency

## Extension Commands

| Command | Description |
| :-: | :-: |
| `MiniWorld API Description: Add MiniWorld UGC Declarations` | Choose version (2.0 / 3.0) and add the declaration directory to `Lua.workspace.library` |
| `MiniWorld API Description: Clear MiniWorld UGC Completion` | One-click clear completion (sets the completion mode to `off`, removes declarations and disables event completion) |
| `MiniWorld API Description: Open API Search` | Open the API search panel |
| `MiniWorld API Description: Refresh API Search Index` | Rescan declaration files to update search index |

## Compatibility

| Project | Version |
| :-: | :-: |
| *Mini World* game | v1.56+ |
| UGC SDK | 3.0 & 2.0 |
| VS Code | ^1.125.0 |

## Notes

- This extension is designed for **UGC 3.0** & **UGC 2.0** only
- Some APIs may differ from the actual game behavior; always refer to the game for the final word
- For issues or feature requests, please open an [Issue](https://github.com/LK-cmyk/MiniWorld-API-Desc/issues)

## License

[MIT](https://github.com/LK-cmyk/MiniWorld-API-Desc/blob/main/LICENSE)

# MiniWorld API Description

![VS Code](https://img.shields.io/badge/VS%20Code-^1.125.0-blue)
![Lua](https://img.shields.io/badge/Lua-5.1%2B-yellow)

为《迷你世界》UGC 开发提供 Lua 类型声明、API 搜索和事件补全的 VS Code 扩展。

## 功能

### 📦 类型声明

为 **UGC 3.0** & **UGC 2.0** 提供完整的 Lua 类型声明文件，配合 [Lua 语言服务（sumneko.lua）](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) 实现：

- 智能自动补全
- 类型提示与参数文档
- 内联函数签名

通过补全模式设置（见下方「⚡ 补全」），插件会自动将对应版本的声明加载到 Lua 语言服务；也可通过命令手动添加：

| 命令 | 说明 |
| :-: | :-: |
| `MiniWorld API Description: 添加 MiniWorld UGC 声明` | 选择版本（2.0/3.0）后添加到 `Lua.workspace.library` |

2.0 与 3.0 声明为互斥关系，切换补全模式会自动替换。

### 🔍 API 搜索

在 VS Code 侧边栏中直接搜索所有 MiniWorld API，无需离开编辑器翻阅文档。

| 方式 | 操作 |
| :-: | :-: |
| **命令面板** | `Ctrl+Shift+P` → **MiniWorld API Description: 打开 API 搜索** |
| **侧边栏按钮** | 点击左侧活动栏的 🔍 **MiniWorld API 搜索** 图标 |

- **模糊搜索** — 输入关键词即可按名称、参数、描述进行模糊匹配（如 `GP` 匹配 `GetPosition`）
- **筛选过滤** — 支持按版本（2.0 / 3.0）、模块、类型（函数 / 枚举 / 事件）筛选
- **详情查看** — 点击结果查看完整的参数列表、返回值等
- **点击跳转** — 点击结果条目跳转到声明源码位置
- **快速清空** — 在搜索输入框中按 `Ctrl+K` 清空查询内容

### ⚡ 补全

通过设置项 **`miniworld.completion`** 控制整个扩展的补全能力（默认启用，基于 UGC 2.0）：

| 值 | 行为 |
| :-: | :-: |
| `2.0`（默认） | 自动加载 2.0 声明（API/类型补全），并在 `ScriptSupportEvent([=[...]=])` 长括号内补全 2.0 事件，选中后自动包裹 `[=[ ... ]=]` |
| `3.0` | 自动加载 3.0 声明（API/类型补全），并在 `TriggerEvent.` / `ObjectEvent.` 之后补全 3.0 事件字段（枚举引用，无需长括号） |
| `off` | 移除 MiniWorld 声明并关闭事件补全，即完全关闭补全（也可用「清除 MiniWorld UGC 补全」命令一键设置） |

> 修改设置后无需重载窗口，扩展会自动切换声明并重新加载对应版本的事件定义。
>
> - **自动同步**：扩展根据该配置项自动加载对应版本的声明，无需手动管理声明文件
> - **切换确认**：检测到已启用其他版本补全（如设置为 `3.0` 但当前启用的是 `2.0`）时，会弹出提示框询问是否更换，确认后才执行切换；打开文件时则静默处理，不重复打扰

## 首次使用

打开任意 `.lua` 文件时，插件会根据补全模式设置自动启用对应版本的声明（默认 2.0），无需手动配置即可获得补全。

## 依赖要求

- [VS Code](https://code.visualstudio.com/) ^1.125.0
- [Lua 语言服务插件（sumneko.lua）](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) — 自动作为依赖安装

## 扩展命令

| 命令 | 说明 |
| :-: | :-: |
| `MiniWorld API Description: 添加 MiniWorld UGC 声明` | 选择版本（2.0/3.0）后将声明目录添加到 `Lua.workspace.library` |
| `MiniWorld API Description: 清除 MiniWorld UGC 补全` | 一键清除补全（将补全模式设为 `off`，移除声明并关闭事件补全） |
| `MiniWorld API Description: 打开 API 搜索` | 打开 API 搜索面板 |
| `MiniWorld API Description: 刷新 API 搜索索引` | 重新扫描声明文件，更新搜索索引 |

## 兼容性

| 项目 | 版本 |
| :-: | :-: |
| 《迷你世界》游戏 | v1.56+ |
| UGC 开发套件 | 3.0 & 2.0 |
| VS Code | ^1.125.0 |

## 注意事项

- 本扩展仅面向 **UGC 3.0** & **UGC 2.0**
- 部分接口可能与实际游戏版本存在差异，请以游戏实际行为为准
- 如发现问题或需要补充 API，欢迎提交 [Issue](https://github.com/LK-cmyk/MiniWorld-API-Desc/issues)

## 许可

[MIT](https://github.com/LK-cmyk/MiniWorld-API-Desc/blob/main/LICENSE)
