# 黄金矿工 · Gold Miner

一个完整可玩的「黄金矿工」复刻：**200 个关卡**、纯 Canvas 程序化美术（无任何图片素材）、WebAudio 合成音效、商店系统、存档。
同时附带一套 **iOS 打包方案**，可以编译成未签名 IPA，在装了 **TrollStore** 的 iPhone 上直接安装。

---

## 一、玩法

- **点击屏幕**放下钩子：钩子会在矿工手上左右摆动，抓到东西后自动收回。
- 在**限时**内挖到**目标金额**即可过关，剩余时间按每秒 $3 折算成奖励。
- 抓到的钱进钱包，过关后可在**矿山商店**买道具。

| 物品 | 价值 | 重量（收绳速度） |
|---|---|---|
| 小金块 | $60 | 轻 |
| 中金块 | $130 | 中 |
| 大金块 | $320 | 重 |
| 钻石 | $650 | 极轻（最划算） |
| 钱袋（神秘袋） | 随机 $40 ~ $1000 / 炸药 / 力量药水 / 也可能是炸弹 | 中 |
| 老鼠 | $45 | 轻，会左右乱窜 |
| 石头（小/大） | $12 / $24 | 很重，别浪费时间 |
| 骨头 | $6 | 轻，纯坑 |
| TNT | 钩到即爆，炸毁周围一圈物品 | — |
| 力量药水 | 钩到后 9 秒收绳速度 ×1.9 | — |

**商店道具**：炸药（直接炸掉钩住的大石头）、强力手套（下一关收绳 +90%）、幸运星（下一关收益 +25%）、怀表（下一关 +12 秒）。

**关卡设计**：200 关由确定性算法生成，8 种矿层主题轮换（黄金矿脉 / 钻石洞窟 / 岩石断层 / 爆破区 / 地鼠巢穴 / 宝藏深处 / 深井 / 普通矿层）。
**难度**：主菜单可选三档——轻松 / 标准 / 硬核，随时切换并本地记住。

目标金额不再拍脑袋按「总价值百分比」定，而是由 `estIncome()` 按每件物品的**抓取耗时**做贪心模拟，算出「这个时限内真正能挖到多少钱」，再乘一个随关卡上升的系数 K（标准档 0.74 → 0.92）。这样保证每一关都是**可完成但必须高效**，不会出现目标远超产能的死关。
难度递增来自三条线同时收紧：限时（标准 66s → 44s）、目标系数 K、摆钩速度（0.95 → 2.0 rad/s，后期需要更准的时机）。

---

## 二、三种运行方式

### 方式 A：浏览器直接玩（最快）

双击 `www/index.html` 即可。手机上可用 Safari 打开后「添加到主屏幕」，全屏无地址栏。

### 方式 B：GitHub 云端编译 IPA（Windows 也能用，推荐）

不需要 Mac、不需要开发者账号。

1. 新建一个 GitHub 仓库，把 `gold-miner` 目录里的全部内容上传（网页版拖拽即可；`.github/` 目录要一起传，否则 Actions 里看不到这个 workflow）。
2. 仓库页面 → **Actions** → 左侧 **Build unsigned IPA** → **Run workflow**，镜像保持默认 `macos-15` 即可。
3. 等 5~10 分钟（macOS 机器会自动 `xcodegen` + `xcodebuild`）。
4. 进入构建结果页面，底部 **Artifacts** 下载 `GoldMiner-ipa.zip`，解压得到 **`GoldMiner.ipa`**。

> **镜像退役提示**：GitHub 会周期性下线旧 macOS 镜像。如果 Run workflow 后任务秒挂、注解里写着
> `The configuration 'macos-14-arm64-us-default' is not supported`，说明 `runs-on` 指向了一个已退役的镜像
> （macOS 14 已于 2026-11-02 下线）。本 workflow 现在默认 `macos-15`，并在手动触发时提供镜像下拉框
> （`macos-15` / `macos-26` / `macos-latest` / `macos-15-intel`），换一个重跑即可，不用改文件。

### 方式 C：Mac 本地编译

```bash
cd gold-miner
bash ios/build-ipa.sh
# 产物：ios/GoldMiner.ipa
```

依赖：Xcode（App Store 安装）+ `brew install xcodegen`（脚本会自动装）。

---

## 三、TrollStore 安装 IPA

1. 确认手机已装 **TrollStore**（支持 iOS 14.0 ~ 16.6.1、17.0 等版本，具体以官方为准）。
2. 把 `GoldMiner.ipa` 传到手机（AirDrop / 文件 App / 微信「文件传输助手」均可）。
3. 打开 **TrollStore** → 右下角 **+** → **Install IPA File** → 选择 `GoldMiner.ipa`。
4. 回到桌面，出现「黄金矿工」图标，点开即玩。

> 这个 IPA 是**未签名**的，TrollStore 会自己完成伪签名与安装，所以不需要证书、不需要 Apple ID。
> 如果误用 AltStore / Sideloadly 之类的工具，则需要自己的签名证书，且 7 天过期。

---

## 四、工程结构

```
gold-miner/
├── www/
│   ├── index.html          # 页面骨架（全屏适配、禁止缩放）
│   └── game.js             # 全部游戏逻辑 + 美术 + 音效（约 2000 行）
├── ios/
│   ├── project.yml         # XcodeGen 工程描述（免手写 pbxproj）
│   ├── build-ipa.sh        # macOS 本地一键出 IPA
│   └── GoldMiner/
│       ├── App.swift       # SwiftUI + WKWebView 外壳（加载本地 www）
│       ├── Assets.xcassets # App 图标（脚本生成，1024×1024）
│       └── www/            # 游戏资源副本，被打包进 .app/Resources/www
├── .github/workflows/
│   └── build-ipa.yml       # 云端编译 iOS IPA
└── tools/
    ├── smoke.js            # 无浏览器测试：机器人三档各体测 200 关
    ├── tune.js             # 难度调参器：指定档位跑机器人，输出分段胜率
    ├── shot.html           # 截图调试页
    └── icon.html           # 程序化生成 App 图标
```

游戏是完全离线的：`.app` 里带着 `www/`，WKWebView 用 `loadFileURL` 读取，不联网、不请求任何资源。

---

## 五、开发与自测

```bash
node tools/smoke.js   # 数值平衡：机器人跑三档 × 200 关
node tools/tap.js     # 输入回归：模拟 iOS TouchEvent 点菜单/芯片/放钩
```

它用桩件（stub）在 Node 里跑真实游戏代码：
- 校验 200 关的物品是否出界、目标是否为正、时间是否过短；
- 用一个「自动瞄准机器人」把三档难度各 200 关全部打一遍，输出分段通关率（当前：轻松 ~90%、标准 ~75%、硬核 ~63%；机器人不会用炸药/手套/怀表，人类熟练后上限更高）；
- 渲染全部界面，防止空指针。

`tools/tap.js` 会用「只有 `changedTouches`、没有 `clientX`」的事件对象去点菜单——这正是 iOS Safari/WKWebView 里 TouchEvent 的真实形态（TouchEvent 不继承 MouseEvent）。桌面浏览器永远测不出这个问题，所以单独留了一个回归用例。

只关心某档的胜率可以用调参器（多跑几轮取平均，避免钱袋随机性干扰）：

```bash
node tools/tune.js '{"diff":1,"runs":5}'   # 0=轻松 1=标准 2=硬核
```

修改 `game.js` 后重跑一次即可确认没有破坏数值平衡。

**调整难度**的入口有两处：

```js
// 1) 三档难度的系数（game.js 顶部）
var DIFFS = [
  { key: 'easy',   name: '轻松', k0: 0.60, kk: 0.0008, kcap: 0.80, time: 1.14, swing: 0.94 },
  { key: 'normal', name: '标准', k0: 0.74, kk: 0.0009, kcap: 0.96, time: 1.00, swing: 1.00 },
  { key: 'hard',   name: '硬核', k0: 0.82, kk: 0.0006, kcap: 0.94, time: 0.86, swing: 1.08 }
]; // k0/kk/kcap: 目标系数 K 的起点/斜率/上限；time: 时限倍率；swing: 摆钩速度倍率

// 2) 关卡曲线（generateLevel）
var time  = 66 - Math.floor(n / 9);                  // 基准时限 66s → 44s
var count = Math.min(32, 13 + Math.floor(n * 0.62)); // 物品数量
var goal  = estIncome(items, time) * K;              // 目标 = 可达收益 × K
```

---

## 六、说明

- 玩法致敬经典《黄金矿工》，但代码、美术、音效全部为本工程原创：所有金块/石头/钻石/矿工都是 Canvas 代码实时绘制，没有任何第三方图片或音频文件。
- 存档保存在浏览器/WebView 的 `localStorage`（键名 `goldminer.save.v2`），卸载 App 会一起清空。
