// 借样档案：墨锭、库管名册与借样单的持久化。
// 数据落在 data/ink-stick-testing.json，旧档案缺字段时按种子补齐并只读迁移。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOAN_STATUS } from "./loan-rules.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const dbPath = join(__dirname, "data", "ink-stick-testing.json");

const seed = {
  items: [
    {
      id: "IS-001",
      code: "IS-001",
      smokeSource: "黄山松烟",
      glueRatio: "7.5%",
      ageYears: 8,
      storage: "恒湿柜B",
      custodian: "王守库",
      status: "已试磨",
      logs: [
        { at: "2026-06-11", step: "试磨", note: "宣纸20滴水，出墨快，评分86", score: 86 },
      ],
    },
    {
      id: "IS-002",
      code: "IS-002",
      smokeSource: "桐油烟",
      glueRatio: "8%",
      ageYears: 3,
      storage: "试样盒C",
      custodian: "赵轮休",
      status: "待试磨",
      logs: [],
    },
  ],
  keepers: [
    { name: "王守库", onDuty: true },
    { name: "李藏墨", onDuty: true },
    { name: "赵轮休", onDuty: false },
  ],
};

// 种子借样单只放已结历史单（已归还/待鉴定），不预置未归还单，
// 免得新档案一上手就占住某锭的借样名额。
function seedLoans(db) {
  const byCode = (code) => db.items.find((x) => x.code === code);
  const loans = [];
  const is001 = byCode("IS-001");
  if (is001) {
    loans.push({
      id: "L20260910001",
      itemId: is001.id,
      inkCode: "IS-001",
      sampleNo: "LY-2026-001",
      borrower: "陈书道",
      purpose: "书写样张",
      keeper: "王守库",
      temperature: 22,
      humidity: 55,
      weightOut: 38.2,
      status: LOAN_STATUS.RETURNED,
      createdAt: "2026-09-10T09:30:00.000Z",
      returnedAt: "2026-09-12T10:05:00.000Z",
      verifier: "李藏墨",
      weightBack: 38.05,
      cornerCracked: false,
      loss: 0.15,
    });
  }
  const is002 = byCode("IS-002");
  if (is002) {
    loans.push({
      id: "L20260915002",
      itemId: is002.id,
      inkCode: "IS-002",
      sampleNo: "LY-2026-002",
      borrower: "林写生",
      purpose: "书写样张",
      keeper: "赵轮休",
      temperature: 21,
      humidity: 58,
      weightOut: 25,
      status: LOAN_STATUS.APPRAISAL,
      createdAt: "2026-09-15T14:20:00.000Z",
      returnedAt: "2026-09-18T16:40:00.000Z",
      verifier: "王守库",
      weightBack: 24.3,
      cornerCracked: true,
      loss: 0.7,
    });
  }
  return loans;
}

const seedCustodian = { "IS-001": "王守库", "IS-002": "赵轮休" };

// 旧档案迁移：补 id、保管人、库管名册和借样单，返回是否有改动。
function normalize(db) {
  let changed = false;
  if (!Array.isArray(db.items)) {
    db.items = structuredClone(seed.items);
    changed = true;
  }
  if (!Array.isArray(db.keepers) || !db.keepers.length) {
    db.keepers = structuredClone(seed.keepers);
    changed = true;
  }
  for (const item of db.items) {
    if (!item.id) {
      item.id = item.code || "IS-" + Date.now();
      changed = true;
    }
    if (!item.custodian) {
      item.custodian = seedCustodian[item.code] || db.keepers[0].name;
      changed = true;
    }
  }
  if (!Array.isArray(db.loans)) {
    db.loans = seedLoans(db);
    changed = true;
  }
  return changed;
}

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    const fresh = structuredClone(seed);
    fresh.loans = seedLoans(fresh);
    await writeFile(dbPath, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  if (normalize(db)) await saveDb(db);
  return db;
}

export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

// 档案变更（改编号或保管人）后调用：该锭所有未结单作废，旧记录只读不动。
export function invalidateOpenLoans(db, item, reason) {
  const voided = [];
  for (const loan of db.loans) {
    if (loan.itemId === item.id && loan.status === LOAN_STATUS.OPEN) {
      loan.status = LOAN_STATUS.VOID;
      loan.voidedAt = new Date().toISOString();
      loan.voidReason = reason;
      voided.push(loan);
    }
  }
  return voided;
}
