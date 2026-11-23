"use strict";

const parameters = new URLSearchParams(window.location.search);
const requestedPrice = parameters.get("price");
const price = ["268", "298", "328"].includes(requestedPrice) ? requestedPrice : "298";
document.getElementById("amount").textContent = price;

const notice = document.getElementById("notice");
const notify = document.getElementById("notify");

function sessionCode() {
  const assigned = parameters.get("session");
  if (/^P-\d{3,6}$/.test(assigned)) return assigned;
  if (/^S-[A-F0-9]{8}$/.test(history.state?.inkMageSession)) return history.state.inkMageSession;
  const random = crypto.getRandomValues(new Uint32Array(1))[0];
  const code = "S-" + random.toString(16).toUpperCase().padStart(8, "0");
  history.replaceState({ ...history.state, inkMageSession: code }, "");
  return code;
}

const $ = id => document.getElementById(id);
const feedback = $("feedback");
const recordPrefix = "inkMage.biz02.feedback.v1.";
let feedbackType;
let pending = null;

function finish(message) {
  document.querySelector("dialog[open]")?.close();
  $("email-form").reset();
  $("feedback-form").reset();
  $("offer").hidden = true;
  $("end-text").textContent = message;
  $("end").hidden = false;
  $("end-title").focus();
}

function openFeedback(type) {
  if (notice.open) notice.close();
  feedbackType = type;
  const decline = type === "不登記原因";
  $("feedback-form").reset();
  $("detail").setCustomValidity("");
  $("feedback-title").textContent = decline ? "這次不登記的原因？" : "你想透過什麼方式關注？";
  $("reason-group").hidden = !decline;
  $("reason-group").disabled = !decline;
  $("follow-group").hidden = decline;
  $("detail-label").hidden = decline;
  $("detail-caption").textContent = decline ? "其他原因（選填）" : "想要關注的方式";
  $("detail").required = !decline;
  feedback.querySelector(".write-status").textContent = "";
  feedback.showModal();
}

function writeEndpoint() {
  const endpoint = window.inkMageSheetEndpoint || "";
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint) ? endpoint : "";
}

function requestId() {
  if (history.state?.inkMageWriteId) return history.state.inkMageWriteId;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = Array.from(bytes, n => n.toString(16).padStart(2, "0")).join("");
  history.replaceState({ ...history.state, inkMageWriteId: id }, "");
  return id;
}

function releaseRequest() {
  const { dialog, timer, frame, controls } = pending;
  clearTimeout(timer);
  frame.remove();
  controls.forEach(control => { control.disabled = false; });
  pending = null;
  return dialog.querySelector(".write-status");
}

function submitAnswer(dialog, type, answer, detail = "") {
  if (pending) return;
  const status = dialog.querySelector(".write-status");
  if (window.inkMageRegistrationEnabled !== true) {
    finish("預覽已結束，本次沒有寫入試算表。");
    return;
  }
  const endpoint = writeEndpoint();
  if (!endpoint) {
    status.textContent = "目前尚未接上收件服務，回覆尚未送出。請告知主持人。";
    return;
  }
  const session = sessionCode();
  const id = requestId();
  const frame = document.createElement("iframe");
  frame.name = "inkMageReceipt_" + id;
  frame.hidden = true;
  frame.title = "接收寫入結果";
  document.body.append(frame);
  const transport = document.createElement("form");
  transport.method = "post";
  transport.action = endpoint;
  transport.target = frame.name;
  transport.hidden = true;
  for (const [name, value] of Object.entries({ id, session, price, type, answer, detail })) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    transport.append(input);
  }
  document.body.append(transport);
  status.textContent = "正在送出…";
  const controls = [...dialog.querySelectorAll("button:enabled, input:enabled, textarea:enabled")];
  controls.forEach(control => { control.disabled = true; });
  const timer = setTimeout(() => {
    releaseRequest().textContent = "尚未收到寫入結果。請確認網路後再次送出，同一筆回覆只會記一次。";
  }, 25000);
  pending = { dialog, frame, timer, id, controls };
  try {
    transport.submit();
  } catch {
    releaseRequest().textContent = "無法送出，請確認網路後再試一次。";
  } finally {
    transport.remove();
  }
}

window.addEventListener("message", event => {
  if (!pending || !/^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+\.)*googleusercontent\.com)$/.test(event.origin)) return;
  const receipt = event.data;
  if (!receipt || receipt.service !== "inkmage-biz02" || receipt.id !== pending.id) return;
  // Google 會把收件結果放入內層頁面，核對訊息是否來自這次送出的框架。
  let source = event.source;
  while (source && source !== pending.frame.contentWindow && source !== source.parent) source = source.parent;
  if (source !== pending.frame.contentWindow) return;
  const status = releaseRequest();
  if (receipt.status === "saved") finish("已收到你的回覆，謝謝你。");
  else if (receipt.status === "invalid") status.textContent = "回覆格式有誤，請檢查內容後再送出。";
  else if (receipt.status === "conflict") status.textContent = "本場已有另一筆回覆，請讓主持人核對試算表。";
  else status.textContent = "尚未確認寫入，請稍後重試或聯絡主持人。";
});

notify.addEventListener("click", () => {
  notice.querySelector(".write-status").textContent = "";
  notice.showModal();
});
$("alternative").addEventListener("click", () => openFeedback("關注方式"));
$("finish").addEventListener("click", () => openFeedback("不登記原因"));
document.querySelectorAll("dialog").forEach(dialog => {
  dialog.addEventListener("cancel", event => { if (pending) event.preventDefault(); });
});
document.querySelectorAll("[data-back]").forEach(button => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
$("reason-group").addEventListener("change", event => {
  $("detail-label").hidden = event.target.value !== "其他";
  if ($("detail-label").hidden) $("detail").value = "";
});
document.querySelector(".suggestions").addEventListener("click", event => {
  if (event.target.tagName !== "BUTTON") return;
  $("detail").value = event.target.textContent;
  $("detail").setCustomValidity("");
  $("detail").focus();
});
$("detail").addEventListener("input", () => $("detail").setCustomValidity(""));

$("email-form").addEventListener("submit", event => {
  event.preventDefault();
  submitAnswer(notice, "Email 登記", $("email-address").value.trim());
});
$("feedback-form").addEventListener("submit", event => {
  event.preventDefault();
  const detail = $("detail").value.trim();
  if (feedbackType === "關注方式") {
    if (!detail) {
      $("detail").setCustomValidity("請選擇或填寫關注方式。");
      $("detail").reportValidity();
      return;
    }
    submitAnswer(feedback, feedbackType, detail);
    return;
  }
  const reason = new FormData(event.currentTarget).get("reason");
  if (reason) submitAnswer(feedback, feedbackType, reason, reason === "其他" ? detail : "");
});

function localRecords() {
  return Object.keys(localStorage).filter(key => key.startsWith(recordPrefix))
    .map(key => JSON.parse(localStorage.getItem(key))).sort((a, b) => a.time.localeCompare(b.time));
}

if (parameters.get("review") === "feedback") {
  $("offer").hidden = true;
  $("records").hidden = false;
  try {
    const rows = localRecords();
    $("count").textContent = "這個瀏覽器共有 " + rows.length + " 筆回覆。";
    $("download").disabled = !rows.length;
    $("download").addEventListener("click", () => {
      const data = [["時間（UTC）", "場次代碼", "展示售價", "回覆類型", "回覆內容"],
        ...rows.map(row => [row.time, row.session, row.price, row.type, row.answer])];
      const quote = value => {
        let cell = String(value);
        if (/^[\s]*[=+@-]|^[\t\r\n]/.test(cell)) cell = "'" + cell;
        return '"' + cell.replaceAll('"', '""') + '"';
      };
      const csv = data.map(row => row.map(quote).join(",")).join("\r\n");
      const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = href;
      link.download = "符字師-現場回覆.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    });
  } catch {
    $("count").textContent = "無法讀取這個瀏覽器的本機回覆。";
    $("download").hidden = true;
  }
}
