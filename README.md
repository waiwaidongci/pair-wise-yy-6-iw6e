# 墨锭试磨室 · 借样登记台

成品墨锭借样（书写样张）登记与归还核验，附原试磨记录功能。

运行：

```bash
npm start
```

- `http://localhost:3037/` 借样登记台（借样申请、归还核验、档案变更、借样单列表）
- `http://localhost:3037/testing` 原试磨室页面

数据保存在 `data/ink-stick-testing.json`（墨锭、库管名册、借样单）。

## 代码结构（借样规则 / 档案 / 页面三个文件）

- `loan-rules.js` 借样规则：状态、温湿度上限、0.5 克损耗线、申请/归还/失效判定（纯函数）
- `loan-store.js` 借样档案：JSON 持久化、旧档案迁移、未结单作废
- `loan-page.js` 借样页面：登记台界面
- `server.js` 路由接线

## 借样规则

- 每锭同时只留一张未归还单，重复申请沿用首次（返回原单，不新开）。
- 缺留样编号、保管人离岗（或不在名册）、温湿度越界（温度 10–28℃、湿度 35–65%RH）→ 整单退回，不落任何半截记录。
- 归还须由另一位库管核验重量和边角；少 0.5 克以上（含）或有裂角 → 转待鉴定，否则已归还。
- 改墨锭编号或保管人 → 该锭未结单立即失效（已失效）；已结旧记录只读，接口拒绝改动。
- 借样单状态：未归还 / 待鉴定 / 已归还（列表可按此三种状态筛选，另可查看已失效）。

## 主要接口

- `GET /api/loans?status=未归还|待鉴定|已归还|已失效` 借样单列表（可按状态筛选）
- `POST /api/loans` 借样申请 `{ itemId, sampleNo, borrower, purpose?, temperature, humidity, weightOut }`
- `POST /api/loans/:id/return` 归还核验 `{ verifier, weightBack, cornerCracked }`
- `PATCH /api/items/:id` 档案变更（改 `code` 或 `custodian` 会作废未结单）
- `GET /api/keepers` 库管名册（含在岗状态）
