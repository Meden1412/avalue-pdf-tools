const $ = (id) => document.getElementById(id);
const TOOLS = {
  merge: {
    title: "Gộp PDF",
    description: "Kết hợp nhiều tài liệu thành một PDF, theo thứ tự bạn chọn.",
    accept: ".pdf,application/pdf",
    hint: "Chọn ít nhất 2 tệp PDF.",
    action: "Gộp PDF",
  },
  images: {
    title: "JPG → PDF",
    description:
      "Ghép ảnh JPG, PNG và PDF thành một tài liệu, hoặc tải từng tệp riêng.",
    accept: ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf",
    hint: "Hỗ trợ JPG, JPEG, PNG và PDF. Mỗi ảnh là một trang.",
    action: "Tạo PDF",
  },
  jpg: {
    title: "PDF → JPG",
    description:
      "Xuất mỗi trang PDF thành ảnh JPG. Tải từng ảnh hoặc tất cả trong ZIP.",
    accept: ".pdf,application/pdf",
    hint: "Có thể chọn nhiều tệp PDF.",
    action: "Chuyển sang JPG",
  },
  word: {
    title: "PDF → Word",
    description:
      "Tạo tài liệu Word .docx từ PDF, hỗ trợ nhận dạng chữ trong bản scan.",
    accept: ".pdf,application/pdf",
    hint: "Có thể chọn nhiều tệp PDF.",
    action: "Chuyển sang Word",
  },
  compress: {
    title: "Nén PDF",
    description:
      "Giảm dung lượng tài liệu scan bằng chất lượng ảnh và độ phân giải tùy chọn.",
    accept: ".pdf,application/pdf",
    hint: "Có thể chọn nhiều tệp PDF.",
    action: "Nén PDF",
  },
};
let tool = "merge",
  files = [],
  outputs = [],
  urls = [],
  busy = false,
  stopped = false,
  activeWorker = null;
const MAX_FILE = 50 * 1024 * 1024,
  MAX_TOTAL = 200 * 1024 * 1024;
const abort = () => {
  if (stopped) throw new Error("Đã dừng xử lý.");
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const baseName = (name) =>
  name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_") ||
  "document";
function status(text, kind = "") {
  $("status").textContent = text;
  $("status").className = kind;
}
function clearResults() {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  outputs = [];
  $("results").replaceChildren();
}
function link(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  urls.push(a.href);
  a.download = name;
  a.textContent = "Tải xuống";
  return a;
}
function result(blob, name, preview = false) {
  outputs.push({ blob, name });
  const row = document.createElement("div");
  row.className = "result";
  const a = link(blob, name);
  if (preview) {
    const img = document.createElement("img");
    img.src = a.href;
    img.alt = name;
    row.append(img);
  }
  const span = document.createElement("span");
  span.textContent = `${name} · ${(blob.size / 1024 / 1024).toFixed(2)} MB`;
  row.append(span, a);
  $("results").append(row);
}
async function zipResults() {
  if (outputs.length < 2) return;
  const button = document.createElement("button");
  button.className = "btn secondary zip";
  button.textContent = "Tải tất cả (ZIP)";
  button.onclick = async () => {
    button.disabled = true;
    try {
      const zip = new JSZip();
      outputs.forEach((o) => zip.file(o.name, o.blob));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = link(blob, "avalue-results.zip");
      a.textContent = "Tải ZIP";
      button.replaceWith(a);
    } catch (e) {
      status("Không tạo được ZIP: " + e.message, "error");
      button.disabled = false;
    }
  };
  $("results").prepend(button);
}
function setBusy(value) {
  busy = value;
  document
    .querySelectorAll(
      "#tools button,#workspace input,#workspace select,#clear,.file-controls button",
    )
    .forEach((el) => (el.disabled = value));
  $("convert").disabled = value;
  $("cancel").hidden = !value;
  $("cancel").disabled = false;
  $("progress").hidden = !value;
  if (value) $("progress").value = 0;
}
function option(id, label, html) {
  return `<label>${label}${html.replace(">", ` id="${id}">`)}</label>`;
}
function selectTool(key) {
  if (busy) return;
  tool = key;
  files = [];
  clearResults();
  status("");
  const cfg = TOOLS[key];
  $("toolTitle").textContent = cfg.title;
  $("toolDescription").textContent = cfg.description;
  $("dropText").textContent =
    key === "images" ? "Kéo thả ảnh hoặc PDF vào đây" : "Kéo thả PDF vào đây";
  $("fileHint").textContent =
    cfg.hint + " Tối đa 20 tệp, 50 MB/tệp, tổng 200 MB.";
  $("files").accept = cfg.accept;
  $("files").value = "";
  $("convert").textContent = cfg.action;
  document.querySelectorAll("#tools button").forEach((b) => {
    if (b.dataset.tool === key) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  let options = "";
  if (key === "images")
    options =
      option(
        "paper",
        "Khổ giấy",
        '<select><option value="original">Theo kích thước ảnh</option><option value="a4">A4 (tự xoay)</option></select>',
      ) +
      option(
        "margin",
        "Lề trang",
        '<select><option value="0">Không lề</option><option value="20">20 pt (≈ 7 mm)</option><option value="40">40 pt (≈ 14 mm)</option></select>',
      ) +
      option(
        "separate",
        "Kết quả",
        '<select><option value="combined">Gộp thành một PDF</option><option value="separate">PDF riêng cho từng tệp</option></select>',
      );
  if (["jpg", "compress"].includes(key))
    options =
      option(
        "dpi",
        "Độ phân giải (DPI)",
        '<input type="number" min="72" max="300" step="1" value="150">',
      ) +
      option(
        "quality",
        "Chất lượng JPEG",
        '<input type="number" min="0.1" max="1" step="0.05" value="0.8">',
      );
  if (["jpg", "word"].includes(key))
    options += option(
      "pages",
      "Trang cần chuyển",
      '<input type="text" placeholder="Tất cả, hoặc 1-3,5" value="">',
    );
  if (key === "word")
    options += option(
      "wordMode",
      "Chế độ Word",
      '<select><option value="text">Văn bản chỉnh sửa được</option><option value="ocr">OCR tiếng Việt + Anh (bản scan)</option><option value="image">Giữ hình thức (ảnh từng trang)</option></select>',
    );
  $("options").innerHTML = options;
  $("note").textContent =
    key === "word"
      ? "Văn bản: trích chữ, giữ ngắt trang, không giữ chính xác bảng/cột/hình ảnh. OCR: chậm hơn, cần kiểm tra lại dấu và số. Chế độ ảnh giữ hình thức nhưng chữ không chỉnh sửa được."
      : key === "compress"
        ? "Mỗi trang sẽ chuyển thành ảnh: mất khả năng chọn chữ/liên kết. Tệp đã tối ưu có thể không nhỏ hơn; khi đó công cụ giữ tệp gốc."
        : key === "jpg"
          ? "Mỗi trang thành một ảnh. Có thể chọn khoảng trang; áp dụng cho từng tệp trong danh sách."
          : "Dùng nút ↑ ↓ hoặc kéo thả để sắp xếp. Tệp mới sẽ được thêm vào cuối danh sách.";
  renderQueue();
}
for (const [key, cfg] of Object.entries(TOOLS)) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = cfg.title;
  b.dataset.tool = key;
  b.onclick = () => selectTool(key);
  $("tools").append(b);
}
function renderQueue() {
  const list = $("fileList");
  list.replaceChildren();
  $("count").textContent = files.length
    ? `${files.length} tệp đã chọn`
    : "Chưa có tệp";
  files.forEach((file, i) => {
    const li = document.createElement("li");
    li.draggable = !busy;
    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = `${i + 1}. ${file.name}`;
    const size = document.createElement("span");
    size.className = "file-size";
    size.textContent = (file.size / 1024 / 1024).toFixed(2) + " MB";
    const controls = document.createElement("div");
    controls.className = "file-controls";
    [
      ["↑", -1, "Di chuyển lên"],
      ["↓", 1, "Di chuyển xuống"],
      ["×", 0, "Bỏ tệp"],
    ].forEach(([text, delta, label]) => {
      const b = document.createElement("button");
      b.textContent = text;
      b.setAttribute("aria-label", `${label}: ${file.name}`);
      b.disabled =
        busy ||
        (delta === -1 && i === 0) ||
        (delta === 1 && i === files.length - 1);
      b.onclick = () => {
        if (busy) return;
        if (delta) {
          [files[i], files[i + delta]] = [files[i + delta], files[i]];
        } else files.splice(i, 1);
        clearResults();
        renderQueue();
      };
      controls.append(b);
    });
    li.append(name, size, controls);
    li.ondragstart = (e) => e.dataTransfer.setData("text/plain", String(i));
    li.ondragover = (e) => e.preventDefault();
    li.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      const value = e.dataTransfer.getData("text/plain");
      if (!/^\d+$/.test(value)) return;
      const from = Number(value);
      if (from >= files.length) return;
      files.splice(i, 0, files.splice(from, 1)[0]);
      clearResults();
      renderQueue();
    };
    list.append(li);
  });
}
function addFiles(incoming) {
  if (busy) return;
  const errors = [];
  for (const file of incoming) {
    const supported =
      tool === "images"
        ? /\.(jpe?g|png|pdf)$/i.test(file.name)
        : /\.pdf$/i.test(file.name);
    if (!supported) {
      errors.push("Không hỗ trợ: " + file.name);
      continue;
    }
    if (!file.size || file.size > MAX_FILE) {
      errors.push("Tệp rỗng hoặc lớn hơn 50 MB: " + file.name);
      continue;
    }
    if (
      files.length >= 20 ||
      files.reduce((n, f) => n + f.size, 0) + file.size > MAX_TOTAL
    ) {
      errors.push("Đã đạt giới hạn 20 tệp hoặc tổng 200 MB.");
      break;
    }
    files.push(file);
  }
  clearResults();
  renderQueue();
  status(errors.join(" "), errors.length ? "error" : "");
}
$("files").onchange = (e) => {
  addFiles(e.target.files);
  e.target.value = "";
};
["dragenter", "dragover"].forEach((ev) =>
  $("dropzone").addEventListener(ev, (e) => {
    e.preventDefault();
    if (!busy) $("dropzone").classList.add("drag");
  }),
);
["dragleave", "drop"].forEach((ev) =>
  $("dropzone").addEventListener(ev, (e) => {
    e.preventDefault();
    $("dropzone").classList.remove("drag");
  }),
);
$("dropzone").addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => e.preventDefault());
$("clear").onclick = () => {
  if (busy) return;
  files = [];
  clearResults();
  renderQueue();
  status("");
};
$("cancel").onclick = () => {
  stopped = true;
  $("cancel").disabled = true;
  status("Đang dừng sau thao tác hiện tại…");
};
let pdfModule;
async function pdfjs() {
  if (!pdfModule)
    pdfModule = (async () => {
      let lib;
      try {
        lib =
          await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
      } catch {
        lib =
          await import("https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.min.mjs");
      }
      lib.GlobalWorkerOptions.workerSrc =
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
      return lib;
    })().catch((e) => {
      pdfModule = null;
      throw new Error(
        "Không tải được thư viện PDF. Kiểm tra Internet rồi thử lại.",
      );
    });
  return pdfModule;
}
async function openPDF(file) {
  const lib = await pdfjs();
  abort();
  const task = lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
  });
  task.onPassword = () => {
    task.destroy();
  };
  try {
    return await task.promise;
  } catch (e) {
    throw new Error(
      "Không mở được PDF (tệp hỏng hoặc có mật khẩu): " + file.name,
    );
  }
}
function pageNumbers(value, count) {
  if (!value.trim()) return Array.from({ length: count }, (_, i) => i + 1);
  const chosen = new Set();
  for (const token of value.split(",")) {
    const m = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error("Khoảng trang không hợp lệ. Ví dụ: 1-3,5.");
    const a = Number(m[1]),
      b = Number(m[2] || m[1]);
    if (a < 1 || b < a || b > count)
      throw new Error(`Trang nằm ngoài phạm vi 1–${count}.`);
    for (let p = a; p <= b; p++) chosen.add(p);
  }
  return [...chosen].sort((a, b) => a - b);
}
function numberValue(id, min, max) {
  const n = Number($(id).value);
  if (!Number.isFinite(n) || n < min || n > max)
    throw new Error(
      `Giá trị ${id === "dpi" ? "DPI" : "JPEG"} phải từ ${min} đến ${max}.`,
    );
  return n;
}
async function renderPage(page, dpi) {
  abort();
  const viewport = page.getViewport({ scale: dpi / 72 });
  if (
    viewport.width * viewport.height > 25000000 ||
    Math.max(viewport.width, viewport.height) > 16384
  )
    throw new Error("Trang quá lớn. Hãy giảm DPI hoặc chia nhỏ tài liệu.");
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  try {
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
      background: "rgb(255,255,255)",
    }).promise;
    abort();
    return canvas;
  } catch (e) {
    canvas.width = canvas.height = 0;
    throw e;
  }
}
const canvasBlob = (canvas, q) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Không tạo được ảnh."))),
      "image/jpeg",
      q,
    ),
  );
async function appendFile(doc, file) {
  abort();
  const bytes = await file.arrayBuffer();
  if (/\.pdf$/i.test(file.name)) {
    const source = await PDFLib.PDFDocument.load(bytes);
    for (const p of await doc.copyPages(source, source.getPageIndices()))
      doc.addPage(p);
    return;
  }
  let image;
  try {
    image = /\.png$/i.test(file.name)
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes);
  } catch {
    throw new Error("Ảnh không hợp lệ: " + file.name);
  }
  let w = image.width * 0.75,
    h = image.height * 0.75;
  const margin = Number($("margin").value);
  if ($("paper").value === "a4") {
    [w, h] = w > h ? [841.89, 595.28] : [595.28, 841.89];
  } else {
    w += 2 * margin;
    h += 2 * margin;
  }
  const scale = Math.min(
    (w - 2 * margin) / image.width,
    (h - 2 * margin) / image.height,
  );
  const page = doc.addPage([w, h]);
  page.drawImage(image, {
    x: (w - image.width * scale) / 2,
    y: (h - image.height * scale) / 2,
    width: image.width * scale,
    height: image.height * scale,
  });
}
const xml = (text) =>
  String(text)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
// A real OOXML package, readable by Word, LibreOffice and Google Docs.
async function makeDocx(pages) {
  const zip = new JSZip();
  let rels = "",
    body = "";
  pages.forEach((p, i) => {
    if (i) body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    if (p.image) {
      zip.file(`word/media/page${i}.jpg`, p.image);
      rels += `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page${i}.jpg"/>`;
      const scale = Math.min((6.6 * 914400) / p.width, (9 * 914400) / p.height);
      const cx = Math.round(p.width * scale),
        cy = Math.round(p.height * scale);
      body += `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${i + 1}" name="Trang ${i + 1}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${i + 1}" name="page.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    } else
      for (const line of p.text.split("\n"))
        body += `<w:p><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${xml(line)}</w:t></w:r></w:p>`;
  });
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
async function loadOCR() {
  if (!window.Tesseract)
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src =
        "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      s.onload = resolve;
      s.onerror = () => {
        s.remove();
        reject(new Error("Không tải được OCR. Kiểm tra Internet rồi thử lại."));
      };
      document.head.append(s);
    });
  abort();
  activeWorker = await Tesseract.createWorker("vie+eng", 1, {
    logger: (m) => {
      if (!stopped && m.status)
        status(`OCR: ${m.status} ${Math.round((m.progress || 0) * 100)}%`);
    },
  });
  abort();
  return activeWorker;
}
function extractText(items) {
  const lines = [];
  let line = "",
    lastY = null;
  for (const item of items) {
    if (!("str" in item)) continue;
    const y = item.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 3 && line) {
      lines.push(line.trimEnd());
      line = "";
    }
    line += item.str + (item.str.endsWith(" ") ? "" : " ");
    lastY = y;
    if (item.hasEOL) {
      lines.push(line.trimEnd());
      line = "";
      lastY = null;
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines.join("\n");
}
async function processPDF(file, index, total, settings) {
  const pdf = await openPDF(file);
  try {
    const nums = pageNumbers(settings.pages, pdf.numPages);
    const wordPages = [];
    let out = tool === "compress" ? await PDFLib.PDFDocument.create() : null;
    let emptyPages = 0;
    for (let j = 0; j < nums.length; j++) {
      abort();
      const n = nums[j],
        page = await pdf.getPage(n);
      status(
        `${file.name} · Trang ${n}/${pdf.numPages} · Tệp ${index + 1}/${total}`,
      );
      $("progress").value = (100 * (index + j / nums.length)) / total;
      if (tool === "word" && settings.wordMode === "text") {
        const text = extractText((await page.getTextContent()).items);
        if (!text.trim()) emptyPages++;
        wordPages.push({
          text: text.trim()
            ? text
            : `[Trang ${n} không có lớp văn bản. Hãy dùng chế độ OCR để nhận dạng chữ trong ảnh.]`,
        });
      } else {
        const canvas = await renderPage(
          page,
          tool === "word"
            ? settings.wordMode === "ocr"
              ? 200
              : 150
            : settings.dpi,
        );
        try {
          if (tool === "word" && settings.wordMode === "ocr") {
            const worker = activeWorker || (await loadOCR());
            const { data } = await worker.recognize(canvas);
            abort();
            if (!data.text.trim()) emptyPages++;
            wordPages.push({
              text: data.text || `[Không nhận dạng được chữ ở trang ${n}.]`,
            });
          } else {
            const blob = await canvasBlob(
              canvas,
              tool === "word" ? 0.9 : settings.quality,
            );
            if (tool === "jpg")
              result(
                blob,
                `${index + 1}-${baseName(file.name)}-page-${String(n).padStart(3, "0")}.jpg`,
                true,
              );
            else if (tool === "word")
              wordPages.push({
                image: blob,
                width: canvas.width,
                height: canvas.height,
              });
            else {
              const image = await out.embedJpg(await blob.arrayBuffer());
              const size = page.getViewport({ scale: 1 });
              const p = out.addPage([size.width, size.height]);
              p.drawImage(image, {
                x: 0,
                y: 0,
                width: size.width,
                height: size.height,
              });
            }
          }
        } finally {
          canvas.width = canvas.height = 0;
        }
      }
      page.cleanup();
      await tick();
    }
    abort();
    if (tool === "word") {
      result(
        await makeDocx(wordPages),
        `${index + 1}-${baseName(file.name)}.docx`,
      );
      return emptyPages
        ? `${file.name}: ${emptyPages} trang không trích được chữ. Hãy thử OCR hoặc chế độ ảnh.`
        : "";
    }
    if (tool === "compress") {
      const bytes = await out.save();
      const smaller = bytes.length < file.size;
      result(
        smaller ? new Blob([bytes], { type: "application/pdf" }) : file,
        `${index + 1}-${baseName(file.name)}${smaller ? "_compressed" : "_original"}.pdf`,
      );
      return smaller
        ? ""
        : `${file.name}: không giảm được dung lượng, giữ nguyên tệp gốc.`;
    }
    return "";
  } finally {
    await pdf.destroy();
  }
}
$("convert").onclick = async () => {
  if (busy) return;
  clearResults();
  stopped = false;
  const warnings = [];
  try {
    if (!files.length) throw new Error("Vui lòng chọn tệp trước.");
    if (tool === "merge" && files.length < 2)
      throw new Error("Chọn ít nhất 2 tệp PDF.");
    if (!window.PDFLib || !window.JSZip)
      throw new Error(
        "Thư viện chưa tải được. Kiểm tra Internet và tải lại trang.",
      );
    const settings = {
      pages: $("pages")?.value || "",
      wordMode: $("wordMode")?.value,
      dpi: $("dpi") ? numberValue("dpi", 72, 300) : 150,
      quality: $("quality") ? numberValue("quality", 0.1, 1) : 0.8,
    };
    setBusy(true);
    status("Đang chuẩn bị…");
    if (tool === "merge" || tool === "images") {
      let doc = await PDFLib.PDFDocument.create();
      for (let i = 0; i < files.length; i++) {
        abort();
        status("Đang xử lý: " + files[i].name);
        await appendFile(doc, files[i]);
        if (tool === "images" && $("separate").value === "separate") {
          result(
            new Blob([await doc.save()], { type: "application/pdf" }),
            `${i + 1}-${baseName(files[i].name)}.pdf`,
          );
          doc = await PDFLib.PDFDocument.create();
        }
        $("progress").value = ((i + 1) / files.length) * 100;
        await tick();
      }
      abort();
      if (doc.getPageCount())
        result(
          new Blob([await doc.save()], { type: "application/pdf" }),
          tool === "merge" ? "merged.pdf" : "images-combined.pdf",
        );
    } else
      for (let i = 0; i < files.length; i++) {
        abort();
        try {
          const warning = await processPDF(files[i], i, files.length, settings);
          if (warning) warnings.push(warning);
        } catch (e) {
          abort();
          warnings.push(`${files[i].name}: ${e.message}`);
        }
      }
    abort();
    $("progress").value = 100;
    status(
      `${outputs.length ? "Hoàn tất: " + outputs.length + " tệp kết quả." : "Không tạo được kết quả."} ${warnings.join(" ")}`,
      warnings.length ? "error" : "success",
    );
  } catch (e) {
    status(
      (stopped ? "Đã dừng xử lý." : e.message) +
        (outputs.length ? " Các kết quả đã tạo vẫn có thể tải xuống." : ""),
      "error",
    );
  } finally {
    if (activeWorker) {
      await activeWorker.terminate();
      activeWorker = null;
    }
    await zipResults();
    setBusy(false);
    renderQueue();
  }
};
window.addEventListener("beforeunload", () =>
  urls.forEach(URL.revokeObjectURL),
);
selectTool("merge");
