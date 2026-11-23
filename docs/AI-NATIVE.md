# lilyco-native-web/1 — 让网页成为 Agent 的可编程界面

lilyco 的四接口约定是同一份能力同时暴露为 **CLI / TUI / Web / MCP**。材料通把这条约定落到网页上：网页不是 Agent 的"截图对象"，而是一套有稳定语义地址的动作集。

## 三条硬规则

**1. 单一状态源。** 所有状态在 `src/lib/store.ts`，UI 通过 `useSyncExternalStore` 订阅，自己不留平行状态。Agent 读到的和人看到的是同一份数据；Agent 改了状态，人眼立刻看到，反之亦然。

**2. 人类与 Agent 同一条 action 链。** `store.setField()` 既被输入框 `onChange` 调用，也被 `__materialpass.invoke("set_field")` 调用。没有"给 AI 的简化版"，也就没有 AI 绕过校验的旁路。

**3. 提交类动作需要人类闸门。** `approve` 必须显式 `byHuman: true`，否则抛错。任何 `patch_arg` 都会把草稿打回 `pending_review`——改了就重审，这是政务材料该有的规矩。

## 语义路径

DOM 上每个有语义的元素带 `data-mp-path`，命名规范见 `public/manifest.json`：

```
vault.field.personal.name          档案字段
vault.material.<key>.spec          某份材料的规格选择器
process.material.<key>.apply       某份材料的处理应用按钮
review.draft.<id>.approve          某份草稿的人工批准闸门
```

为什么不用 CSS selector 或文案：placeholder 和按钮文案会改，改一次 Agent 的脚本就废一次。语义路径是发布契约的一部分，改名等于 breaking change。

`__materialpass.paths()` 实时返回当前 DOM 里的全部路径，Agent 可自省；`snapshot` 动作返回编号文本视图，比让模型读整棵 DOM 便宜一个数量级。

## 与 lilyco-web2cli 的分工

| | 材料通（本项目） | lilyco-web2cli |
|---|---|---|
| 面向 | 人类核对、补全、签字 | 跨站点机器填报 |
| 资料库 | 浏览器 IndexedDB，加密备份 | `~/.lilyco` 下 JSON profile |
| 表单发现 | 不做（人已知要交什么） | `inspect` 抓 form/OpenAPI/HAR → `WebCliSpec` |
| 提交 | 永不提交，只导出提交包 | `commit-submit` 受控发包 + 回执 |
| 闸门 | `byHuman: true` 的 approve | `HumanReviewGate` 截图暂停 |

资料库格式（`VaultProfile`：`name / categories<category<key,value>> / attachments<key,{category,label,path,mime_hint}>`）与 Rust 侧逐字段一致，这条已用真实 `vault --op import` 跑通验证过。草稿侧对齐的是字段命名和 `status ∈ pending_review|approved|rejected|submitted`；CLI 真正发包用的草稿由 `prepare-submit` 生成，它比网页草稿多一个必填的 `command`（`WebCommandSpec`，即"往哪个站点提交什么"），网页这份是给人签字的那条记录。所以：

```bash
# 网页「导出 lweb2cli 互通资料库」→ 交给 CLI 复放到真实政务站点
lweb2cli vault --op import --profile materialpass --file materialpass-vault.json
lweb2cli prepare-submit --source https://… --profile 张阿姨 --session gov
lweb2cli review --op show --id <draft_id>
lweb2cli commit-submit --id <draft_id>
```

这条链是作品的实际价值：网页让人敢用，CLI 让机器能跑，两边都不重复造轮子。

实测记录（2026-11-22，本机 debug 构建）：网页「导出 lweb2cli 互通资料库」得到的 JSON，
交给 `lweb2cli vault --op import --profile materialpass --file materialpass-vault.json`，
返回 `{"imported":true,"profile":"materialpass","categories":["company","contact","finance","legal_rep","personal"],"attachments_count":2}`。

Agent 侧注意一个我们真踩过的坑：`export_vault_lweb2cli` / `export_draft` 的返回是信封
`{ ok: true, json: "<…JSON 字符串>" }`，**落盘要写 `.json` 字段本身**，把整个信封存成文件
会让 CLI 报 `missing field \`name\``：

```js
const r = await mp.invoke("export_vault_lweb2cli");
await writeFile("materialpass-vault.json", r.json); // 不是 r
```

线上部署后同一件事又验了一遍（2026-11-23，公开域名 `materialpass-r96hu96ehfl.qoder.zone`）：
真实文件控件上传 → 刷新页面材料仍在（IndexedDB 在该 origin 生效）→ 一键对齐 295×413 / 9 KB →
预审 0 错 0 警 → AI 自批被拒 → 未签字导出被拒 → 人类在弹窗里勾选签字 → `approved`、导出 1106 字节、
2 份附件 → 签字后改一个字段立刻回到 `pending_review` 且再次导出被拒；该线上导出的资料库喂给真实
`lweb2cli` 同样返回 `imported:true`。全程控制台零报错。
