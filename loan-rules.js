// 借样规则：借样登记台的全部业务规则集中在本文件（纯逻辑，不依赖 HTTP 与文件存储）。
// 档案结构见 data/loan-archive.json，页面见 public/loan.html。

// 库房允许的温湿度区间（闭区间，越界即整单退回）
export const TEMP_RANGE = { min: 15, max: 25 }; // 摄氏度
export const HUMIDITY_RANGE = { min: 45, max: 65 }; // 相对湿度 %
// 归还核验：较出库少 0.5 克及以上，或边角有裂角，转待鉴定
export const WEIGHT_LOSS_LIMIT_G = 0.5;

export const STATUS = {
  OPEN: "未归还", // 未结单：每锭同时只允许一张
  APPRAISAL: "待鉴定", // 已归还但重量/边角异常
  RETURNED: "已归还", // 已归还且核验合格
  VOID: "失效", // 墨锭编号或保管人变更后作废，只读
};
// 列表可筛选的三种状态（失效单另入只读档案，不占筛选位）
export const FILTER_STATUSES = [STATUS.OPEN, STATUS.APPRAISAL, STATUS.RETURNED];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function trim(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

export function findCustodian(custodians, name) {
  return (custodians || []).find((c) => c.name === name);
}
export function isOnDuty(custodians, name) {
  const c = findCustodian(custodians, name);
  return !!c && c.duty !== "离岗";
}
export function findOpenLoan(loans, itemCode) {
  return (loans || []).find(
    (l) => l.itemCode === itemCode && l.status === STATUS.OPEN
  );
}

export function makeLoanId(now = new Date()) {
  const p2 = (n) => String(n).padStart(2, "0");
  const ymd = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}`;
  const hms = `${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
  return `JY-${ymd}-${hms}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// 出库登记前的整单校验：一次性收齐全部退回原因，调用方不得先写半截数据。
export function validateLoanInput(input, ctx) {
  const errors = [];
  const items = ctx.items || [];
  const custodians = ctx.custodians || [];

  const itemCode = trim(input.itemCode);
  if (!itemCode) {
    errors.push("缺留样编号，整单退回");
  } else if (!items.some((i) => i.code === itemCode)) {
    errors.push(`留样编号不存在：${itemCode}，纸卡与实物对不上，整单退回`);
  }

  const custodian = trim(input.custodian);
  if (!custodian) {
    errors.push("缺保管人，整单退回");
  } else if (!findCustodian(custodians, custodian)) {
    errors.push(`保管人不在名册：${custodian}，整单退回`);
  } else if (!isOnDuty(custodians, custodian)) {
    errors.push(`保管人 ${custodian} 已离岗，整单退回`);
  }

  const temp = Number(input.tempC);
  if (trim(input.tempC) === "" || !Number.isFinite(temp)) {
    errors.push("温度缺失或不是数字，整单退回");
  } else if (temp < TEMP_RANGE.min || temp > TEMP_RANGE.max) {
    errors.push(
      `温度 ${temp}℃ 越界（允许 ${TEMP_RANGE.min}~${TEMP_RANGE.max}℃），整单退回`
    );
  }

  const humidity = Number(input.humidity);
  if (trim(input.humidity) === "" || !Number.isFinite(humidity)) {
    errors.push("湿度缺失或不是数字，整单退回");
  } else if (humidity < HUMIDITY_RANGE.min || humidity > HUMIDITY_RANGE.max) {
    errors.push(
      `湿度 ${humidity}% 越界（允许 ${HUMIDITY_RANGE.min}~${HUMIDITY_RANGE.max}%），整单退回`
    );
  }

  const weight = Number(input.weightOutG);
  if (trim(input.weightOutG) === "" || !Number.isFinite(weight)) {
    errors.push("出库重量缺失或不是数字，整单退回");
  } else if (weight <= 0) {
    errors.push("出库重量必须大于 0 克，整单退回");
  }

  return errors;
}

// 出库登记：
// 1) 该锭已有未归还单 → 重复申请沿用首次，不新建、不再校验；
// 2) 任一规则不通过 → 整单退回，档案保持原样（不留半截）；
// 3) 全部通过才写入新单。
export function createLoan(archive, items, input, now = new Date()) {
  const loans = archive.loans || (archive.loans = []);
  const itemCode = trim(input.itemCode);
  const existing = itemCode ? findOpenLoan(loans, itemCode) : undefined;
  if (existing) {
    return { outcome: "reused", loan: existing };
  }

  const errors = validateLoanInput(input, {
    items,
    custodians: archive.custodians,
  });
  if (errors.length) {
    return { outcome: "rejected", errors };
  }

  const loan = {
    id: makeLoanId(now),
    itemCode,
    cardCode: trim(input.cardCode), // 纸卡编号：登记台负责让纸卡与实物对上
    borrower: trim(input.borrower),
    purpose: trim(input.purpose),
    custodian: trim(input.custodian), // 出库保管人
    tempC: round2(Number(input.tempC)),
    humidity: round2(Number(input.humidity)),
    weightOutG: round2(Number(input.weightOutG)),
    status: STATUS.OPEN,
    createdAt: now.toISOString(),
    returnedAt: null,
    return: null, // { at, custodian(另一位库管), weightInG, weightLossG, cornerCracked, reasons, note }
    voidedAt: null,
    voidReason: null,
  };
  loans.push(loan);
  return { outcome: "created", loan };
}

// 归还核验：必须由另一位在岗库管办理；少 0.5 克及以上或有裂角 → 待鉴定。
export function recordReturn(archive, input, now = new Date()) {
  const loan = (archive.loans || []).find((l) => l.id === input.id);
  if (!loan) return { outcome: "rejected", errors: ["借样单不存在"] };
  if (loan.status !== STATUS.OPEN) {
    return {
      outcome: "rejected",
      errors: [`单据 ${loan.id} 状态为「${loan.status}」，旧记录只读，不能再归还`],
    };
  }

  const errors = [];
  const verifier = trim(input.custodian);
  if (!verifier) {
    errors.push("缺核验保管人");
  } else if (!findCustodian(archive.custodians, verifier)) {
    errors.push(`核验人不在库管名册：${verifier}`);
  } else if (!isOnDuty(archive.custodians, verifier)) {
    errors.push(`核验库管 ${verifier} 已离岗`);
  } else if (verifier === loan.custodian) {
    errors.push("归还核验必须由另一位库管办理，不能是出库保管人本人");
  }

  const weightIn = Number(input.weightInG);
  if (trim(input.weightInG) === "" || !Number.isFinite(weightIn) || weightIn <= 0) {
    errors.push("归还重量缺失、不是数字或不大于 0");
  }
  if (errors.length) return { outcome: "rejected", errors };

  const cornerCracked = input.cornerCracked === true;
  const loss = round2(loan.weightOutG - weightIn);
  const reasons = [];
  if (loss >= WEIGHT_LOSS_LIMIT_G) {
    reasons.push(`重量少 ${loss} 克（达到 ${WEIGHT_LOSS_LIMIT_G} 克）`);
  }
  if (cornerCracked) reasons.push("边角有裂角");

  loan.return = {
    at: now.toISOString(),
    custodian: verifier,
    weightInG: round2(weightIn),
    weightLossG: loss,
    cornerCracked,
    reasons,
    note: trim(input.note),
  };
  loan.returnedAt = loan.return.at;
  loan.status = reasons.length ? STATUS.APPRAISAL : STATUS.RETURNED;
  return { outcome: "returned", loan };
}

// 墨锭档案变更联动：改墨锭编号或保管人，该锭未结单（未归还）立即失效、只读。
// 待鉴定/已归还都是已回库的结单，作为历史记录保留；失效单保留旧编号快照。
export function applyItemChange(archive, oldItem, patch, now = new Date()) {
  const changes = [];
  if (patch.code !== undefined && trim(patch.code) !== oldItem.code) {
    changes.push(["墨锭编号", oldItem.code, trim(patch.code)]);
  }
  const oldCustodian = oldItem.custodian ? String(oldItem.custodian) : "（未指派）";
  if (patch.custodian !== undefined && trim(patch.custodian) !== (oldItem.custodian ?? "")) {
    changes.push(["保管人", oldCustodian, trim(patch.custodian) || "（未指派）"]);
  }
  if (!changes.length) return [];

  const reason = changes
    .map(([field, from, to]) => `${field}由「${from}」改为「${to}」`)
    .join("；");
  const voided = [];
  for (const loan of archive.loans || []) {
    if (loan.status === STATUS.OPEN && loan.itemCode === oldItem.code) {
      loan.status = STATUS.VOID;
      loan.voidedAt = now.toISOString();
      loan.voidReason = reason;
      voided.push(loan);
    }
  }
  return voided;
}

// 库管在岗/离岗状态切换（离岗仅拦新申请，不影响已开单据）
export function setCustodianDuty(archive, name, duty) {
  const person = findCustodian(archive.custodians, name);
  if (!person) return { outcome: "rejected", errors: [`库管不在名册：${name}`] };
  if (duty !== "在岗" && duty !== "离岗") {
    return { outcome: "rejected", errors: ["在岗状态只能是「在岗」或「离岗」"] };
  }
  person.duty = duty;
  return { outcome: "updated", custodian: person };
}
