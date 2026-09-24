import assert from "node:assert";
import {
  TEMP_RANGE, HUMIDITY_RANGE, WEIGHT_LOSS_LIMIT_G, STATUS,
  createLoan, recordReturn, applyItemChange, setCustodianDuty,
} from "./loan-rules.js";

const items = [
  { code: "IS-001", custodian: "周云岫" },
  { code: "IS-002", custodian: "吴松涛" },
];
const fresh = () => ({
  custodians: [
    { name: "周云岫", duty: "在岗" },
    { name: "吴松涛", duty: "在岗" },
    { name: "郑砚农", duty: "离岗" },
  ],
  loans: [],
});
const validLoan = {
  itemCode: "IS-001", cardCode: "KA-1", borrower: "张三", purpose: "样张",
  custodian: "周云岫", tempC: 22, humidity: 55, weightOutG: 31.2,
};
const n = { pass: 0 };
const ok = (c, m) => { assert.ok(c, m); n.pass++; };

// 1. 正常出库
let db = fresh();
let r = createLoan(db, items, { ...validLoan });
ok(r.outcome === "created", "正常出库应创建");
ok(db.loans.length === 1 && db.loans[0].status === STATUS.OPEN, "单据为未归还");
const firstId = r.loan.id;

// 2. 每锭只留一张未归还单；重复申请沿用首次（即使第二次数据本身不合法也不再校验）
r = createLoan(db, items, { ...validLoan, tempC: 99, custodian: "郑砚农" });
ok(r.outcome === "reused" && r.loan.id === firstId, "重复申请沿用首次单据");
ok(db.loans.length === 1, "不得产生第二张单");

// 3. 整单退回：多原因一次收齐；档案不留半截
db = fresh();
r = createLoan(db, items, { itemCode: "", custodian: "郑砚农", tempC: 9, humidity: 90, weightOutG: "" });
ok(r.outcome === "rejected", "非法申请退回");
ok(r.errors.length === 5, "应一次给出 5 个原因: " + JSON.stringify(r.errors));
ok(db.loans.length === 0, "整单退回不留半截");

// 4. 单项退回：缺编号 / 离岗 / 温越界 / 湿越界 / 编号不存在
for (const bad of [
  { ...validLoan, itemCode: "" },
  { ...validLoan, custodian: "郑砚农" },
  { ...validLoan, tempC: TEMP_RANGE.min - 0.1 },
  { ...validLoan, tempC: TEMP_RANGE.max + 1 },
  { ...validLoan, humidity: HUMIDITY_RANGE.min - 1 },
  { ...validLoan, humidity: HUMIDITY_RANGE.max + 1 },
  { ...validLoan, itemCode: "IS-999" },
  { ...validLoan, weightOutG: -1 },
]) {
  db = fresh();
  r = createLoan(db, items, bad);
  ok(r.outcome === "rejected" && db.loans.length === 0, "应退回且不写档: " + JSON.stringify(bad));
}

// 5. 边界温湿度（闭区间）合法
db = fresh();
for (const env of [{ tempC: 15, humidity: 45 }, { tempC: 25, humidity: 65 }]) {
  const d = fresh();
  r = createLoan(d, items, { ...validLoan, itemCode: "IS-002", custodian: "吴松涛", ...env });
  ok(r.outcome === "created", "边界值合法 " + JSON.stringify(env));
}

// 6. 归还核验：另一位库管 + 重量边角都合格 → 已归还
db = fresh();
r = createLoan(db, items, { ...validLoan });
const id = r.loan.id;
r = recordReturn(db, { id, custodian: "吴松涛", weightInG: 31.0, cornerCracked: false });
ok(r.outcome === "returned" && r.loan.status === STATUS.RETURNED, "合格归还");
ok(r.loan.return.weightLossG === 0.2, "减重记录 0.2g");

// 7. 不能由出库保管人本人核验；离岗库管也不能核验
function freshWithOpen() {
  const d = fresh();
  createLoan(d, items, { ...validLoan });
  return d;
}
function openOne() {
  const d = freshWithOpen();
  return { d, id: d.loans[0].id };
}
let t7 = openOne();
r = recordReturn(t7.d, { id: t7.id, custodian: "周云岫", weightInG: 31 });
ok(r.outcome === "rejected" && /另一位/.test(r.errors.join()), "本人核验拒绝");
t7 = openOne();
r = recordReturn(t7.d, { id: t7.id, custodian: "不存在的人", weightInG: 31 });
ok(r.outcome === "rejected" && /名册/.test(r.errors.join()), "非库管核验拒绝");
// 核验库管离岗
setCustodianDuty(t7.d, "吴松涛", "离岗");
r = recordReturn(t7.d, { id: t7.id, custodian: "吴松涛", weightInG: 31 });
ok(r.outcome === "rejected" && /离岗/.test(r.errors.join()), "离岗库管不能核验");

// 8. 少 0.5 克及以上 → 待鉴定（边界正好 0.5）
db = freshWithOpen();
r = recordReturn(db, { id: db.loans[0].id, custodian: "吴松涛", weightInG: 31.2 - 0.5, cornerCracked: false });
ok(r.loan.status === STATUS.APPRAISAL && r.loan.return.weightLossG === 0.5, "减重达 0.5g 转待鉴定");
// 少于 0.5（0.49）仍合格
db = freshWithOpen();
r = recordReturn(db, { id: db.loans[0].id, custodian: "吴松涛", weightInG: 31.2 - 0.49, cornerCracked: false });
ok(r.loan.status === STATUS.RETURNED, "减重 0.49g 仍合格");
// 裂角即转待鉴定（重量无损也要转）
db = freshWithOpen();
r = recordReturn(db, { id: db.loans[0].id, custodian: "吴松涛", weightInG: 31.2, cornerCracked: true });
ok(r.loan.status === STATUS.APPRAISAL, "裂角转待鉴定");
// 重量变重（loss 为负）且无裂角 → 合格
db = freshWithOpen();
r = recordReturn(db, { id: db.loans[0].id, custodian: "吴松涛", weightInG: 32, cornerCracked: false });
ok(r.loan.status === STATUS.RETURNED, "重量变重且完好 → 已归还");

// 9. 旧记录只读：已归还/待鉴定单不能再次归还
r = recordReturn(db, { id: db.loans[0].id, custodian: "吴松涛", weightInG: 31 });
ok(r.outcome === "rejected" && /只读/.test(r.errors.join()), "已结单只读");

// 10. 改墨锭编号：该锭未结单失效、保留旧编号快照；其他锭不受影响
db = fresh();
createLoan(db, items, { ...validLoan }); // IS-001 周云岫
createLoan(db, items, { ...validLoan, itemCode: "IS-002", custodian: "吴松涛" });
const voided = applyItemChange(db, { code: "IS-001", custodian: "周云岫" }, { code: "IS-001A" });
ok(voided.length === 1 && voided[0].status === STATUS.VOID && voided[0].itemCode === "IS-001", "改编号作废旧单且快照保留");
ok(db.loans.find(l => l.itemCode === "IS-002").status === STATUS.OPEN, "其他锭未结单不受影响");
ok(/IS-001.*IS-001A/.test(voided[0].voidReason), "失效原因记录新旧编号");

// 11. 改保管人：未结单失效；已结单（待鉴定/已归还）保留不变
db = fresh();
createLoan(db, items, { ...validLoan });
applyItemChange(db, { code: "IS-001", custodian: "周云岫" }, { custodian: "吴松涛" });
ok(db.loans[0].status === STATUS.VOID && /保管人/.test(db.loans[0].voidReason), "改保管人作废旧单");
db = fresh();
createLoan(db, items, { ...validLoan });
recordReturn(db, { id: db.loans[0].id, custodian: "吴松涛", weightInG: 30, cornerCracked: true });
const v2 = applyItemChange(db, { code: "IS-001", custodian: "周云岫" }, { custodian: "吴松涛" });
ok(v2.length === 0 && db.loans[0].status === STATUS.APPRAISAL, "待鉴定单已是结单，不因改档案失效");
// 无实质变化不失效
ok(applyItemChange(freshWithOpen(), { code: "IS-001", custodian: "周云岫" }, { code: "IS-001" }).length === 0, "无变化不作废");

// 12. 失效单只读：归还被拒
r = recordReturn(db, { id: db.loans[0].id, custodian: "吴松涛", weightInG: 30 });
ok(r.outcome === "rejected", "失效单不能再归还");

// 13. 库管离岗设置只影响新申请
db = freshWithOpen();
setCustodianDuty(db, "周云岫", "离岗");
r = createLoan(db, items, { ...validLoan, itemCode: "IS-002", custodian: "吴松涛" });
ok(r.outcome === "created", "其他库管可继续出库");
r = createLoan(db, items, { ...validLoan, itemCode: "IS-001", custodian: "周云岫" });
// IS-001 仍有未归还单 → 沿用首次（离岗检查不触发）
ok(r.outcome === "reused", "已有未归还单时离岗不影响沿用");

console.log(`全部规则测试通过：${n.pass} 项断言`);
