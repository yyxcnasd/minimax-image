# minimax-image

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供 MiniMax **H3 图像**生成与编辑的可安装 DSH bundle。

- **输入框开关** — 输入框工具行里、权限 chip 和模式 chip 旁边的 `生图：不允许 / 允许` chip（跟随客户端语言）。默认**不允许**，每个对话的选择由 Host 记住。
- **打开后多出两个工具** — 切到「允许」后模型同时获得：
  - `generate_image`：文生图（`POST /v1/images/generations`）；
  - `edit_image`：用 1–16 张参考图做编辑或合成（`POST /v1/images/edits`）。

  画面比例和面积档位由模型在每次调用时自己决定，插件不会用配置里的默认值去压它。
- **内置提示词 skill** — `minimax-image-prompting`：一份写给模型看的提示词手册，会先问清关键风格决策、为同一组图锁定一套美术方向，并把"不好看"变成下一条可执行的修改指令。
- **设置页** — 配置接口地址、模型（默认 `MiniMax-H3-Image`，可选 `MiniMax-H3-Image-Highspeed`）和 API Key。

## 安装

需要 profile 里合成了 Web surface（`@deepseek-ai/dsh-web-app`）：开关和设置页都是浏览器界面，Host 路由也挂在 web server 上。

### 从 GitHub 安装

```sh
dsh plugin --profile desktop add github:yyxcnasd/minimax-image
```

包是纯 ESM、没有构建脚本，所以 pnpm 安装时不会执行任何东西，也不需要 `allowBuilds`。要固定版本可以带上 commit：

```sh
dsh plugin --profile desktop add github:yyxcnasd/minimax-image#<commit-sha>
```

注意：git 安装会用 `git ls-remote` 访问 `github.com:443`，如果网络屏蔽该域名，请改用 npm 包或本地打包的 tarball（`dsh plugin --profile desktop add ./minimax-image-0.4.0.tgz`）。

### 从 npm 安装

```sh
dsh plugin --profile desktop add minimax-image
```

### 从本地目录安装

```sh
dsh plugin --profile desktop add ./minimax-image
```

`dsh plugin --profile <名字> add ...` 会在 `$DSH_HOME/profiles/<名字>` 里转发给 pnpm，然后把 bundle 追加进 `dsh.profile.bundles`。web profile 把 `desktop` 换成 `web` 即可，同一个 bundle 两边通用。

**安装通常立即生效**；如果 Loader 返回 `restart-required`，重启一次 DeepSeek Harness 即可。无论哪种情况，浏览器刷新一次就会加载新的 client。

卸载：

```sh
dsh plugin --profile desktop remove minimax-image
```

## 内置 skill

`skills/minimax-image-prompting.md` 在插件激活时注册为模型可调用的 skill，内容是写给模型的操作手册，覆盖：

1. **提问策略** — 最多问两个问题、每个都带推荐默认值，且只问真正改变画面的决策（用途与比例、瞬间与情绪、系列风格）；其余由模型自己定并说明。
2. **提示词骨架** — 七个槽位按序排列（主体与动作、环境、光线、镜头与构图、媒介、色彩与质感、情绪与细节），附带长度预算和不超过五项的 avoid 从句。
3. **比例与面积** — 用途到比例的对照表，以及 `1K / 2K / 4K` 的使用建议和"出图时报一句"的习惯。
4. **风格锁定** — 可复用的六行 style block，让一组图共享同一美术方向；规则是逐字重复，而不是说"和上一张一样"。
5. **编辑纪律** — 每次只改一到两处，明确写出"哪些必须保持不变"，以及多图参考如何分工。
6. **单变量迭代** — 一张"症状 → 该调哪个旋钮"的对照表：光太平、颜色艳俗、塑料感、构图太满、文字乱码、内容安全被拒。
7. **模板** — 产品图、人像、风光、美食、角色设定图、带中文标题的海报、插画，各自给出比例与面积建议。
8. **改写示例、工作习惯与版权边界** — 弱提示词到强提示词的对照、出图时报告比例和面积、未经授权不复刻真人肖像。

skill 通过 skill 注册表（`@deepseek-ai/dsh-skill`）和 `skill` 工具（`@deepseek-ai/dsh-tool-skill`）到达模型；缺少这两个包的 profile 仍可使用生图工具，只是不注册 skill。也可以把这份 markdown 直接放进 skills 目录走文件系统 skill——它保留了 frontmatter 就是为此，注册表路径会自动剥掉。

## 配置

1. **设置 → MiniMax 生图**：填写接口地址（`https://api.minimaxi.com`）、模型，粘贴 MiniMax API Key（`sk-api-…`），保存。
2. 在对话里把输入框的 chip 切到**允许**。
3. 直接描述你想要的图，或要求修改已有的图。

接口地址和模型存在 `$DSH_HOME/minimax-image/settings.json`，下一条请求即生效。API Key 存在 profile 凭据库的 `MINIMAX_IMAGE_API_KEY` 引用下，既不会写进插件配置，也不会写进 settings 文件。profile patch 里的那一行只提供初始接口、模型和凭据引用：

```yaml
- insert:
    - id: minimax-image
      name: minimax-image
      config:
        baseUrl: https://api.minimaxi.com
        model: MiniMax-H3-Image
        apiKeyEnv: MINIMAX_IMAGE_API_KEY
```

## 行为说明

- `generate_image` 发送 `model`、`prompt`、`n`、`response_format: "url"`、`area`、`aspect_ratio`（比例是 `auto` 时不发）。`edit_image` 额外发送 `images: [{ image_url }]`；本地文件会以内联 data URI 上传，单张上限 20 MB、单请求上限 45 MB，更大的文件请传 `http(s)` 链接。
- 服务端按比例和面积档位推导实际宽高，并在 `data[].size` 里返回；工具结果会把该尺寸写在每个文件路径旁边。
- 部分失败仍然是 HTTP 200：成功的照常保存，失败的写进工具结果；全部失败时才以服务端返回的原因报错。
- 文件落在 `<会话工作目录>/generated-images/`，命名为 `minimax-<时间戳>-<序号>.<扩展名>`（生成）或 `minimax-edit-<时间戳>-<序号>.<扩展名>`（编辑）。
- 工具结果是文本加路径；要让图片在对话里显示，用内置的 `read_image` 打开该路径。
- 开关弹出的是插件自己的菜单卡片（portal 到 `document.body`），用的是产品菜单的设计变量：↑/↓ 移动、Enter/Space 选择、Esc 关闭、点外部关闭，展开时箭头旋转 180°。

## 隐私

- 每对话开关：`$DSH_HOME/minimax-image/sessions.json`。
- 接口与模型：`$DSH_HOME/minimax-image/settings.json`。
- API Key：profile 凭据库（`$DSH_HOME/.credentials.yaml`，仅本人可读）。
- 生成的图片：会话工作目录下的 `generated-images/`。
- 请求只会发往配置的接口地址，不传输其他内容。

## 限制

- 未使用流式（`stream: true`），两个工具都等待完整响应。
- HEIC/HEIF 参考图只按扩展名识别。
- API Key 按凭据引用存储，与模型无关：换模型不用换 Key。
- 直接改动包内文件不会热替换正在运行的 Host 模块，代码更新需要重启一次。

## 发布

registry 包名就是 `minimax-image`，也就是 `dsh plugin add minimax-image` 解析到的名字。没有构建步骤：`index.js` 和 `client.js` 就是发布物，`files` 已列全运行所需资源。

```sh
npm publish
gh release create v0.4.0 --generate-notes   # 可选
```

## 许可证

MIT
