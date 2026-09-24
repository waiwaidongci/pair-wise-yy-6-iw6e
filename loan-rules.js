// 借样规则：借样申请、归还核验、失效判定的全部业务规则。
// 只放常量与纯函数，不碰存储和 HTTP，方便单独核对规则。

// 借样单状态：未归还 → 已归还 / 待鉴定；档案变更会把未结单作废为已失效。
export const LOAN_STATUS = {
  OPEN: "未归还",
  RETURNED: "已归还",
  APPRAISAL: "待鉴定",
  VOID: "已失效",
};

// 列表可按状态筛选：三种结单状态（未归还/待鉴定/已归还）外加作废态。
export const FILTER_STATUSES = [
  LOAN_STATUS.OPEN,
  LOAN_STATUS.APPRAISAL,
  LOAN_STATUS.RETURNED,
  LOAN_STATUS.VOID,
];

// 留样环境允许范围，温度或湿度越界即整单退回。
export const ENV_RULES = [
  { key: "temperature", label: "温度", unit: "℃", min: 10, max: 28 },
  { key: "humidity", label: "湿度", unit: "%RH", min: 35, max: 65 },
];

// 归还损耗阈值：少 0.5 克以上（含 0.5 克）即转待鉴定。
export const LOSS_THRESHOLD_G = 0.5;

// 每锭同时只留一张未归还单：按墨锭找未结单，命中即沿用首次申请。
export function findOpenLoan(loans, itemId) {
  return loans.find(
    (loan) => loan.itemId === itemId && loan.status === LOAN_STATUS.OPEN
  );
}

// 借样申请校验：任一不满足即整单退回，调用方不得落库任何半截记录。
export function validateApplication({ item, input, keepers }) {
  const errors = [];
  const sampleNo = String(input.sampleNo ?? "").trim();
  if (!sampleNo) errors.push("缺留样编号");
  const borrower = String(input.borrower ?? "").trim();
  if (!borrower) errors.push("缺借用人");
  const keeperName = item && item.custodian;
  const keeper = keepers.find((k) => k.name === keeperName);
  if (!keeperName) {
    errors.push("保管人未指派");
  } else if (!keeper) {
    errors.push(`保管人 ${keeperName} 不在库管名册`);
  } else if (!keeper.onDuty) {
    errors.push(`保管人 ${keeperName} 离岗`);
  }
  for (const rule of ENV_RULES) {
    const value = Number(input[rule.key]);
    if (!Number.isFinite(value)) {
      errors.push(`${rule.label}需为数字`);
    } else if (value < rule.min || value > rule.max) {
      errors.push(
        `${rule.label} ${value}${rule.unit} 越界（允许 ${rule.min}–${rule.max}${rule.unit}）`
      );
    }
  }
  const weightOut = Number(input.weightOut);
  if (!Number.isFinite(weightOut) || weightOut <= 0) {
    errors.push("借出重量需为正数（克）");
  }
  return { ok: errors.length === 0, errors };
}

// 归还校验：旧记录只读由调用方先挡，这里只管核验人与归还重量。
export function validateReturn({ loan, input, keepers }) {
  const errors = [];
  const verifier = String(input.verifier ?? "").trim();
  if (!verifier) {
    errors.push("缺核验库管");
  } else if (!keepers.some((k) => k.name === verifier)) {
    errors.push(`核验人 ${verifier} 不在库管名册`);
  } else if (verifier === loan.keeper) {
    errors.push("归还须由另一位库管核验");
  }
  const weightBack = Number(input.weightBack);
  if (!Number.isFinite(weightBack) || weightBack <= 0) {
    errors.push("归还重量需为正数（克）");
  }
  return { ok: errors.length === 0, errors };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

// 归还定级：损耗 0.5 克以上或有裂角 → 待鉴定，否则已归还。
export function decideReturn({ weightOut, weightBack, cornerCracked }) {
  const loss = round3(Number(weightOut) - Number(weightBack));
  const notes = [];
  if (loss >= LOSS_THRESHOLD_G) {
    notes.push(`损耗 ${loss} 克，达到 ${LOSS_THRESHOLD_G} 克线`);
  }
  if (cornerCracked) notes.push("有裂角");
  return {
    loss,
    status: notes.length ? LOAN_STATUS.APPRAISAL : LOAN_STATUS.RETURNED,
    notes,
  };
}

// 档案变更判定：改墨锭编号或保管人才会让未结单失效，其余字段不动单。
export function invalidationReason(before, after) {
  const changes = [];
  if (before.code !== after.code) {
    changes.push(`墨锭编号由 ${before.code} 改为 ${after.code}`);
  }
  if (before.custodian !== after.custodian) {
    changes.push(`保管人由 ${before.custodian || "未指派"} 改为 ${after.custodian || "未指派"}`);
  }
  return changes.length ? `档案变更：${changes.join("；")}` : null;
}
