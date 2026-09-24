// 借样页面：借样登记台的全部界面（申请、归还核验、档案变更、状态筛选列表）。
// 只负责渲染和调接口，业务判定都在 loan-rules.js。

export function loanPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>借样登记台 · 墨锭试磨室</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; --blue:#3d5a80; --gray:#6c757d; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; } h3 { margin:0; font-size:16px; } main { display:grid; grid-template-columns:400px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; } button.secondary { background:#69736a; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; } .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; } .card { display:grid; gap:8px; align-content:start; }
    .meta { color:var(--muted); font-size:13px; } .warn { color:var(--warn); font-weight:700; }
    .pill { display:inline-block; border-radius:999px; padding:3px 10px; font-size:12px; color:#fff; }
    .pill.open { background:var(--blue); } .pill.returned { background:var(--accent); } .pill.appraisal { background:var(--warn); } .pill.void { background:var(--gray); text-decoration:line-through; }
    .msg { margin-top:10px; font-size:13px; display:none; border-radius:6px; padding:8px 10px; }
    .msg.ok { display:block; background:#e8f0e4; color:#33502a; } .msg.err { display:block; background:#f6e7e2; color:var(--warn); }
    .msg ul { margin:6px 0 0; padding-left:18px; }
    .hint { color:var(--muted); font-size:12px; margin-top:4px; }
    .row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .checkline { display:flex; align-items:center; gap:8px; margin-top:10px; } .checkline input { width:auto; } .checkline label { margin:0; }
    .head-actions { display:flex; gap:10px; align-items:center; } .head-actions a { color:var(--accent); font-weight:700; text-decoration:none; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header>
    <div><h1>借样登记台</h1><div class="meta">成品墨锭书写样张借还登记 · 每锭同时仅一张未归还单 · 旧记录只读</div></div>
    <div class="head-actions"><a href="/testing">试磨室 →</a><button id="reload">刷新</button></div>
  </header>
  <main>
    <section>
      <form id="applyForm">
        <h2>借样申请</h2>
        <label>墨锭</label><select name="itemId" id="applyItem"></select>
        <label>留样编号 *</label><input name="sampleNo" placeholder="如 LY-2026-003">
        <label>借用人 *</label><input name="borrower" placeholder="借样做书写样张的人">
        <label>用途</label><input name="purpose" value="书写样张">
        <div class="row">
          <div><label>温度（℃）*</label><input name="temperature" type="number" step="0.1" placeholder="10–28"></div>
          <div><label>湿度（%RH）*</label><input name="humidity" type="number" step="0.1" placeholder="35–65"></div>
        </div>
        <label>借出重量（克）*</label><input name="weightOut" type="number" step="0.01" min="0">
        <div class="hint">缺留样编号、保管人离岗或温湿度越界，整单退回且不留记录；重复申请沿用首次单。</div>
        <button style="margin-top:10px">提交申请</button>
        <div class="msg" id="applyMsg"></div>
      </form>
      <form id="returnForm" style="margin-top:14px">
        <h2>归还核验</h2>
        <label>未归还单</label><select name="loanId" id="returnLoan"></select>
        <label>核验库管 *</label><select name="verifier" id="verifier"></select>
        <div class="hint">须为另一位库管（与借单保管人不同），核验重量与边角。</div>
        <label>归还重量（克）*</label><input name="weightBack" type="number" step="0.01" min="0">
        <div class="checkline"><input type="checkbox" name="cornerCracked" id="cornerCracked"><label for="cornerCracked">有裂角</label></div>
        <div class="hint">少 0.5 克以上或有裂角，即转待鉴定。</div>
        <button style="margin-top:10px">提交归还</button>
        <div class="msg" id="returnMsg"></div>
      </form>
      <form id="archiveForm" style="margin-top:14px">
        <h2>档案变更</h2>
        <label>墨锭</label><select name="itemId" id="archiveItem"></select>
        <label>新墨锭编号</label><input name="code" placeholder="留空则不改">
        <label>新保管人</label><select name="custodian" id="archiveKeeper"><option value="">保持不变</option></select>
        <div class="hint warn">改墨锭编号或保管人，该锭未结单立即失效。</div>
        <button style="margin-top:10px">提交变更</button>
        <div class="msg" id="archiveMsg"></div>
      </form>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div class="toolbar">
        <select id="statusFilter"><option value="">全部状态</option></select>
        <input id="search" placeholder="搜索单号、编号、借用人">
      </div>
      <div class="panel"><h2>借样单列表</h2><div class="grid" id="cards"></div></div>
    </section>
  </main>
  <script>
    const STATUS_LIST = ["未归还","待鉴定","已归还","已失效"];
    const STATUS_CLASS = { "未归还":"open", "待鉴定":"appraisal", "已归还":"returned", "已失效":"void" };
    let items = [], keepers = [], loans = [];
    const $ = (sel) => document.querySelector(sel);
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ "Content-Type":"application/json" } } : options);
      const data = await res.json();
      if (!res.ok) { const err = new Error(data.message || data.error || "请求失败"); err.data = data; throw err; }
      return data;
    }
    function fmt(iso) { return (iso || "").slice(0, 16).replace("T", " "); }
    function showMsg(el, ok, html) { el.className = "msg " + (ok ? "ok" : "err"); el.innerHTML = html; }
    function reasonList(data) {
      const reasons = (data && data.reasons) || [];
      return (data && data.message ? "<div>" + data.message + "</div>" : "") + (reasons.length ? "<ul>" + reasons.map(r => "<li>" + r + "</li>").join("") + "</ul>" : "");
    }
    function keeperLabel(k) { return k.name + (k.onDuty ? "" : "（离岗）"); }
    function renderSelects() {
      const itemOpts = items.map(i => '<option value="' + i.id + '">' + i.code + " · 保管人 " + (i.custodian || "未指派") + "</option>").join("");
      $("#applyItem").innerHTML = itemOpts;
      $("#archiveItem").innerHTML = itemOpts;
      const open = loans.filter(l => l.status === "未归还");
      $("#returnLoan").innerHTML = open.length
        ? open.map(l => '<option value="' + l.id + '">' + l.id + " · " + l.inkCode + " · " + l.borrower + " · 保管人 " + l.keeper + "</option>").join("")
        : '<option value="">（暂无未归还单）</option>';
      $("#verifier").innerHTML = keepers.map(k => "<option>" + keeperLabel(k) + "</option>").join("");
      $("#archiveKeeper").innerHTML = '<option value="">保持不变</option>' + keepers.map(k => "<option>" + k.name + "</option>").join("");
    }
    function renderStats() {
      $("#stats").innerHTML = STATUS_LIST.map(s =>
        '<div class="stat"><span>' + s + '</span><strong>' + loans.filter(l => l.status === s).length + "</strong></div>"
      ).join("");
    }
    function cardHtml(loan) {
      let html = '<article class="card"><h3>' + loan.id + ' <span class="pill ' + STATUS_CLASS[loan.status] + '">' + loan.status + "</span></h3>";
      html += "<div><b>墨锭</b> " + loan.inkCode + " · <b>留样编号</b> " + loan.sampleNo + "</div>";
      html += "<div><b>借用人</b> " + loan.borrower + " · <b>用途</b> " + (loan.purpose || "书写样张") + "</div>";
      html += "<div><b>保管人</b> " + loan.keeper + " · <b>环境</b> " + loan.temperature + "℃ / " + loan.humidity + "%RH</div>";
      html += "<div><b>借出重量</b> " + loan.weightOut + " 克 · <b>申请时间</b> " + fmt(loan.createdAt) + "</div>";
      if (loan.status === "已归还" || loan.status === "待鉴定") {
        html += "<div><b>核验库管</b> " + loan.verifier + " · <b>归还重量</b> " + loan.weightBack + " 克 · <b>损耗</b> " + loan.loss + " 克 · <b>裂角</b> " + (loan.cornerCracked ? "有" : "无") + "</div>";
        html += '<div class="meta">归还时间 ' + fmt(loan.returnedAt) + " · 旧记录只读</div>";
      } else if (loan.status === "已失效") {
        html += '<div class="warn">' + (loan.voidReason || "已失效") + "</div>";
        html += '<div class="meta">失效时间 ' + fmt(loan.voidedAt) + " · 旧记录只读</div>";
      } else {
        html += '<button class="secondary" data-fill="' + loan.id + '">去归还</button>';
      }
      return html + "</article>";
    }
    function renderCards() {
      const status = $("#statusFilter").value;
      const q = $("#search").value.trim();
      const visible = loans.filter(l => (!status || l.status === status) && (!q || JSON.stringify(l).includes(q)));
      $("#cards").innerHTML = visible.length ? visible.map(cardHtml).join("") : '<div class="meta">暂无借样单</div>';
      document.querySelectorAll("[data-fill]").forEach(btn => btn.onclick = () => {
        $("#returnLoan").value = btn.dataset.fill;
        $("#returnForm").scrollIntoView({ behavior: "smooth" });
      });
    }
    function render() { renderSelects(); renderStats(); renderCards(); }
    async function load() {
      [items, keepers, loans] = await Promise.all([api("/api/items"), api("/api/keepers"), api("/api/loans")]);
      render();
    }
    $("#applyForm").onsubmit = async (event) => {
      event.preventDefault();
      const msg = $("#applyMsg");
      try {
        const body = Object.fromEntries(new FormData(event.target).entries());
        const loan = await api("/api/loans", { method: "POST", body: JSON.stringify(body) });
        showMsg(msg, true, loan.reused ? "重复申请，已沿用首次借样单 " + loan.id : "已开借样单 " + loan.id + "（未归还）");
        event.target.reset(); event.target.purpose.value = "书写样张";
        await load();
      } catch (err) { showMsg(msg, false, reasonList(err.data) || err.message); }
    };
    $("#returnForm").onsubmit = async (event) => {
      event.preventDefault();
      const msg = $("#returnMsg");
      const form = event.target;
      if (!form.loanId.value) { showMsg(msg, false, "暂无未归还单可还"); return; }
      try {
        const body = { verifier: form.verifier.value.replace("（离岗）", ""), weightBack: form.weightBack.value, cornerCracked: form.cornerCracked.checked };
        const loan = await api("/api/loans/" + form.loanId.value + "/return", { method: "POST", body: JSON.stringify(body) });
        showMsg(msg, true, loan.status === "待鉴定"
          ? "损耗 " + loan.loss + " 克" + (loan.cornerCracked ? "，有裂角" : "") + "，已转待鉴定"
          : "核验通过，损耗 " + loan.loss + " 克，已归还");
        form.reset();
        await load();
      } catch (err) { showMsg(msg, false, reasonList(err.data) || err.message); }
    };
    $("#archiveForm").onsubmit = async (event) => {
      event.preventDefault();
      const msg = $("#archiveMsg");
      const form = event.target;
      const body = {};
      if (form.code.value.trim()) body.code = form.code.value.trim();
      if (form.custodian.value) body.custodian = form.custodian.value;
      if (!Object.keys(body).length) { showMsg(msg, false, "未填写任何变更"); return; }
      try {
        const item = await api("/api/items/" + form.itemId.value, { method: "PATCH", body: JSON.stringify(body) });
        const n = (item.voidedLoans || []).length;
        showMsg(msg, true, "档案已保存" + (n ? "，作废未结单 " + n + " 张：" + item.voidedLoans.join("、") : "，无未结单受影响"));
        form.reset();
        await load();
      } catch (err) { showMsg(msg, false, reasonList(err.data) || err.message); }
    };
    $("#statusFilter").innerHTML = '<option value="">全部状态</option>' + STATUS_LIST.map(s => "<option>" + s + "</option>").join("");
    $("#statusFilter").onchange = renderCards;
    $("#search").oninput = renderCards;
    $("#reload").onclick = load;
    load();
  </script>
</body>
</html>`;
}
