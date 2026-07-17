import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addEdge, Background, ConnectionLineType, Controls, Handle,
  Position, ReactFlow, ReactFlowProvider, reconnectEdge, useEdgesState,
  useNodesState,
} from "@xyflow/react";
import {
  ArrowClockwise, ArrowCounterClockwise, ArrowSquareOut, Bell, CalendarBlank, CalendarCheck, CaretLeft, CaretRight,
  CheckCircle, CheckSquare, Circle, Copy, CornersIn, CornersOut, Database, CaretDown, DotsThree, Eraser, Export,
  FloppyDisk, FlowArrow, GearSix, ImageSquare, Info,
  Link, ListBullets, MagnifyingGlass, Minus, NotePencil, Palette,
  PencilLine, Plus, PushPinSimple, Repeat, ShieldCheck, SquaresFour, Star, TextB, TextItalic,
  TextUnderline, Trash, TreeStructure, X,
} from "@phosphor-icons/react";
import mindFlowAppIcon from "./assets/mindflow-app-icon.svg";

const downloadFile = (filename, content, type = "text/plain") => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
};

const downloadBlob = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
};

const saveBlobToUser = async (filename, blob, filters) => {
  if (!window.mindflow?.saveFile) {
    downloadBlob(filename, blob);
    return { saved: true, fallback: true };
  }
  const data = new Uint8Array(await blob.arrayBuffer());
  return window.mindflow.saveFile({ defaultName: filename, filters, data });
};

const textBlob = (content, type = "text/plain;charset=utf-8") => new Blob([content], { type });

const safeExportName = (value = "MindFlow") => String(value || "MindFlow").replace(/[\\/:*?"<>|]/g, "-");

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const inlineMarkdownToHtml = (value = "") => {
  const prepared = String(value)
    .replace(/<span data-font-size="(12|14|16|18|22|28)">/gi, "\uE000$1\uE001")
    .replace(/<\/span>/gi, "\uE002");
  let html = escapeHtml(prepared);
  html = html.replace(/!\[([^\]]*)\]\(((?:data:image\/[^;]+;base64,|https?:\/\/)[^)]+)\)/gi, (_, alt, source) => `<img src="${source}" alt="${alt}" />`);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|mailto:[^)]+)\)/gi, (_, label, href) => `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`);
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  html = html.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/gi, "<u>$1</u>");
  html = html
    .replace(/\uE000(12|14|16|18|22|28)\uE001/g, (_, size) => `<span data-font-size="${size}" style="font-size:${size}px">`)
    .replace(/\uE002/g, "</span>");
  return html;
};

const markdownToRichHtml = (markdown = "") => {
  if (!markdown.trim()) return "<p><br></p>";
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let listOpen = false;
  const closeList = () => {
    if (!listOpen) return;
    output.push("</ul>");
    listOpen = false;
  };

  lines.forEach((line) => {
    const divider = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    const listItem = line.match(/^\s*(?:[-*•])\s+(.+)$/);
    if (divider) {
      closeList();
      output.push("<hr>");
      return;
    }
    if (heading) {
      closeList();
      output.push(`<h2>${inlineMarkdownToHtml(heading[1])}</h2>`);
      return;
    }
    if (listItem) {
      if (!listOpen) {
        output.push("<ul>");
        listOpen = true;
      }
      output.push(`<li>${inlineMarkdownToHtml(listItem[1])}</li>`);
      return;
    }
    closeList();
    if (line.trim()) output.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
  });
  closeList();
  return output.join("") || "<p><br></p>";
};

const richEditorToMarkdown = (root) => {
  const serialize = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    const children = () => Array.from(node.childNodes).map(serialize).join("");
    if (tag === "br") return "\n";
    if (tag === "strong" || tag === "b") return `**${children()}**`;
    if (tag === "em" || tag === "i") return `*${children()}*`;
    if (tag === "u") return `<u>${children()}</u>`;
    if (tag === "a") return `[${children() || node.getAttribute("href") || "链接"}](${node.getAttribute("href") || ""})`;
    if (tag === "img") return `![${node.getAttribute("alt") || "图片"}](${node.getAttribute("src") || ""})`;
    if (tag === "hr") return "\n---\n\n";
    if (tag === "span" && /^(12|14|16|18|22|28)$/.test(node.dataset.fontSize || "")) return `<span data-font-size="${node.dataset.fontSize}">${children()}</span>`;
    if (/^h[1-3]$/.test(tag)) return `## ${children().trim()}\n\n`;
    if (tag === "li") return children().trim();
    if (tag === "ul") return `${Array.from(node.children).filter((child) => child.tagName === "LI").map((child) => `- ${serialize(child)}`).join("\n")}\n\n`;
    if (tag === "ol") return `${Array.from(node.children).filter((child) => child.tagName === "LI").map((child, index) => `${index + 1}. ${serialize(child)}`).join("\n")}\n\n`;
    if (tag === "p" || tag === "div") return `${children()}\n\n`;
    return children();
  };
  return Array.from(root.childNodes).map(serialize).join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const normalizeLinkUrl = (value = "") => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const isTextEntryTarget = (target) => target instanceof Element
  && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"]'));

const imageFileToDataUrl = (file) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(objectUrl);
    resolve(canvas.toDataURL("image/webp", 0.82));
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error("无法读取图片"));
  };
  image.src = objectUrl;
});

const exportFontFamily = "'Segoe UI Variable','Microsoft YaHei UI','PingFang SC',sans-serif";

const inlineCanvasTokens = (value = "", plain = false) => {
  if (plain) return Array.from(String(value)).map((character) => ({ character }));
  const container = document.createElement("span");
  container.innerHTML = inlineMarkdownToHtml(value);
  const tokens = [];
  const walk = (node, format = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      Array.from(node.nodeValue || "").forEach((character) => tokens.push({ character, ...format }));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.tagName === "IMG") return;
    const tag = node.tagName.toLowerCase();
    const next = {
      ...format,
      bold: format.bold || tag === "strong" || tag === "b",
      italic: format.italic || tag === "em" || tag === "i",
      underline: format.underline || tag === "u" || tag === "a",
      link: format.link || tag === "a",
    };
    Array.from(node.childNodes).forEach((child) => walk(child, next));
  };
  Array.from(container.childNodes).forEach((node) => walk(node));
  return tokens;
};

const canvasFont = (size, token = {}, weight = 400) => `${token.bold ? 700 : weight} ${size}px ${exportFontFamily}`;

const drawCanvasText = (context, value, options) => {
  const { x, y, width, size, lineHeight, color, weight = 400, plain = false } = options;
  const tokens = inlineCanvasTokens(value, plain);
  const lines = [[]];
  let lineWidth = 0;
  tokens.forEach((token) => {
    context.font = canvasFont(size, token, weight);
    const characterWidth = context.measureText(token.character).width;
    if (lineWidth + characterWidth > width && lines.at(-1).length) {
      lines.push([]);
      lineWidth = 0;
      if (token.character === " ") return;
    }
    lines.at(-1).push({ ...token, width: characterWidth });
    lineWidth += characterWidth;
  });
  context.textBaseline = "top";
  lines.forEach((line, lineIndex) => {
    let cursorX = x;
    line.forEach((token) => {
      context.font = canvasFont(size, token, weight);
      context.fillStyle = token.link ? "#2f7972" : color;
      const characterY = y + lineIndex * lineHeight;
      if (token.italic) {
        context.save();
        context.translate(cursorX + size * 0.16, characterY);
        context.transform(1, 0, -0.25, 1, 0, 0);
        context.fillText(token.character, 0, 0);
        context.restore();
      } else {
        context.fillText(token.character, cursorX, characterY);
      }
      if (token.underline) {
        context.strokeStyle = token.link ? "#2f7972" : color;
        context.lineWidth = Math.max(1.5, size / 17);
        context.beginPath();
        context.moveTo(cursorX, y + lineIndex * lineHeight + size + 4);
        context.lineTo(cursorX + token.width, y + lineIndex * lineHeight + size + 4);
        context.stroke();
      }
      cursorX += token.width;
    });
  });
  return y + Math.max(1, lines.length) * lineHeight;
};

const loadCanvasImage = (source) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("笔记图片无法写入 JPG"));
  image.src = source;
});

const createNoteImageBlob = async (note, mimeType = "image/jpeg") => {
  const exportWidth = 1440;
  const maxHeight = 12000;
  const padding = 132;
  const contentWidth = exportWidth - padding * 2;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = exportWidth;
  sourceCanvas.height = maxHeight;
  const context = sourceCanvas.getContext("2d");
  if (!context) throw new Error("JPG 渲染失败：无法创建画布");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, exportWidth, maxHeight);

  try {
    window.__mindflowLastExportError = null;
    let cursorY = 112;
    cursorY = drawCanvasText(context, note.title || "未命名笔记", {
      x: padding, y: cursorY, width: contentWidth, size: 58, lineHeight: 70, color: "#17201e", weight: 700, plain: true,
    });
    cursorY = drawCanvasText(context, `${note.tag || "笔记"} · ${note.date || "刚刚"}`, {
      x: padding, y: cursorY + 12, width: contentWidth, size: 20, lineHeight: 30, color: "#7f8986", plain: true,
    });
    cursorY += 34;
    context.strokeStyle = "#e1e6e3";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(padding, cursorY);
    context.lineTo(exportWidth - padding, cursorY);
    context.stroke();
    cursorY += 54;

    const lines = (note.content || "").replace(/\r\n/g, "\n").split("\n");
    let hasBody = false;
    for (const line of lines) {
      if (cursorY > maxHeight - 360) break;
      const imageMatch = line.trim().match(/^!\[([^\]]*)\]\((data:image\/[^)]+)\)$/i);
      const dividerMatch = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
      const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
      const listMatch = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.+)$/);
      if (imageMatch) {
        try {
          const image = await loadCanvasImage(imageMatch[2]);
          const scale = Math.min(contentWidth / image.naturalWidth, 820 / image.naturalHeight, 1);
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));
          cursorY += hasBody ? 20 : 0;
          context.drawImage(image, padding, cursorY, width, height);
          cursorY += height + 30;
          hasBody = true;
        } catch {
          cursorY = drawCanvasText(context, `[图片：${imageMatch[1] || "笔记图片"}]`, {
            x: padding, y: cursorY, width: contentWidth, size: 22, lineHeight: 36, color: "#7f8986", plain: true,
          }) + 14;
        }
      } else if (dividerMatch) {
        cursorY += hasBody ? 18 : 0;
        context.strokeStyle = "#d7ddda";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(padding, cursorY);
        context.lineTo(exportWidth - padding, cursorY);
        context.stroke();
        cursorY += 36;
        hasBody = true;
      } else if (headingMatch) {
        cursorY += hasBody ? 28 : 0;
        cursorY = drawCanvasText(context, headingMatch[1], {
          x: padding, y: cursorY, width: contentWidth, size: 34, lineHeight: 46, color: "#26302d", weight: 700,
        }) + 12;
        hasBody = true;
      } else if (listMatch) {
        context.fillStyle = "#4a938b";
        context.beginPath();
        context.arc(padding + 8, cursorY + 17, 4, 0, Math.PI * 2);
        context.fill();
        cursorY = drawCanvasText(context, listMatch[1], {
          x: padding + 34, y: cursorY, width: contentWidth - 34, size: 27, lineHeight: 48, color: "#202826",
        }) + 6;
        hasBody = true;
      } else if (line.trim()) {
        cursorY = drawCanvasText(context, line, {
          x: padding, y: cursorY, width: contentWidth, size: 27, lineHeight: 48, color: "#202826",
        }) + 14;
        hasBody = true;
      } else if (hasBody) {
        cursorY += 12;
      }
    }

    cursorY += 48;
    context.strokeStyle = "#e1e6e3";
    context.beginPath();
    context.moveTo(padding, cursorY);
    context.lineTo(exportWidth - padding, cursorY);
    context.stroke();
    drawCanvasText(context, "MindFlow · 本地笔记", {
      x: padding, y: cursorY + 24, width: contentWidth, size: 16, lineHeight: 24, color: "#96a09d", plain: true,
    });

    const exportHeight = Math.max(960, Math.min(maxHeight, Math.ceil(cursorY + 132)));
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = exportWidth;
    outputCanvas.height = exportHeight;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) throw new Error("JPG 渲染失败：无法创建导出画布");
    outputContext.drawImage(sourceCanvas, 0, 0, exportWidth, exportHeight, 0, 0, exportWidth, exportHeight);
    return await new Promise((resolve, reject) => outputCanvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("图片编码失败")),
      mimeType,
      mimeType === "image/jpeg" ? 0.92 : undefined,
    ));
  } catch (error) {
    window.__mindflowLastExportError = String(error?.stack || error);
    throw error;
  }
};

const noteToPlainText = (note) => `${note.title || "未命名笔记"}\n\n${String(note.content || "")
  .replace(/!\[([^\]]*)\]\([^)]+\)/g, (_, alt) => `[图片：${alt || "笔记图片"}]`)
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
  .replace(/<span data-font-size="(?:12|14|16|18|22|28)">([\s\S]*?)<\/span>/g, "$1")
  .replace(/<\/?u>/g, "")
  .replace(/^#{1,3}\s+/gm, "")
  .replace(/\*\*([^*]+)\*\*/g, "$1")
  .replace(/\*([^*]+)\*/g, "$1")}`.trim();

const imageSourceToPng = async (source) => {
  const image = await loadCanvasImage(source);
  const scale = Math.min(600 / image.naturalWidth, 440 / image.naturalHeight, 1);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const context = canvas.getContext("2d");
  context.scale(2, 2);
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("图片转换失败")), "image/png"));
  return { data: new Uint8Array(await blob.arrayBuffer()), width, height };
};

const createNoteDocxBlob = async (note) => {
  const {
    AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, HeadingLevel, ImageRun,
    LevelFormat, Packer, PageNumber, Paragraph, TextRun,
  } = await import("docx");

  const inlineRuns = (value) => {
    const container = document.createElement("span");
    container.innerHTML = inlineMarkdownToHtml(value);
    const output = [];
    const walk = (node, format = {}) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue) output.push(new TextRun({
          text: node.nodeValue,
          bold: Boolean(format.bold),
          italics: Boolean(format.italic),
          underline: format.underline ? {} : undefined,
          size: format.size || 22,
        }));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || node.tagName === "IMG") return;
      const tag = node.tagName.toLowerCase();
      if (tag === "a") {
        output.push(new ExternalHyperlink({
          link: node.href,
          children: [new TextRun({ text: node.textContent || node.href, color: "2F7972", underline: {}, size: format.size || 22 })],
        }));
        return;
      }
      const rawSize = tag === "span" ? Number(node.dataset.fontSize) : 0;
      const nextFormat = {
        ...format,
        bold: format.bold || tag === "strong" || tag === "b",
        italic: format.italic || tag === "em" || tag === "i",
        underline: format.underline || tag === "u",
        size: rawSize ? Math.round(rawSize * 1.5) : format.size,
      };
      Array.from(node.childNodes).forEach((child) => walk(child, nextFormat));
    };
    Array.from(container.childNodes).forEach((node) => walk(node));
    return output.length ? output : [new TextRun({ text: "", size: 22 })];
  };

  const body = [];
  for (const line of String(note.content || "").replace(/\r\n/g, "\n").split("\n")) {
    const imageMatch = line.trim().match(/^!\[([^\]]*)\]\((data:image\/[^)]+)\)$/i);
    const dividerMatch = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    const bulletMatch = line.match(/^\s*(?:[-*•])\s+(.+)$/);
    const numberMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (imageMatch) {
      try {
        const image = await imageSourceToPng(imageMatch[2]);
        body.push(new Paragraph({
          spacing: { before: 120, after: 160 },
          children: [new ImageRun({ data: image.data, transformation: { width: image.width, height: image.height }, type: "png" })],
        }));
      } catch {
        body.push(new Paragraph({ children: [new TextRun({ text: `[图片：${imageMatch[1] || "笔记图片"}]`, color: "7A8481", italics: true })] }));
      }
    } else if (dividerMatch) {
      body.push(new Paragraph({
        border: { bottom: { color: "D7DDDA", space: 1, size: 4, style: BorderStyle.SINGLE } },
        spacing: { before: 160, after: 220 },
        children: [],
      }));
    } else if (headingMatch) {
      const headingStyle = { 1: "MindFlowHeading1", 2: "MindFlowHeading1", 3: "MindFlowHeading2" }[headingMatch[1].length];
      body.push(new Paragraph({ style: headingStyle, children: inlineRuns(headingMatch[2]) }));
    } else if (bulletMatch) {
      body.push(new Paragraph({ numbering: { reference: "mindflow-bullets", level: 0 }, children: inlineRuns(bulletMatch[1]) }));
    } else if (numberMatch) {
      body.push(new Paragraph({ numbering: { reference: "mindflow-numbers", level: 0 }, children: inlineRuns(numberMatch[1]) }));
    } else if (line.trim()) {
      body.push(new Paragraph({ children: inlineRuns(line) }));
    } else {
      body.push(new Paragraph({ spacing: { after: 40 }, children: [] }));
    }
  }

  const documentFile = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: "202826" },
          paragraph: { spacing: { after: 120, line: 300, lineRule: "auto" } },
        },
      },
      paragraphStyles: [
        { id: "MindFlowHeading1", name: "MindFlow Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { bold: true, size: 32, color: "2E746D" }, paragraph: { spacing: { before: 360, after: 200 }, keepNext: true } },
        { id: "MindFlowHeading2", name: "MindFlow Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { bold: true, size: 26, color: "2E746D" }, paragraph: { spacing: { before: 280, after: 140 }, keepNext: true } },
      ],
    },
    numbering: {
      config: [
        { reference: "mindflow-bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 }, spacing: { after: 80, line: 300, lineRule: "auto" } } } }] },
        { reference: "mindflow-numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 }, spacing: { after: 80, line: 300, lineRule: "auto" } } } }] },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ["MindFlow · ", PageNumber.CURRENT], color: "8A9491", size: 18 })] })] }) },
      children: [
        new Paragraph({ spacing: { before: 0, after: 80 }, children: [new TextRun({ text: note.title || "未命名笔记", bold: true, size: 44, color: "26312F" })] }),
        new Paragraph({ spacing: { after: 280 }, children: [new TextRun({ text: `${note.tag || "笔记"} · ${note.date || "刚刚"}`, color: "7A8481", size: 20 })] }),
        ...body,
      ],
    }],
  });
  return Packer.toBlob(documentFile);
};

const initialNotes = [
  { id: 1, title: "日本旅行计划", preview: "计划今年春天去日本旅行…", date: "14:30", tag: "旅行", tone: "violet", content: "## 旅行时间\n计划2026年3月下旬，樱花季\n\n## 目的地\n• 东京（3天）\n• 京都（2天）\n• 大阪（2天）\n\n## 预算\n总预算：15000元\n机票：5000元\n住宿：4000元\n餐饮：3000元\n交通：2000元\n其他：1000元\n\n## 想体验的\n• 樱花\n• 温泉\n• 日本美食" },
  { id: 2, title: "产品设计思路", preview: "记录这款思维工具的核心体验…", date: "12:15", tag: "工作", tone: "amber", content: "## 核心体验\n记录要足够轻，整理要足够直观。\n\n## 产品原则\n• 本地优先\n• 节点可解释\n• 结果可再次编辑" },
  { id: 3, title: "学习笔记 · 设计模式", preview: "结构型模式与组合思维…", date: "昨天", tag: "学习", tone: "green", content: "## 组合模式\n把对象组合成树形结构，以表示部分与整体。\n\n## 使用场景\n• 文件树\n• 组织结构\n• 思维导图" },
  { id: 4, title: "灵感收集", preview: "节点像一条会生长的思路…", date: "2026/07/12", tag: "灵感", tone: "rose", content: "## 灵感\n工作流的连线不只是连接，也可以表达思考的方向。" },
  { id: 5, title: "项目计划", preview: "桌面端 MVP 的迭代安排", date: "2026/07/11", tag: "工作", tone: "violet", content: "## 第一阶段\n笔记、工作流、思维导图。\n\n## 第二阶段\n模板、导出与快捷操作。" },
];

const TASKS_STORAGE_KEY = "mindflow-tasks-v1";
const NOTIFIED_STORAGE_KEY = "mindflow-notified-v1";
const WIDGET_SETTINGS_STORAGE_KEY = "mindflow-widget-settings-v1";
const WIDGET_ALERT_STORAGE_KEY = "mindflow-widget-alerts-v1";
const padNumber = (value) => String(value).padStart(2, "0");
const dateKeyFromDate = (date = new Date()) => `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
const parseDateKey = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
};
const shiftDateKey = (value, amount) => {
  const date = parseDateKey(value) || new Date();
  date.setDate(date.getDate() + amount);
  return dateKeyFromDate(date);
};
const dateDistance = (fromKey, toKey) => {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from || !to) return Number.NaN;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
};
const weekdayOptions = [
  { value: 1, label: "一" }, { value: 2, label: "二" }, { value: 3, label: "三" },
  { value: 4, label: "四" }, { value: 5, label: "五" }, { value: 6, label: "六" },
  { value: 0, label: "日" },
];
const weekdayName = (dateKey) => {
  const day = parseDateKey(dateKey)?.getDay();
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][day] || "";
};
const formatCalendarDate = (dateKey, includeWeekday = false) => {
  const date = parseDateKey(dateKey);
  if (!date) return "未设置日期";
  const value = `${date.getMonth() + 1}月${date.getDate()}日`;
  return includeWeekday ? `${value} ${weekdayName(dateKey)}` : value;
};
const parseReminderValue = (value) => {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const date = parseDateKey(match[1]);
  if (!date) return null;
  date.setHours(Number(match[2]), Number(match[3]), 0, 0);
  return { date, dateKey: match[1], time: `${match[2]}:${match[3]}` };
};
const formatReminderLabel = (value) => {
  const parsed = parseReminderValue(value);
  if (!parsed) return String(value || "");
  const today = dateKeyFromDate();
  const tomorrow = shiftDateKey(today, 1);
  if (parsed.dateKey === today) return `今天 ${parsed.time}`;
  if (parsed.dateKey === tomorrow) return `明天 ${parsed.time}`;
  return `${formatCalendarDate(parsed.dateKey)} ${parsed.time}`;
};
const defaultReminderDraft = () => ({ date: shiftDateKey(dateKeyFromDate(), 1), time: "09:00" });

const normalizeTask = (task = {}) => {
  const startDate = parseDateKey(task.startDate) ? task.startDate : dateKeyFromDate();
  const startDay = parseDateKey(startDate)?.getDay() ?? 1;
  const repeatType = ["once", "daily", "weekly", "custom"].includes(task.repeatType) ? task.repeatType : "once";
  return {
    id: task.id || Date.now(),
    title: String(task.title || "未命名任务"),
    details: String(task.details || ""),
    startDate,
    repeatType,
    weekdays: Array.isArray(task.weekdays) && task.weekdays.length ? task.weekdays.map(Number) : [startDay],
    interval: Math.max(1, Math.min(99, Number(task.interval) || 1)),
    intervalUnit: task.intervalUnit === "week" ? "week" : "day",
    reminderEnabled: Boolean(task.reminderEnabled),
    reminderTime: /^\d{2}:\d{2}$/.test(task.reminderTime || "") ? task.reminderTime : "09:00",
    noteId: task.noteId === "" || task.noteId == null ? "" : Number(task.noteId),
    completedDates: Array.isArray(task.completedDates) ? [...new Set(task.completedDates.filter((value) => parseDateKey(value)))] : [],
    createdAt: task.createdAt || new Date().toISOString(),
  };
};

const readStoredTasks = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(TASKS_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.map(normalizeTask) : [];
  } catch {
    return [];
  }
};

const persistStoredTasks = (tasks) => {
  const normalized = tasks.map(normalizeTask);
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("mindflow-tasks-change"));
  window.mindflow?.broadcastTasksChanged?.();
  return normalized;
};

const isTaskDueOn = (taskValue, targetKey) => {
  const task = normalizeTask(taskValue);
  const distance = dateDistance(task.startDate, targetKey);
  if (!Number.isFinite(distance) || distance < 0) return false;
  if (task.repeatType === "once") return distance === 0;
  if (task.repeatType === "daily") return true;
  if (task.repeatType === "custom" && task.intervalUnit === "day") return distance % task.interval === 0;
  const targetDay = parseDateKey(targetKey)?.getDay();
  const selectedWeekdays = task.weekdays.length ? task.weekdays : [parseDateKey(task.startDate)?.getDay()];
  if (!selectedWeekdays.includes(targetDay)) return false;
  const weekDistance = Math.floor(distance / 7);
  if (task.repeatType === "weekly") return true;
  if (task.intervalUnit === "week") return weekDistance % task.interval === 0;
  return false;
};

const findNextTaskOccurrence = (task, fromKey = dateKeyFromDate(), limit = 370) => {
  for (let offset = 0; offset <= limit; offset += 1) {
    const candidate = shiftDateKey(fromKey, offset);
    if (isTaskDueOn(task, candidate)) return candidate;
  }
  return task.startDate;
};

const taskRepeatLabel = (taskValue) => {
  const task = normalizeTask(taskValue);
  if (task.repeatType === "once") return "仅一次";
  if (task.repeatType === "daily") return "每天";
  const days = weekdayOptions.filter((item) => task.weekdays.includes(item.value)).map((item) => item.label).join("、");
  if (task.repeatType === "weekly") return `每周 ${days || "自定"}`;
  return task.intervalUnit === "week" ? `每 ${task.interval} 周 ${days || "自定"}` : `每 ${task.interval} 天`;
};

const createTaskOccurrences = (tasks, startKey, days) => {
  const occurrences = [];
  for (let offset = 0; offset < days; offset += 1) {
    const occurrenceDate = shiftDateKey(startKey, offset);
    tasks.forEach((task) => {
      if (isTaskDueOn(task, occurrenceDate)) occurrences.push({ task, occurrenceDate });
    });
  }
  return occurrences;
};

const readStoredNotes = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("mindflow-notes") || "null");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {
    // Use the bundled notes when local data is unavailable.
  }
  return initialNotes;
};

function NoteSwitcher({ value, onChange }) {
  const notes = readStoredNotes();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedNote = notes.find((note) => String(note.id) === String(value)) || notes[0];

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeFromKeyboard = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`note-switcher${open ? " open" : ""}`}>
      <button className="note-switcher-trigger" type="button" onClick={() => setOpen((current) => !current)} aria-label="切换笔记" aria-haspopup="listbox" aria-expanded={open} title="切换笔记">
        <span>{selectedNote?.title || "未命名笔记"}</span>
        <CaretDown size={14} weight="bold" />
      </button>
      {open && (
        <div className="note-switcher-menu" role="listbox" aria-label="选择笔记">
          <div className="note-switcher-caption">切换当前笔记</div>
          {notes.map((note) => {
            const selected = String(note.id) === String(selectedNote?.id);
            return (
              <button key={note.id} className={`note-switcher-option${selected ? " selected" : ""}`} type="button" role="option" aria-selected={selected} data-note-id={note.id} onClick={() => { onChange(Number(note.id)); setOpen(false); }}>
                <span className="note-switcher-copy"><strong>{note.title || "未命名笔记"}</strong><small>{note.tag || "笔记"}</small></span>
                <span className="note-switcher-check" aria-hidden="true">{selected ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SelectMenu({ value, onChange, options, label = "选择选项", className = "" }) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef([]);
  const listboxId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => String(option.value) === String(value)));
  const selectedOption = options[selectedIndex] || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    return () => document.removeEventListener("pointerdown", closeFromOutside);
  }, [open]);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const themeStyles = window.getComputedStyle(trigger.closest(".app-shell") || document.documentElement);
    const themeVariables = ["--panel", "--line", "--ink-secondary", "--ink", "--surface-hover", "--accent-dark", "--accent-soft", "--accent", "--shadow-float"]
      .reduce((tokens, name) => ({ ...tokens, [name]: themeStyles.getPropertyValue(name) }), {});
    const width = rect.width;
    const estimatedHeight = Math.min(options.length * 34 + 10, 220);
    const roomBelow = window.innerHeight - rect.bottom - 8;
    const top = roomBelow >= estimatedHeight ? rect.bottom + 6 : Math.max(8, rect.top - estimatedHeight - 6);
    setMenuPosition({ left: rect.left, top, width, ...themeVariables });
  }, [options.length]);

  useEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    return () => window.removeEventListener("resize", updateMenuPosition);
  }, [open, updateMenuPosition]);

  const focusOption = (index) => {
    const boundedIndex = Math.max(0, Math.min(index, options.length - 1));
    window.requestAnimationFrame(() => optionRefs.current[boundedIndex]?.focus());
  };

  const openAndFocus = (index = selectedIndex) => {
    updateMenuPosition();
    setOpen(true);
    focusOption(index);
  };

  const chooseOption = (option) => {
    onChange(option.value);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleTriggerKeyDown = (event) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const targetIndex = event.key === "End" ? options.length - 1 : event.key === "Home" ? 0 : selectedIndex;
      openAndFocus(targetIndex);
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const handleOptionKeyDown = (event, index) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      focusOption((index + direction + options.length) % options.length);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusOption(event.key === "Home" ? 0 : options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseOption(options[index]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const optionMenu = open && menuPosition ? createPortal(
    <div ref={menuRef} id={listboxId} className="select-menu-popover" role="listbox" aria-label={label} style={menuPosition}>
      {options.map((option, index) => {
        const selected = String(option.value) === String(value);
        return (
          <button
            key={option.value}
            ref={(element) => { optionRefs.current[index] = element; }}
            className={`select-menu-option${selected ? " selected" : ""}`}
            type="button"
            role="option"
            aria-selected={selected}
            data-value={option.value}
            onClick={() => chooseOption(option)}
            onKeyDown={(event) => handleOptionKeyDown(event, index)}
          >
            <span>{option.label}</span>
            {selected && <CheckCircle size={14} weight="fill" aria-hidden="true" />}
          </button>
        );
      })}
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={rootRef} className={`select-menu${open ? " open" : ""}${className ? ` ${className}` : ""}`}>
      <button
        ref={triggerRef}
        className="select-menu-trigger"
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => {
          if (open) setOpen(false);
          else openAndFocus(selectedIndex);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedOption?.label || "请选择"}</span>
        <CaretDown size={13} weight="bold" aria-hidden="true" />
      </button>
      {optionMenu}
    </div>
  );
}

const workflowNodes = [
  { id: "input", type: "flowNode", position: { x: 70, y: 300 }, data: { label: "旅行笔记", subtitle: "日本旅行计划", kind: "笔记" } },
  { id: "route", type: "flowNode", position: { x: 360, y: 130 }, data: { label: "行程分组", subtitle: "城市与停留时间", kind: "分组" } },
  { id: "budget", type: "flowNode", position: { x: 360, y: 300 }, data: { label: "预算清单", subtitle: "机票、住宿与交通", kind: "清单" } },
  { id: "todo", type: "flowNode", position: { x: 360, y: 470 }, data: { label: "出发前待办", subtitle: "预订、证件与行李", kind: "清单" } },
  { id: "map", type: "flowNode", position: { x: 690, y: 300 }, data: { label: "旅行结构", subtitle: "整理为可编辑主题分支", kind: "导图" } },
];

const edge = (id, source, target, color = "#cbd5e1", handles = {}) => ({
  id, source, target, type: "bezier", animated: false,
  sourceHandle: handles.sourceHandle || "output",
  targetHandle: handles.targetHandle || "input",
  style: { stroke: color, strokeWidth: 1.7 },
});

const stripEdgeMarkers = (items) => items.map((item) => {
  if (!item.markerEnd && !item.markerStart) return item;
  const clean = { ...item };
  delete clean.markerEnd;
  delete clean.markerStart;
  return clean;
});

const persistCanvasState = (storageKey, nodes, edges) => {
  try {
    const cleanNodes = nodes.map(({ id, type, position, data }) => ({ id, type, position, data }));
    localStorage.setItem(storageKey, JSON.stringify({ nodes: cleanNodes, edges }));
  } catch {
    // Keep dragging responsive even when local storage is unavailable.
  }
};

function useDebouncedCanvasPersistence(storageKey, nodes, edges, paused = false, delay = 220) {
  const latestStateRef = useRef({ storageKey, nodes, edges });
  latestStateRef.current = { storageKey, nodes, edges };

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setTimeout(() => persistCanvasState(storageKey, nodes, edges), delay);
    return () => window.clearTimeout(timer);
  }, [delay, edges, nodes, paused, storageKey]);

  useEffect(() => () => {
    const latest = latestStateRef.current;
    persistCanvasState(latest.storageKey, latest.nodes, latest.edges);
  }, []);
}

const workflowEdges = [
  edge("e1", "input", "route", "#8aa5a2"),
  edge("e2", "input", "budget", "#8aa5a2"),
  edge("e3", "input", "todo", "#8aa5a2"),
  edge("e4", "route", "map", "#8aa5a2"),
  edge("e5", "budget", "map", "#8aa5a2"),
  edge("e6", "todo", "map", "#8aa5a2"),
];

const nodeColor = { soft: "var(--flow-node-soft)", line: "var(--flow-node-line)", text: "var(--flow-node-text)" };

function FlowNode({ data, selected }) {
  return (
    <div className={`flow-node ${selected ? "selected" : ""}`} style={{ "--node-soft": nodeColor.soft, "--node-line": nodeColor.line, "--node-text": nodeColor.text }}>
      <Handle id="input" className="mf-flow-port mf-flow-port--input" type="target" position={Position.Left} />
      <div className="node-kicker"><span className="node-index"><SquaresFour size={12} weight="fill" /></span><span>{data.kind || "模块"}</span></div>
      <strong className="node-title">{data.label}</strong>
      <p>{data.subtitle}</p>
      <div className="node-meta"><span className="state-dot" />手动整理</div>
      <Handle id="output" className="mf-flow-port mf-flow-port--output" type="source" position={Position.Right} />
    </div>
  );
}

function MindNode({ id, data, selected }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);

  useEffect(() => setDraft(data.label), [data.label]);

  const commit = () => {
    const next = draft.trim() || "未命名分支";
    data.onRename?.(id, next);
    setDraft(next);
    setEditing(false);
  };

  return (
    <div className={`mind-node ${data.tone || "root"} ${selected ? "selected" : ""}`} onDoubleClick={() => setEditing(true)}>
      <Handle id="in-left" className="mf-mind-port mf-mind-port--target" type="target" position={Position.Left} style={{ top: "36%" }} />
      <Handle id="out-left" className="mf-mind-port mf-mind-port--source" type="source" position={Position.Left} style={{ top: "68%" }} />
      {editing ? (
        <input
          className="mind-node-input nodrag"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") { setDraft(data.label); setEditing(false); }
          }}
          onClick={(event) => event.stopPropagation()}
          autoFocus
        />
      ) : <span>{data.label}</span>}
      <Handle id="in-right" className="mf-mind-port mf-mind-port--target" type="target" position={Position.Right} style={{ top: "36%" }} />
      <Handle id="out-right" className="mf-mind-port mf-mind-port--source" type="source" position={Position.Right} style={{ top: "68%" }} />
    </div>
  );
}
const nodeTypes = { flowNode: FlowNode, mindNode: MindNode };

function AppSidebar({ page, setPage }) {
  const nav = [
    { id: "notes", label: "笔记", icon: NotePencil },
    { id: "tasks", label: "任务", icon: CheckSquare },
    { id: "drawing", label: "画图", icon: PencilLine },
    { id: "workflow", label: "工作流", icon: FlowArrow },
    { id: "mindmap", label: "导图", icon: TreeStructure },
    { id: "settings", label: "设置", icon: GearSix },
  ];
  return (
    <aside className="app-sidebar">
      <button className="brand" onClick={() => setPage("notes")} aria-label="返回笔记"><span className="brand-mark"><img src={mindFlowAppIcon} alt="" /></span><span>MindFlow</span></button>
      <nav aria-label="主导航">
        {nav.map(({ id, label, icon: Icon }) => (
          <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)} aria-current={page === id ? "page" : undefined} title={label}>
            <Icon size={19} weight={page === id ? "fill" : "regular"} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer"><div className="local-state" title="所有内容仅保存在本机"><Database size={18} /><span>本地</span></div></div>
    </aside>
  );
}

const noteSaveFormats = [
  { id: "jpg", label: "JPG", extension: "jpg", description: "适合分享和预览，白色背景" },
  { id: "png", label: "PNG", extension: "png", description: "清晰无损的笔记长图" },
  { id: "md", label: "Markdown", extension: "md", description: "保留标题、列表和链接语法" },
  { id: "txt", label: "TXT", extension: "txt", description: "只保留可阅读的纯文字" },
  { id: "docx", label: "DOCX", extension: "docx", description: "可在 Microsoft Word 中继续编辑" },
];

function NoteSaveAsDialog({ note, onClose, onSave }) {
  const [format, setFormat] = useState("docx");
  const [busy, setBusy] = useState(false);
  if (!note) return null;
  const selectedFormat = noteSaveFormats.find((item) => item.id === format);
  const save = async () => {
    setBusy(true);
    try {
      await onSave(note, format);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="save-as-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="save-as-dialog" role="dialog" aria-modal="true" aria-labelledby="save-as-title">
        <header><div><span className="section-kicker">导出笔记</span><h2 id="save-as-title">另存为</h2></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="关闭"><X size={16} /></button></header>
        <div className="save-as-file"><span>{safeExportName(note.title || "未命名笔记")}</span><b>.{selectedFormat.extension}</b></div>
        <div className="save-as-formats" role="radiogroup" aria-label="文件格式">
          {noteSaveFormats.map((item) => <button key={item.id} className={format === item.id ? "selected" : ""} role="radio" aria-checked={format === item.id} onClick={() => setFormat(item.id)}><span>{item.label}</span><small>{item.description}</small><CheckCircle size={16} weight="fill" /></button>)}
        </div>
        <footer><span>下一步可选择文件名和保存位置</span><button className="primary-button" onClick={save} disabled={busy}>{busy ? "正在生成…" : "选择位置并保存"}</button></footer>
      </section>
    </div>
  );
}

function NoteReminderDialog({ note, onClose, onSave, onClear }) {
  const existing = parseReminderValue(note?.reminder);
  const fallback = defaultReminderDraft();
  const [date, setDate] = useState(existing?.dateKey || fallback.date);
  const [time, setTime] = useState(existing?.time || fallback.time);
  useEffect(() => {
    const parsed = parseReminderValue(note?.reminder);
    const next = defaultReminderDraft();
    setDate(parsed?.dateKey || next.date);
    setTime(parsed?.time || next.time);
  }, [note?.id, note?.reminder]);
  if (!note) return null;
  const submit = (event) => {
    event.preventDefault();
    if (!parseDateKey(date) || !/^\d{2}:\d{2}$/.test(time)) return;
    onSave(`${date}T${time}:00`);
  };
  return (
    <div className="save-as-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="reminder-dialog" role="dialog" aria-modal="true" aria-labelledby="note-reminder-title" onSubmit={submit}>
        <header>
          <div><span className="section-kicker">笔记提醒</span><h2 id="note-reminder-title">选择提醒时间</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={16} /></button>
        </header>
        <div className="reminder-dialog-body">
          <div className="reminder-note-name"><Bell size={16} weight="duotone" /><span><small>提醒笔记</small><strong>{note.title || "未命名笔记"}</strong></span></div>
          <div className="reminder-fields">
            <label>日期<input type="date" value={date} min={dateKeyFromDate()} onChange={(event) => setDate(event.target.value)} required /></label>
            <label>时间<input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label>
          </div>
          <p><Info size={14} />MindFlow 运行时会在设定时间发送本地通知。</p>
        </div>
        <footer>
          <div>{note.reminder && <button className="danger-text" type="button" onClick={onClear}>清除提醒</button>}</div>
          <div><button className="ghost-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存提醒</button></div>
        </footer>
      </form>
    </div>
  );
}

function NotesPage({ activeNoteId, onChangeNote, onOpenWorkflow, notify }) {
  const [notes, setNotes] = useState(readStoredNotes);
  const [selectedId, setSelectedId] = useState(() => notes.some((note) => note.id === activeNoteId) ? activeNoteId : notes[0]?.id);
  const [query, setQuery] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [editorMenu, setEditorMenu] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(() => localStorage.getItem("mindflow-note-list-collapsed") === "1");
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);
  const savedRangeRef = useRef(null);
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false, list: false });
  const [activeFontSize, setActiveFontSize] = useState("14");
  const [linkEditor, setLinkEditor] = useState(null);
  const [saveAsNote, setSaveAsNote] = useState(null);
  const [reminderNote, setReminderNote] = useState(null);
  const selected = notes.find((note) => note.id === selectedId) || notes[0];
  useEffect(() => {
    try {
      localStorage.setItem("mindflow-notes", JSON.stringify(notes));
    } catch {
      notify("本地空间不足，请删除较大的图片后重试");
    }
  }, [notes, notify]);
  useEffect(() => {
    if (selectedId) onChangeNote?.(selectedId);
  }, [onChangeNote, selectedId]);
  useEffect(() => localStorage.setItem("mindflow-note-list-collapsed", listCollapsed ? "1" : "0"), [listCollapsed]);
  useEffect(() => {
    if (!contextMenu && !editorMenu) return undefined;
    const closeMenus = () => { setContextMenu(null); setEditorMenu(false); };
    const closeOnEscape = (event) => { if (event.key === "Escape") closeMenus(); };
    window.addEventListener("pointerdown", closeMenus);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMenus);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu, editorMenu]);

  const filtered = useMemo(() => notes
    .filter((note) => `${note.title}${note.preview}`.includes(query))
    .sort((a, b) => Number(Boolean(b.important)) - Number(Boolean(a.important))), [notes, query]);

  const updateSelected = (patch) => setNotes((current) => current.map((note) => {
    if (note.id !== selectedId) return note;
    const preview = patch.content === undefined
      ? note.preview
      : patch.content.replace(/[#*_<>•\n-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 30) || "开始记录一个想法…";
    return { ...note, ...patch, preview };
  }));

  const rememberEditorRange = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange();
  };

  const restoreEditorRange = () => {
    const editor = editorRef.current;
    const range = savedRangeRef.current;
    if (!editor) return false;
    editor.focus();
    if (!range || !editor.contains(range.commonAncestorContainer)) return false;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  };

  const syncRichEditor = () => {
    const editor = editorRef.current;
    if (!editor || !selected) return;
    updateSelected({ content: richEditorToMarkdown(editor) });
  };

  const refreshActiveFormats = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) {
      setActiveFormats({ bold: false, italic: false, underline: false, list: false });
      setActiveFontSize("14");
      return;
    }
    const anchorElement = selection.anchorNode instanceof Element
      ? selection.anchorNode
      : selection.anchorNode?.parentElement;
    const fontSize = anchorElement?.closest?.("[data-font-size]")?.dataset.fontSize;
    setActiveFormats({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      list: document.queryCommandState("insertUnorderedList"),
    });
    setActiveFontSize(/^(12|14|16|18|22|28)$/.test(fontSize || "") ? fontSize : "14");
  };

  const runRichCommand = (command) => {
    if (!selected) return;
    restoreEditorRange();
    document.execCommand(command, false);
    rememberEditorRange();
    syncRichEditor();
    refreshActiveFormats();
  };

  const insertLink = () => {
    if (!selected) return;
    restoreEditorRange();
    const selection = window.getSelection();
    const selectedText = selection?.rangeCount && !selection.getRangeAt(0).collapsed
      ? selection.toString().trim()
      : "";
    setLinkEditor({ text: selectedText || "链接文字", url: "https://" });
  };

  const applyLink = (event) => {
    event.preventDefault();
    if (!selected || !linkEditor) return;
    const url = normalizeLinkUrl(linkEditor.url);
    if (!url) {
      notify("请输入有效的链接地址");
      return;
    }
    restoreEditorRange();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = linkEditor.text.trim() || url;
    if (range && editorRef.current?.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(anchor);
      range.setStartAfter(anchor);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      editorRef.current?.append(anchor);
    }
    setLinkEditor(null);
    rememberEditorRange();
    syncRichEditor();
    notify("链接已插入，点击即可打开");
  };

  const applyFontSize = (value) => {
    if (!selected || !/^(12|14|16|18|22|28)$/.test(value)) return;
    restoreEditorRange();
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    if (range.collapsed) {
      const anchorElement = selection.anchorNode instanceof Element
        ? selection.anchorNode
        : selection.anchorNode?.parentElement;
      const block = anchorElement?.closest?.("p, h1, h2, h3, li, div");
      if (block && editor.contains(block)) range.selectNodeContents(block);
      else range.selectNodeContents(editor);
    }
    const span = document.createElement("span");
    span.dataset.fontSize = value;
    span.style.fontSize = `${value}px`;
    span.append(range.extractContents());
    span.querySelectorAll("[data-font-size]").forEach((child) => child.replaceWith(...child.childNodes));
    range.insertNode(span);
    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.addRange(nextRange);
    savedRangeRef.current = nextRange.cloneRange();
    setActiveFontSize(value);
    syncRichEditor();
    notify(`字号已调整为 ${value}px`);
  };

  const insertDivider = () => {
    if (!selected) return;
    restoreEditorRange();
    document.execCommand("insertHorizontalRule", false);
    rememberEditorRange();
    syncRichEditor();
    refreshActiveFormats();
    notify("分割线已插入");
  };

  const chooseImage = () => {
    if (!selected) return;
    rememberEditorRange();
    imageInputRef.current?.click();
  };

  const insertPickedImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("请选择图片文件");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      notify("图片不能超过 12MB");
      return;
    }
    try {
      const dataUrl = await imageFileToDataUrl(file);
      if (dataUrl.length > 1_800_000) {
        notify("图片压缩后仍然过大，请换一张较小的图片");
        return;
      }
      restoreEditorRange();
      document.execCommand("insertImage", false, dataUrl);
      const images = editorRef.current?.querySelectorAll("img") || [];
      const inserted = Array.from(images).findLast?.((image) => image.src === dataUrl) || images[images.length - 1];
      if (inserted) inserted.alt = file.name.replace(/\.[^.]+$/, "") || "图片";
      rememberEditorRange();
      syncRichEditor();
      notify("图片已插入并保存在本机");
    } catch {
      notify("图片插入失败");
    }
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const noteKey = String(selected?.id || "");
    if (editor.dataset.noteId !== noteKey || document.activeElement !== editor) {
      const nextHtml = markdownToRichHtml(selected?.content || "");
      if (editor.innerHTML !== nextHtml) editor.innerHTML = nextHtml;
      editor.dataset.noteId = noteKey;
    }
  }, [selected?.id, selected?.content]);

  useEffect(() => {
    const handleSelectionChange = () => refreshActiveFormats();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  const updateNote = (id, patch) => setNotes((current) => current.map((note) => note.id === id ? { ...note, ...patch } : note));

  const deleteNote = (id) => {
    const next = notes.filter((note) => note.id !== id);
    setNotes(next);
    if (selectedId === id) setSelectedId(next[0]?.id || null);
    setContextMenu(null);
    setEditorMenu(false);
    notify("笔记已删除");
  };

  useEffect(() => {
    const deleteFocusedNote = (event) => {
      if (event.key !== "Delete" || event.defaultPrevented || isTextEntryTarget(event.target)) return;
      const focusedRow = event.target.closest?.(".note-row");
      if (!focusedRow) return;
      const noteId = Number(focusedRow.dataset.noteId || selectedId);
      if (!noteId) return;
      event.preventDefault();
      deleteNote(noteId);
    };
    window.addEventListener("keydown", deleteFocusedNote);
    return () => window.removeEventListener("keydown", deleteFocusedNote);
  }, [notes, selectedId]);

  const duplicateNote = (id) => {
    const source = notes.find((note) => note.id === id);
    if (!source) return;
    const copy = { ...source, id: Date.now(), title: `${source.title} · 副本`, date: "刚刚", important: false, reminder: "" };
    setNotes((current) => [copy, ...current]);
    setSelectedId(copy.id);
    setContextMenu(null);
    setEditorMenu(false);
    notify("已创建笔记副本");
  };

  const toggleImportant = (id) => {
    const note = notes.find((item) => item.id === id);
    updateNote(id, { important: !note?.important });
    setContextMenu(null);
    setEditorMenu(false);
    notify(note?.important ? "已取消重点" : "已标记为重点");
  };

  const openReminder = (id) => {
    const note = notes.find((item) => item.id === id);
    if (!note) return;
    setReminderNote(note);
    setContextMenu(null);
    setEditorMenu(false);
  };

  const saveReminder = (value) => {
    if (!reminderNote) return;
    updateNote(reminderNote.id, { reminder: value });
    setReminderNote(null);
    notify(`提醒已设置为 ${formatReminderLabel(value)}`);
  };

  const clearReminder = () => {
    if (!reminderNote) return;
    updateNote(reminderNote.id, { reminder: "" });
    setReminderNote(null);
    notify("提醒已清除");
  };

  const openContextMenu = (event, note) => {
    event.preventDefault();
    setSelectedId(note.id);
    setEditorMenu(false);
    setContextMenu({
      id: note.id,
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - 204)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - 250)),
    });
  };

  const addNote = () => {
    const id = Date.now();
    setNotes((current) => [{ id, title: "未命名笔记", preview: "开始记录一个想法…", date: "刚刚", tag: "笔记", tone: "violet", content: "" }, ...current]);
    setSelectedId(id); notify("已新建笔记");
  };
  const saveNoteAs = async (note, format) => {
    try {
      const baseName = safeExportName(note.title || "未命名笔记");
      const formatInfo = noteSaveFormats.find((item) => item.id === format);
      let blob;
      if (format === "jpg") blob = await createNoteImageBlob(note, "image/jpeg");
      else if (format === "png") blob = await createNoteImageBlob(note, "image/png");
      else if (format === "md") blob = textBlob(`# ${note.title || "未命名笔记"}\n\n${note.content || ""}`, "text/markdown;charset=utf-8");
      else if (format === "txt") blob = textBlob(noteToPlainText(note));
      else if (format === "docx") blob = await createNoteDocxBlob(note);
      else throw new Error("不支持的文件格式");
      const result = await saveBlobToUser(`${baseName}.${formatInfo.extension}`, blob, [{ name: formatInfo.label, extensions: [formatInfo.extension] }]);
      if (result?.saved) {
        setSaveAsNote(null);
        notify(`已另存为 ${formatInfo.label}`);
      }
    } catch (error) {
      window.__mindflowLastExportError = String(error?.stack || error);
      notify("另存失败，请重新选择格式或位置");
    }
  };
  return (
    <section className={`notes-layout ${listCollapsed ? "notes-list-collapsed" : ""}`}>
      <aside className="notes-list-pane">
        <button className="notes-pane-expand" onClick={() => setListCollapsed(false)} aria-label="展开笔记列表" title="展开笔记列表"><CaretRight size={16} weight="bold" /></button>
        <header className="pane-title"><div><span className="section-kicker">资料库</span><h1>全部笔记</h1></div><div className="pane-actions"><button className="pane-collapse" onClick={() => setListCollapsed(true)} aria-label="收起笔记列表" title="收起笔记列表"><CaretLeft size={16} weight="bold" /></button><button className="icon-button" onClick={addNote} aria-label="新建笔记"><Plus size={17} /></button></div></header>
        <label className="search-box"><MagnifyingGlass size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索笔记…" /></label>
        <div className="note-rows">
          {filtered.map((note) => <button key={note.id} data-note-id={note.id} className={`note-row ${selectedId === note.id ? "selected" : ""}`} onClick={() => setSelectedId(note.id)} onContextMenu={(event) => openContextMenu(event, note)}><div className="note-row-top"><strong>{note.important && <Star className="note-priority" size={11} weight="fill" />}{note.title}</strong><span>{note.date}</span></div><p>{note.preview}</p><div className="note-row-meta"><span className={`tag ${note.tone}`}>{note.tag}</span>{note.reminder && <span className="note-reminder"><Bell size={10} weight="fill" />{formatReminderLabel(note.reminder)}</span>}</div></button>)}
          {!filtered.length && <div className="notes-empty"><MagnifyingGlass size={20} /><strong>没有匹配的笔记</strong><span>试试更短的关键词</span></div>}
        </div>
        <div className="list-footer"><span>{notes.length} 条笔记</span><span>本地保存</span></div>
      </aside>
      <article className="note-editor">
        <header className="editor-header">
          <div className="editor-title-line"><div className="document-heading"><span>全部笔记 / {selected?.tag || "笔记"}</span><input className="editor-title-input" value={selected?.title || ""} onChange={(event) => updateSelected({ title: event.target.value })} aria-label="笔记标题" disabled={!selected} /></div><div className="editor-actions"><button className="ghost-button" onClick={() => { localStorage.setItem("mindflow-notes", JSON.stringify(notes)); notify("笔记已保存"); }} disabled={!selected}><FloppyDisk size={15} />保存</button><button className="primary-button" onClick={() => selected && onOpenWorkflow(selected.id)} disabled={!selected}><FlowArrow size={15} />加入工作流</button><div className="editor-more-wrap" onPointerDown={(event) => event.stopPropagation()}><button className="icon-button" onClick={() => setEditorMenu((open) => !open)} aria-label="笔记选项" aria-expanded={editorMenu}><DotsThree size={18} /></button>{editorMenu && selected && <div className="action-menu editor-more-menu" role="menu"><button onClick={() => toggleImportant(selected.id)}><Star size={15} weight={selected.important ? "fill" : "regular"} />{selected.important ? "取消重点" : "标记重点"}</button><button onClick={() => openReminder(selected.id)}><Bell size={15} weight={selected.reminder ? "fill" : "regular"} />{selected.reminder ? "修改提醒" : "设置提醒"}</button><button onClick={() => { setEditorMenu(false); setSaveAsNote(selected); }}><Export size={15} />另存为…</button><button onClick={() => duplicateNote(selected.id)}><Copy size={15} />创建副本</button><i /><button className="danger" onClick={() => deleteNote(selected.id)}><Trash size={15} />删除笔记</button></div>}</div></div></div>
          <div className="format-bar" aria-label="文本格式工具栏">
            <div className="format-size-select" onPointerDown={rememberEditorRange}>
              <SelectMenu label="字号" value={activeFontSize} onChange={applyFontSize} options={["12", "14", "16", "18", "22", "28"].map((size) => ({ value: size, label: `${size}px` }))} />
            </div>
            <i />
            <button className={activeFormats.bold ? "active" : ""} onPointerDown={(event) => { rememberEditorRange(); event.preventDefault(); }} onClick={() => runRichCommand("bold")} aria-label="加粗" aria-pressed={activeFormats.bold} title="加粗 Ctrl+B"><TextB size={16} /></button>
            <button className={activeFormats.italic ? "active" : ""} onPointerDown={(event) => { rememberEditorRange(); event.preventDefault(); }} onClick={() => runRichCommand("italic")} aria-label="斜体" aria-pressed={activeFormats.italic} title="斜体 Ctrl+I"><TextItalic size={16} /></button>
            <button className={activeFormats.underline ? "active" : ""} onPointerDown={(event) => { rememberEditorRange(); event.preventDefault(); }} onClick={() => runRichCommand("underline")} aria-label="下划线" aria-pressed={activeFormats.underline} title="下划线 Ctrl+U"><TextUnderline size={16} /></button>
            <i />
            <button className={activeFormats.list ? "active" : ""} onPointerDown={(event) => { rememberEditorRange(); event.preventDefault(); }} onClick={() => runRichCommand("insertUnorderedList")} aria-label="列表" aria-pressed={activeFormats.list} title="项目列表"><ListBullets size={16} /></button>
            <button onPointerDown={(event) => { rememberEditorRange(); event.preventDefault(); }} onClick={insertDivider} aria-label="分割线" title="插入分割线"><Minus size={17} weight="bold" /></button>
            <i />
            <button className={linkEditor ? "active" : ""} onPointerDown={(event) => { rememberEditorRange(); event.preventDefault(); }} onClick={insertLink} aria-label="链接" title="插入链接"><Link size={16} /></button>
            <button onPointerDown={rememberEditorRange} onClick={chooseImage} aria-label="图片" title="插入本地图片"><ImageSquare size={16} /></button>
            <input ref={imageInputRef} className="format-file-input" type="file" accept="image/*" onChange={insertPickedImage} tabIndex={-1} aria-hidden="true" />
          </div>
          {linkEditor && (
            <form className="link-editor-popover" onSubmit={applyLink} onPointerDown={(event) => event.stopPropagation()}>
              <header><strong>插入链接</strong><button type="button" onClick={() => setLinkEditor(null)} aria-label="关闭链接面板"><X size={14} /></button></header>
              <label>显示文字<input value={linkEditor.text} onChange={(event) => setLinkEditor((current) => ({ ...current, text: event.target.value }))} /></label>
              <label>链接地址<input autoFocus value={linkEditor.url} onChange={(event) => setLinkEditor((current) => ({ ...current, url: event.target.value }))} placeholder="https://example.com" /></label>
              <button className="primary-button" type="submit">插入链接</button>
            </form>
          )}
        </header>
        <div
          ref={editorRef}
          className="editor-body"
          contentEditable={Boolean(selected)}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="笔记内容"
          aria-disabled={!selected}
          spellCheck="false"
          onInput={syncRichEditor}
          onBlur={syncRichEditor}
          onClick={(event) => {
            const anchor = event.target.closest?.("a");
            if (!anchor) return;
            event.preventDefault();
            window.open(anchor.href, "_blank", "noopener,noreferrer");
          }}
          onMouseUp={() => { rememberEditorRange(); refreshActiveFormats(); }}
          onKeyUp={() => { rememberEditorRange(); refreshActiveFormats(); }}
          onKeyDown={(event) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            const command = { b: "bold", i: "italic", u: "underline" }[event.key.toLowerCase()];
            if (!command) return;
            event.preventDefault();
            runRichCommand(command);
          }}
        />
        <footer className="editor-footer"><span>{(selected?.content || "").replace(/!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|[#*_<>-]/g, "").length} 字</span><span>更改已保存到本机</span></footer>
      </article>
      {contextMenu && (() => { const note = notes.find((item) => item.id === contextMenu.id); return note ? <div className="action-menu note-context-menu" style={{ left: contextMenu.left, top: contextMenu.top }} role="menu" onPointerDown={(event) => event.stopPropagation()}><button onClick={() => toggleImportant(note.id)}><Star size={15} weight={note.important ? "fill" : "regular"} />{note.important ? "取消重点" : "标记重点"}</button><button onClick={() => openReminder(note.id)}><Bell size={15} weight={note.reminder ? "fill" : "regular"} />{note.reminder ? "修改提醒" : "设置提醒"}</button><button onClick={() => duplicateNote(note.id)}><Copy size={15} />创建副本</button><button onClick={() => { setContextMenu(null); setSaveAsNote(note); }}><Export size={15} />另存为…</button><i /><button className="danger" onClick={() => deleteNote(note.id)}><Trash size={15} />删除笔记</button></div> : null; })()}
      <NoteSaveAsDialog note={saveAsNote} onClose={() => setSaveAsNote(null)} onSave={saveNoteAs} />
      <NoteReminderDialog note={reminderNote} onClose={() => setReminderNote(null)} onSave={saveReminder} onClear={clearReminder} />
    </section>
  );
}

function NodeInspector({ node, onClose, onDelete, onOpenNote, onUpdate, notify }) {
  if (!node) return null;
  return (
    <aside className="node-inspector">
      <header><div><span className="eyebrow">模块设置</span><h3>{node.data.label}</h3></div><button className="icon-button" onClick={onClose}><X size={16} /></button></header>
      <label>名称<input value={node.data.label} onChange={(event) => onUpdate(node.id, { label: event.target.value })} /></label>
      <label>类型<SelectMenu label="模块类型" value={node.data.kind || "模块"} onChange={(value) => onUpdate(node.id, { kind: value })} options={["笔记", "文本", "分组", "清单", "条件", "里程碑", "导图", "模块"].map((item) => ({ value: item, label: item }))} /></label>
      <label>说明<textarea value={node.data.subtitle || ""} onChange={(event) => onUpdate(node.id, { subtitle: event.target.value })} placeholder="说明这个模块记录什么" /></label>
      <div className="inspector-note"><Info size={16} /><span>拖动两侧圆点连接模块；把连线松开在空白处可以直接新建模块。</span></div>
      <div className="inspector-actions"><button className="danger-text" onClick={onDelete}>删除模块</button><div className="inspector-actions-main"><button className="ghost-button inspector-note-jump" onClick={onOpenNote}><NotePencil size={14} />跳转到笔记</button><button className="primary-button" onClick={() => { notify("模块设置已保存"); onClose(); }}>完成</button></div></div>
    </aside>
  );
}

const workflowNodeTemplates = [
  { id: "note", label: "笔记", subtitle: "引用一条本地笔记", kind: "笔记", icon: NotePencil },
  { id: "text", label: "文本", subtitle: "写一段补充说明", kind: "文本", icon: TextB },
  { id: "group", label: "分组", subtitle: "把相关内容收在一起", kind: "分组", icon: SquaresFour },
  { id: "list", label: "清单", subtitle: "整理步骤、物品或待办", kind: "清单", icon: ListBullets },
  { id: "condition", label: "条件", subtitle: "标记不同的选择路径", kind: "条件", icon: FlowArrow },
  { id: "milestone", label: "里程碑", subtitle: "标记关键时间与结果", kind: "里程碑", icon: CheckCircle },
  { id: "mindmap", label: "思维导图", subtitle: "进入可编辑的主题结构", kind: "导图", icon: TreeStructure },
];

const arrangeWorkflowNodes = (currentNodes, currentEdges) => {
  if (currentNodes.length < 2) return currentNodes;

  const nodeById = new Map(currentNodes.map((node) => [node.id, node]));
  const outgoing = new Map(currentNodes.map((node) => [node.id, []]));
  const incoming = new Map(currentNodes.map((node) => [node.id, []]));

  currentEdges.forEach((item) => {
    if (!nodeById.has(item.source) || !nodeById.has(item.target) || item.source === item.target) return;
    outgoing.get(item.source).push(item.target);
    incoming.get(item.target).push(item.source);
  });

  const remainingInputs = new Map(currentNodes.map((node) => [node.id, incoming.get(node.id).length]));
  const ranks = new Map();
  const processed = new Set();
  const queue = currentNodes
    .filter((node) => remainingInputs.get(node.id) === 0)
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
    .map((node) => node.id);

  queue.forEach((id) => ranks.set(id, 0));
  while (queue.length) {
    const sourceId = queue.shift();
    if (processed.has(sourceId)) continue;
    processed.add(sourceId);
    (outgoing.get(sourceId) || []).forEach((targetId) => {
      ranks.set(targetId, Math.max(ranks.get(targetId) || 0, (ranks.get(sourceId) || 0) + 1));
      const nextCount = remainingInputs.get(targetId) - 1;
      remainingInputs.set(targetId, nextCount);
      if (nextCount === 0) queue.push(targetId);
    });
  }

  currentNodes
    .filter((node) => !processed.has(node.id))
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
    .forEach((node) => {
      const parentRanks = (incoming.get(node.id) || [])
        .map((id) => ranks.get(id))
        .filter((rank) => Number.isFinite(rank));
      ranks.set(node.id, parentRanks.length ? Math.max(...parentRanks) + 1 : 0);
    });

  const layers = new Map();
  currentNodes.forEach((node) => {
    const rank = ranks.get(node.id) || 0;
    if (!layers.has(rank)) layers.set(rank, []);
    layers.get(rank).push(node);
  });
  layers.forEach((layer) => layer.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x));

  const nodeWidth = 242;
  const nodeHeight = 116;
  const horizontalGap = 310;
  const verticalGap = 42;
  const maxRank = Math.max(...layers.keys());
  const minX = Math.min(...currentNodes.map((node) => node.position.x));
  const maxX = Math.max(...currentNodes.map((node) => node.position.x + nodeWidth));
  const minY = Math.min(...currentNodes.map((node) => node.position.y));
  const maxY = Math.max(...currentNodes.map((node) => node.position.y + nodeHeight));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const originX = centerX - (maxRank * horizontalGap + nodeWidth) / 2;
  const nextPositions = new Map();

  layers.forEach((layer, rank) => {
    const layerHeight = layer.length * nodeHeight + Math.max(0, layer.length - 1) * verticalGap;
    let y = centerY - layerHeight / 2;
    layer.forEach((node) => {
      nextPositions.set(node.id, { x: originX + rank * horizontalGap, y });
      y += nodeHeight + verticalGap;
    });
  });

  return currentNodes.map((node) => ({ ...node, position: nextPositions.get(node.id) || node.position }));
};

function WorkflowNodeMenu({ menu, query, setQuery, onChoose, onClose }) {
  if (!menu) return null;
  const normalized = query.trim().toLowerCase();
  const options = workflowNodeTemplates.filter((item) => `${item.label}${item.subtitle}`.toLowerCase().includes(normalized));
  return (
    <div
      className="node-library-popover nodrag nowheel"
      style={{ left: menu.left, top: menu.top }}
      role="dialog"
      aria-label="添加工作流节点"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header>
        <div><strong>{menu.from ? "连接到新节点" : "添加节点"}</strong><span>{menu.from ? "选择后会自动完成连接" : "添加到当前画布中心"}</span></div>
        <button className="popover-close" onClick={onClose} aria-label="关闭"><X size={14} /></button>
      </header>
      <label className="node-library-search"><MagnifyingGlass size={14} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点" /></label>
      <div className="node-library-list">
        {options.map(({ id, label, subtitle, icon: Icon }) => (
          <button key={id} onClick={() => onChoose(id)}>
            <span className="library-icon"><Icon size={16} weight="duotone" /></span>
            <span><strong>{label}</strong><small>{subtitle}</small></span>
            <Plus size={14} />
          </button>
        ))}
        {!options.length && <div className="node-library-empty">没有匹配的节点</div>}
      </div>
      <footer><span>拖动节点边缘的小圆点也可以打开这里</span><kbd>Esc</kbd></footer>
    </div>
  );
}

const makeWorkflowState = (note) => {
  if (note?.id === 1) {
    return {
      nodes: workflowNodes.map((node) => node.id === "input"
        ? { ...node, position: { ...node.position }, data: { ...node.data, subtitle: note.title } }
        : { ...node, position: { ...node.position }, data: { ...node.data } }),
      edges: workflowEdges.map((item) => ({ ...item, style: { ...item.style } })),
    };
  }
  return {
    nodes: [
      { id: "input", type: "flowNode", position: { x: 190, y: 300 }, data: { label: "笔记内容", subtitle: note?.title || "未命名笔记", kind: "笔记" } },
      { id: "group", type: "flowNode", position: { x: 540, y: 300 }, data: { label: "主题分组", subtitle: "从这条笔记开始整理", kind: "分组" } },
    ],
    edges: [edge("starter-edge", "input", "group", "#8aa5a2")],
  };
};

function readWorkflowState(note) {
  try {
    const storageKey = `mindflow-workflow-v3-${note?.id || "default"}`;
    const saved = JSON.parse(localStorage.getItem(storageKey) || (note?.id === 1 ? localStorage.getItem("mindflow-workflow-v2") : "null") || "null");
    if (saved?.nodes?.length && Array.isArray(saved.edges)) return { ...saved, edges: stripEdgeMarkers(saved.edges) };
  } catch {
    // Keep the reference workflow when saved data is incomplete.
  }
  return makeWorkflowState(note);
}

function WorkflowPage({ activeNoteId, onChangeNote, onOpenMindMap, onOpenNote, notify }) {
  const notes = readStoredNotes();
  const activeNote = notes.find((note) => note.id === activeNoteId) || notes[0];
  const startingState = useMemo(() => readWorkflowState(activeNote), [activeNote?.id]);
  const [nodes, setNodes, onNodesChange] = useNodesState(startingState.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(startingState.edges);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [canvasDragging, setCanvasDragging] = useState(false);
  const [flowInstance, setFlowInstance] = useState(null);
  const [nodeMenu, setNodeMenu] = useState(null);
  const [nodeQuery, setNodeQuery] = useState("");

  useEffect(() => {
    setEdges((current) => stripEdgeMarkers(current));
  }, [setEdges]);

  useDebouncedCanvasPersistence(`mindflow-workflow-v3-${activeNote?.id || "default"}`, nodes, edges, canvasDragging);

  useEffect(() => {
    if (!nodeMenu) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") { setNodeMenu(null); setNodeQuery(""); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [nodeMenu]);

  const onConnect = useCallback((params) => setEdges((current) => addEdge({
    ...params,
    type: "bezier",
    style: { stroke: "#789a96", strokeWidth: 1.8 },
  }, current)), [setEdges]);
  const onReconnect = useCallback((oldEdge, nextConnection) => {
    setEdges((current) => reconnectEdge(oldEdge, nextConnection, current));
  }, [setEdges]);

  const openNodeMenu = useCallback((clientPoint, flowPosition, from = null) => {
    const popoverWidth = 294;
    const popoverHeight = 430;
    setNodeQuery("");
    setNodeMenu({
      from,
      flowPosition,
      left: Math.max(12, Math.min(clientPoint.x + 10, window.innerWidth - popoverWidth - 12)),
      top: Math.max(12, Math.min(clientPoint.y + 10, window.innerHeight - popoverHeight - 12)),
    });
  }, []);

  const onConnectEnd = useCallback((event, connectionState) => {
    if (!flowInstance || connectionState?.isValid || connectionState?.toNode || !connectionState?.fromNode || !connectionState?.fromHandle) return;
    const pointer = "changedTouches" in event ? event.changedTouches[0] : event;
    const clientPoint = { x: pointer.clientX, y: pointer.clientY };
    const flowPosition = flowInstance.screenToFlowPosition(clientPoint);
    openNodeMenu(clientPoint, flowPosition, {
      nodeId: connectionState.fromNode.id,
      handleId: connectionState.fromHandle.id,
      handleType: connectionState.fromHandle.type,
    });
  }, [flowInstance, openNodeMenu]);

  const openAddNodeMenu = useCallback((event) => {
    if (!flowInstance) return;
    const buttonRect = event.currentTarget.getBoundingClientRect();
    const stageRect = event.currentTarget.closest(".flow-stage")?.getBoundingClientRect();
    const clientPoint = {
      x: stageRect ? stageRect.left + stageRect.width / 2 : buttonRect.left + 180,
      y: stageRect ? stageRect.top + stageRect.height / 2 : buttonRect.bottom + 160,
    };
    openNodeMenu(
      { x: buttonRect.left, y: buttonRect.bottom },
      flowInstance.screenToFlowPosition(clientPoint),
    );
  }, [flowInstance, openNodeMenu]);

  const addWorkflowNode = useCallback((templateId) => {
    const template = workflowNodeTemplates.find((item) => item.id === templateId);
    if (!template || !nodeMenu) return;
    const id = `node-${template.id}-${Date.now()}`;
    const newNode = {
      id,
      type: "flowNode",
      position: { x: nodeMenu.flowPosition.x - 88, y: nodeMenu.flowPosition.y - 53 },
      data: { label: template.label, subtitle: template.subtitle, kind: template.kind },
    };
    setNodes((current) => [...current, newNode]);
    if (nodeMenu.from) {
      const beginsAtSource = nodeMenu.from.handleType === "source";
      const source = beginsAtSource ? nodeMenu.from.nodeId : id;
      const target = beginsAtSource ? id : nodeMenu.from.nodeId;
      setEdges((current) => addEdge(edge(`edge-${Date.now()}`, source, target, "#789a96"), current));
    }
    setSelectedNode(newNode);
    setSelectedEdgeId(null);
    setNodeMenu(null);
    setNodeQuery("");
    notify(nodeMenu.from ? "新节点已创建并连接" : "新节点已添加");
  }, [nodeMenu, notify, setEdges, setNodes]);

  const updateNode = useCallback((id, patch) => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node));
    setSelectedNode((current) => current?.id === id ? { ...current, data: { ...current.data, ...patch } } : current);
  }, [setNodes]);
  const deleteNode = useCallback(() => {
    if (!selectedNode) return;
    setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
    setEdges((current) => current.filter((item) => item.source !== selectedNode.id && item.target !== selectedNode.id));
    setSelectedNode(null);
    setSelectedEdgeId(null);
    notify("节点已删除");
  }, [notify, selectedNode, setEdges, setNodes]);

  const deleteWorkflowSelection = useCallback(() => {
    if (selectedNode) {
      deleteNode();
      return;
    }
    if (!selectedEdgeId) return;
    setEdges((current) => current.filter((item) => item.id !== selectedEdgeId));
    setSelectedEdgeId(null);
    notify("连线已删除");
  }, [deleteNode, notify, selectedEdgeId, selectedNode, setEdges]);

  useEffect(() => {
    const handleDelete = (event) => {
      if (event.key !== "Delete" || event.defaultPrevented || isTextEntryTarget(event.target)) return;
      if (!selectedNode && !selectedEdgeId) return;
      event.preventDefault();
      deleteWorkflowSelection();
    };
    window.addEventListener("keydown", handleDelete);
    return () => window.removeEventListener("keydown", handleDelete);
  }, [deleteWorkflowSelection, selectedEdgeId, selectedNode]);
  const saveWorkflow = () => {
    const cleanNodes = nodes.map(({ id, type, position, data }) => ({ id, type, position, data }));
    localStorage.setItem(`mindflow-workflow-v3-${activeNote?.id || "default"}`, JSON.stringify({ nodes: cleanNodes, edges }));
    notify("工作流已保存到当前笔记");
  };
  const organizeWorkflow = () => {
    setNodes((current) => arrangeWorkflowNodes(current, edges));
    setSelectedEdgeId(null);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => flowInstance?.fitView({ padding: 0.16, duration: 320 }));
    });
    notify("已整理当前工作流");
  };
  return (
    <section className="workflow-page">
      <header className="workspace-header"><div className="workspace-title"><span className="section-kicker">工作流</span><div><NoteSwitcher value={activeNote?.id} onChange={onChangeNote} /><span className="saved-state"><CheckCircle size={13} weight="fill" />已保存</span></div></div><div className="header-actions"><button className="ghost-button" onClick={saveWorkflow}><FloppyDisk size={15} />保存</button><button className="ghost-button" onClick={organizeWorkflow}><ArrowCounterClockwise size={15} />整理布局</button><button className="primary-button" onClick={onOpenMindMap}><TreeStructure size={15} />查看导图</button></div></header>
      <div className="flow-stage">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onReconnect={onReconnect}
          onInit={setFlowInstance}
          onNodeDragStart={() => setCanvasDragging(true)}
          onNodeDragStop={() => setCanvasDragging(false)}
          onNodeClick={(_, node) => { setSelectedNode(node); setSelectedEdgeId(null); }}
          onNodeDoubleClick={(_, node) => { setSelectedNode(node); setSelectedEdgeId(null); onOpenNote(activeNote?.id); }}
          onEdgeClick={(_, selectedEdge) => { setSelectedEdgeId(selectedEdge.id); setSelectedNode(null); }}
          onPaneClick={() => { setSelectedNode(null); setSelectedEdgeId(null); }}
          onEdgeDoubleClick={(_, selectedEdge) => {
            setEdges((current) => current.filter((item) => item.id !== selectedEdge.id));
            setSelectedEdgeId(null);
            notify("连线已删除");
          }}
          isValidConnection={(connection) => connection.source !== connection.target}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.14 }}
          minZoom={0.45}
          maxZoom={1.8}
          edgesReconnectable
          reconnectRadius={22}
          connectionRadius={18}
          connectionLineType={ConnectionLineType.Bezier}
          connectionLineStyle={{ stroke: "var(--accent)", strokeWidth: 1.8 }}
          defaultEdgeOptions={{ type: "bezier" }}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant="dots" gap={24} size={1} color="var(--canvas-dot)" /><Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>
        <button className="add-node-button" onClick={openAddNodeMenu}><Plus size={15} weight="bold" />添加模块</button>
        <div className="canvas-mode">拖线新建 <i aria-hidden="true" /> 双击节点打开笔记 <i aria-hidden="true" /> Delete 删除</div>
        <div className="canvas-status"><span />所有内容保存在本机</div>
        <WorkflowNodeMenu menu={nodeMenu} query={nodeQuery} setQuery={setNodeQuery} onChoose={addWorkflowNode} onClose={() => { setNodeMenu(null); setNodeQuery(""); }} />
        <NodeInspector node={selectedNode} onClose={() => setSelectedNode(null)} onDelete={deleteNode} onOpenNote={() => onOpenNote(activeNote?.id)} onUpdate={updateNode} notify={notify} />
      </div>
    </section>
  );
}

const mindNodes = [
  { id: "root", type: "mindNode", position: { x: 510, y: 330 }, data: { label: "日本旅行计划", tone: "root" } },
  { id: "time", type: "mindNode", position: { x: 125, y: 120 }, data: { label: "旅行准备", tone: "branch" } },
  { id: "season", type: "mindNode", position: { x: -25, y: 28 }, data: { label: "樱花季", tone: "leaf" } },
  { id: "route", type: "mindNode", position: { x: 790, y: 90 }, data: { label: "行程安排", tone: "branch" } },
  { id: "tokyo", type: "mindNode", position: { x: 1030, y: 15 }, data: { label: "东京（3天）", tone: "leaf" } },
  { id: "kyoto", type: "mindNode", position: { x: 1030, y: 115 }, data: { label: "京都（2天）", tone: "leaf" } },
  { id: "osaka", type: "mindNode", position: { x: 1030, y: 215 }, data: { label: "大阪（2天）", tone: "leaf" } },
  { id: "budget", type: "mindNode", position: { x: 220, y: 610 }, data: { label: "预算规划", tone: "branch" } },
  { id: "flight", type: "mindNode", position: { x: -15, y: 530 }, data: { label: "机票 5000元", tone: "leaf" } },
  { id: "stay", type: "mindNode", position: { x: -15, y: 610 }, data: { label: "住宿 4000元", tone: "leaf" } },
  { id: "food", type: "mindNode", position: { x: -15, y: 690 }, data: { label: "餐饮 3000元", tone: "leaf" } },
  { id: "experience", type: "mindNode", position: { x: 820, y: 610 }, data: { label: "体验项目", tone: "branch" } },
  { id: "onsen", type: "mindNode", position: { x: 1050, y: 555 }, data: { label: "温泉体验", tone: "leaf" } },
  { id: "cuisine", type: "mindNode", position: { x: 1050, y: 650 }, data: { label: "日本美食", tone: "leaf" } },
];
const mindEdge = (id, source, target, color, sourceSide, targetSide) => edge(
  id,
  source,
  target,
  color,
  { sourceHandle: `out-${sourceSide}`, targetHandle: `in-${targetSide}` },
);

const mindEdges = [
  mindEdge("m1", "root", "time", "#6f9691", "left", "right"),
  mindEdge("m2", "time", "season", "#9bb1ae", "left", "right"),
  mindEdge("m3", "root", "route", "#6f9691", "right", "left"),
  mindEdge("m4", "route", "tokyo", "#9bb1ae", "right", "left"),
  mindEdge("m5", "route", "kyoto", "#9bb1ae", "right", "left"),
  mindEdge("m6", "route", "osaka", "#9bb1ae", "right", "left"),
  mindEdge("m7", "root", "budget", "#6f9691", "left", "right"),
  mindEdge("m8", "budget", "flight", "#9bb1ae", "left", "right"),
  mindEdge("m9", "budget", "stay", "#9bb1ae", "left", "right"),
  mindEdge("m10", "budget", "food", "#9bb1ae", "left", "right"),
  mindEdge("m11", "root", "experience", "#6f9691", "right", "left"),
  mindEdge("m12", "experience", "onsen", "#9bb1ae", "right", "left"),
  mindEdge("m13", "experience", "cuisine", "#9bb1ae", "right", "left"),
];

const arrangeMindMapNodes = (currentNodes, currentEdges) => {
  if (currentNodes.length < 2) return currentNodes;

  const nodeById = new Map(currentNodes.map((node) => [node.id, node]));
  const root = currentNodes.find((node) => node.id === "root")
    || currentNodes.find((node) => node.data?.tone === "root")
    || currentNodes[0];
  const neighbours = new Map(currentNodes.map((node) => [node.id, []]));

  currentEdges.forEach((item) => {
    if (!nodeById.has(item.source) || !nodeById.has(item.target) || item.source === item.target) return;
    neighbours.get(item.source).push({ id: item.target, edge: item });
    neighbours.get(item.target).push({ id: item.source, edge: item });
  });

  const visited = new Set([root.id]);
  const children = new Map(currentNodes.map((node) => [node.id, []]));
  const parentEdge = new Map();
  const queue = [root.id];

  while (queue.length) {
    const parentId = queue.shift();
    const adjacent = [...(neighbours.get(parentId) || [])]
      .sort((a, b) => (nodeById.get(a.id)?.position.y || 0) - (nodeById.get(b.id)?.position.y || 0));
    adjacent.forEach(({ id, edge: branchEdge }) => {
      if (visited.has(id)) return;
      visited.add(id);
      children.get(parentId).push(id);
      parentEdge.set(id, branchEdge);
      queue.push(id);
    });
  }

  const rootChildren = children.get(root.id) || [];
  if (!rootChildren.length) return currentNodes;

  const branchSpan = new Map();
  const measureBranch = (id) => {
    const descendants = children.get(id) || [];
    const span = descendants.length
      ? descendants.reduce((total, childId) => total + measureBranch(childId), 0)
      : 1;
    branchSpan.set(id, span);
    return span;
  };
  rootChildren.forEach(measureBranch);

  const sideFromRootEdge = (id) => {
    const branchEdge = parentEdge.get(id);
    if (!branchEdge) return null;
    const handle = branchEdge.source === root.id ? branchEdge.sourceHandle : branchEdge.targetHandle;
    if (handle?.endsWith("left")) return "left";
    if (handle?.endsWith("right")) return "right";
    return null;
  };

  const leftBranches = [];
  const rightBranches = [];
  rootChildren.forEach((id) => {
    const branch = nodeById.get(id);
    const side = sideFromRootEdge(id)
      || (branch.position.x < root.position.x ? "left" : branch.position.x > root.position.x ? "right" : null);
    if (side === "left") leftBranches.push(id);
    else if (side === "right") rightBranches.push(id);
    else {
      const leftWeight = leftBranches.reduce((sum, branchId) => sum + branchSpan.get(branchId), 0);
      const rightWeight = rightBranches.reduce((sum, branchId) => sum + branchSpan.get(branchId), 0);
      (leftWeight <= rightWeight ? leftBranches : rightBranches).push(id);
    }
  });

  const nextPositions = new Map([[root.id, { ...root.position }]]);
  const horizontalGap = 220;
  const verticalGap = 82;
  const rootCenterY = root.position.y + 27;

  const layoutSide = (branchIds, direction) => {
    const totalSpan = branchIds.reduce((sum, id) => sum + branchSpan.get(id), 0);
    let cursor = rootCenterY - (totalSpan * verticalGap) / 2;

    const placeBranch = (id, depth, startY) => {
      const span = branchSpan.get(id);
      const centerY = startY + (span * verticalGap) / 2;
      nextPositions.set(id, {
        x: root.position.x + direction * horizontalGap * depth,
        y: centerY - 21,
      });
      let childCursor = startY;
      (children.get(id) || []).forEach((childId) => {
        placeBranch(childId, depth + 1, childCursor);
        childCursor += branchSpan.get(childId) * verticalGap;
      });
    };

    branchIds.forEach((id) => {
      placeBranch(id, 1, cursor);
      cursor += branchSpan.get(id) * verticalGap;
    });
  };

  layoutSide(leftBranches, -1);
  layoutSide(rightBranches, 1);

  return currentNodes.map((node) => {
    const position = nextPositions.get(node.id);
    return position ? { ...node, position } : node;
  });
};

const makeMindState = (note) => {
  if (note?.id === 1) {
    return {
      nodes: mindNodes.map((node) => node.id === "root"
        ? { ...node, position: { ...node.position }, data: { ...node.data, label: note.title } }
        : { ...node, position: { ...node.position }, data: { ...node.data } }),
      edges: mindEdges.map((item) => ({ ...item, style: { ...item.style } })),
    };
  }
  return {
    nodes: [{ id: "root", type: "mindNode", position: { x: 510, y: 330 }, data: { label: note?.title || "未命名笔记", tone: "root" } }],
    edges: [],
  };
};

function readMindState(note) {
  try {
    const storageKey = `mindflow-mindmap-v2-${note?.id || "default"}`;
    const saved = JSON.parse(localStorage.getItem(storageKey) || (note?.id === 1 ? localStorage.getItem("mindflow-mindmap") : "null") || "null");
    if (saved?.nodes?.length && Array.isArray(saved.edges)) return { ...saved, edges: stripEdgeMarkers(saved.edges) };
  } catch {
    // Keep the reference layout when saved data is incomplete.
  }
  return makeMindState(note);
}

function MindMapPage({ activeNoteId, onChangeNote, notify }) {
  const notes = readStoredNotes();
  const activeNote = notes.find((note) => note.id === activeNoteId) || notes[0];
  const startingState = useMemo(() => readMindState(activeNote), [activeNote?.id]);
  const [nodes, setNodes, onNodesChange] = useNodesState(startingState.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(startingState.edges);
  const [selectedId, setSelectedId] = useState("root");
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [canvasDragging, setCanvasDragging] = useState(false);
  const [mindFlowInstance, setMindFlowInstance] = useState(null);
  const selectedNode = nodes.find((node) => node.id === selectedId) || null;

  useEffect(() => {
    setEdges((current) => stripEdgeMarkers(current));
  }, [setEdges]);

  const renameNode = useCallback((id, label) => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, label } } : node));
  }, [setNodes]);

  const displayNodeCache = useRef(new Map());
  const displayNodes = useMemo(() => {
    const liveIds = new Set();
    const next = nodes.map((node) => {
      liveIds.add(node.id);
      const selected = node.id === selectedId;
      const cached = displayNodeCache.current.get(node.id);
      if (cached?.source === node && cached.selected === selected && cached.renameNode === renameNode) return cached.display;
      const display = { ...node, selected, data: { ...node.data, onRename: renameNode } };
      displayNodeCache.current.set(node.id, { source: node, selected, renameNode, display });
      return display;
    });
    displayNodeCache.current.forEach((_, id) => { if (!liveIds.has(id)) displayNodeCache.current.delete(id); });
    return next;
  }, [nodes, renameNode, selectedId]);

  useDebouncedCanvasPersistence(`mindflow-mindmap-v2-${activeNote?.id || "default"}`, nodes, edges, canvasDragging);

  const onConnect = useCallback((params) => setEdges((current) => addEdge({
    ...params,
    type: "bezier",
    style: { stroke: "#6f9691", strokeWidth: 1.8 },
  }, current)), [setEdges]);

  const createBranchAt = useCallback((parent, position, sourceSide) => {
    if (!parent) return;
    const id = `branch-${Date.now()}`;
    const tone = parent.data.tone === "root" ? "branch" : "leaf";
    const newNode = {
      id,
      type: "mindNode",
      position,
      data: { label: "新分支", tone },
    };
    const newEdge = mindEdge(
      `edge-${id}`,
      parent.id,
      id,
      "#8fa9a6",
      sourceSide,
      sourceSide === "right" ? "left" : "right",
    );
    setNodes((current) => [...current, newNode]);
    setEdges((current) => [...current, newEdge]);
    setSelectedId(id);
    setSelectedEdgeId(null);
    notify("已在落点添加分支，双击即可改名");
  }, [notify, setEdges, setNodes]);

  const onMindConnectEnd = useCallback((event, connectionState) => {
    if (!mindFlowInstance || connectionState?.isValid || connectionState?.toNode || !connectionState?.fromNode) return;
    const pointer = "changedTouches" in event ? event.changedTouches[0] : event;
    const flowPoint = mindFlowInstance.screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY });
    const parent = nodes.find((node) => node.id === connectionState.fromNode.id);
    if (!parent) return;
    const handleId = connectionState.fromHandle?.id || "";
    const sourceSide = handleId.endsWith("left")
      ? "left"
      : handleId.endsWith("right") ? "right" : flowPoint.x >= parent.position.x ? "right" : "left";
    createBranchAt(parent, { x: flowPoint.x - 59, y: flowPoint.y - 20 }, sourceSide);
  }, [createBranchAt, mindFlowInstance, nodes]);

  const addBranch = () => {
    const parent = selectedNode || nodes.find((node) => node.id === "root");
    if (!parent) return;
    const id = `branch-${Date.now()}`;
    const toRight = parent.position.x >= 510 || parent.id === "root";
    const tone = parent.data.tone === "root" ? "branch" : "leaf";
    const newNode = {
      id,
      type: "mindNode",
      position: {
        x: parent.position.x + (toRight ? 230 : -230),
        y: parent.position.y + 88,
      },
      data: { label: "新分支", tone },
    };
    const newEdge = mindEdge(
      `edge-${id}`,
      parent.id,
      id,
      "#8fa9a6",
      toRight ? "right" : "left",
      toRight ? "left" : "right",
    );
    setNodes((current) => [...current, newNode]);
    setEdges((current) => [...current, newEdge]);
    setSelectedId(id);
    setSelectedEdgeId(null);
    notify("已添加分支，双击节点即可改名");
  };

  const deleteSelected = useCallback(() => {
    if (selectedEdgeId) {
      setEdges((current) => current.filter((item) => item.id !== selectedEdgeId));
      setSelectedEdgeId(null);
      notify("分支连线已删除");
      return;
    }
    if (!selectedNode || selectedNode.id === "root") {
      notify("中心主题不能删除");
      return;
    }
    setNodes((current) => current.filter((node) => node.id !== selectedId));
    setEdges((current) => current.filter((item) => item.source !== selectedId && item.target !== selectedId));
    setSelectedId("root");
    notify("节点已删除");
  }, [notify, selectedEdgeId, selectedId, selectedNode, setEdges, setNodes]);

  useEffect(() => {
    const handleDelete = (event) => {
      if (event.key !== "Delete" || event.defaultPrevented || isTextEntryTarget(event.target)) return;
      if (!selectedEdgeId && !selectedNode) return;
      event.preventDefault();
      deleteSelected();
    };
    window.addEventListener("keydown", handleDelete);
    return () => window.removeEventListener("keydown", handleDelete);
  }, [deleteSelected, selectedEdgeId, selectedNode]);

  const organizeLayout = () => {
    setNodes((current) => arrangeMindMapNodes(current, edges));
    setSelectedEdgeId(null);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => mindFlowInstance?.fitView({ padding: 0.16, duration: 320 }));
    });
    notify("已整理当前分支");
  };

  const exportMindMap = () => {
    const cleanNodes = nodes.map(({ id, type, position, data }) => ({ id, type, position, data }));
    downloadFile(`${activeNote?.title || "未命名笔记"}-思维导图.json`, JSON.stringify({ title: activeNote?.title, nodes: cleanNodes, edges }, null, 2), "application/json");
    notify("思维导图已导出");
  };

  return (
    <section className="mindmap-page">
      <header className="workspace-header">
        <div className="workspace-title"><span className="section-kicker">思维导图</span><div><NoteSwitcher value={activeNote?.id} onChange={onChangeNote} /><span className="saved-state"><CheckCircle size={13} weight="fill" />自动保存</span></div></div>
        <div className="header-actions">
          <button className="ghost-button" onClick={addBranch}><Plus size={15} />添加分支</button>
          <button className="ghost-button" onClick={deleteSelected} disabled={!selectedEdgeId && (!selectedNode || selectedNode.id === "root")}><Trash size={15} />删除</button>
          <button className="ghost-button" onClick={organizeLayout}><ArrowCounterClockwise size={15} />整理布局</button>
          <button className="primary-button" onClick={exportMindMap}><Export size={15} />导出</button>
        </div>
      </header>
      <div className="mind-stage">
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onMindConnectEnd}
          onReconnect={(oldEdge, nextConnection) => setEdges((current) => reconnectEdge(oldEdge, nextConnection, current))}
          onInit={setMindFlowInstance}
          onNodeDragStart={() => setCanvasDragging(true)}
          onNodeDragStop={() => setCanvasDragging(false)}
          onNodeClick={(_, node) => { setSelectedId(node.id); setSelectedEdgeId(null); }}
          onEdgeClick={(_, selectedEdge) => { setSelectedEdgeId(selectedEdge.id); setSelectedId(null); }}
          onPaneClick={() => { setSelectedId(null); setSelectedEdgeId(null); }}
          onEdgeDoubleClick={(_, selectedEdge) => {
            setEdges((current) => current.filter((item) => item.id !== selectedEdge.id));
            setSelectedEdgeId(null);
            notify("连线已删除");
          }}
          isValidConnection={(connection) => connection.source !== connection.target}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          nodesDraggable
          nodesConnectable
          elementsSelectable
          edgesReconnectable
          reconnectRadius={22}
          connectionRadius={18}
          connectionLineType={ConnectionLineType.Bezier}
          connectionLineStyle={{ stroke: "var(--accent)", strokeWidth: 1.8 }}
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant="dots" gap={24} size={1} color="var(--canvas-dot)" />
          <Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>
        <div className="mind-edit-dock">
          <span>节点</span>
          <input
            value={selectedNode?.data.label || ""}
            onChange={(event) => selectedNode && renameNode(selectedNode.id, event.target.value)}
            placeholder="选择节点后修改名称"
            disabled={!selectedNode}
          />
        </div>
        <div className="mind-help">拖线添加分支 <i /> Delete 删除</div>
      </div>
    </section>
  );
}

const drawingColors = ["#26312f", "#3e817a", "#527b90", "#8d6b99", "#c56f5c", "#d39a42"];

const readDrawingStrokes = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("mindflow-drawing-v1") || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const paintDrawingStroke = (context, stroke, width, height) => {
  const points = stroke.points || [];
  if (!points.length) return;
  context.save();
  context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.size;
  context.lineCap = "round";
  context.lineJoin = "round";
  const pointAt = (point) => ({ x: point.x * width, y: point.y * height });
  const first = pointAt(points[0]);
  if (points.length === 1) {
    context.beginPath();
    context.arc(first.x, first.y, Math.max(1, stroke.size / 2), 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = pointAt(points[index]);
    const next = pointAt(points[index + 1]);
    context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
  }
  const last = pointAt(points[points.length - 1]);
  context.lineTo(last.x, last.y);
  context.stroke();
  context.restore();
};

function DrawingPage({ notify }) {
  const canvasRef = useRef(null);
  const sheetRef = useRef(null);
  const strokesRef = useRef([]);
  const activeStrokeRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState(drawingColors[1]);
  const [strokeSize, setStrokeSize] = useState(4);
  const [strokes, setStrokes] = useState(readDrawingStrokes);
  const [redoStack, setRedoStack] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveFormat, setSaveFormat] = useState("png");
  const [saving, setSaving] = useState(false);
  strokesRef.current = strokes;

  const renderCanvas = useCallback((extraStroke = null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const nextWidth = Math.round(rect.width * pixelRatio);
    const nextHeight = Math.round(rect.height * pixelRatio);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    const context = canvas.getContext("2d");
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    strokesRef.current.forEach((stroke) => paintDrawingStroke(context, stroke, rect.width, rect.height));
    if (extraStroke) paintDrawingStroke(context, extraStroke, rect.width, rect.height);
  }, []);

  const scheduleRender = useCallback(() => {
    if (animationFrameRef.current) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      renderCanvas(activeStrokeRef.current);
    });
  }, [renderCanvas]);

  useEffect(() => {
    const observer = new ResizeObserver(() => renderCanvas(activeStrokeRef.current));
    if (sheetRef.current) observer.observe(sheetRef.current);
    renderCanvas();
    return () => {
      observer.disconnect();
      if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current);
    };
  }, [renderCanvas]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem("mindflow-drawing-v1", JSON.stringify(strokes));
    }, 180);
    renderCanvas();
    return () => window.clearTimeout(timer);
  }, [renderCanvas, strokes]);

  const pointerPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const beginStroke = (event) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activeStrokeRef.current = {
      id: `stroke-${Date.now()}`,
      tool,
      color,
      size: tool === "eraser" ? Math.max(12, strokeSize * 3) : strokeSize,
      points: [pointerPoint(event)],
    };
    setDrawing(true);
    scheduleRender();
  };

  const continueStroke = (event) => {
    const activeStroke = activeStrokeRef.current;
    if (!activeStroke) return;
    const point = pointerPoint(event);
    const previous = activeStroke.points[activeStroke.points.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0012) return;
    activeStroke.points.push(point);
    scheduleRender();
  };

  const finishStroke = (event) => {
    const activeStroke = activeStrokeRef.current;
    if (!activeStroke) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activeStrokeRef.current = null;
    setStrokes((current) => [...current, activeStroke]);
    setRedoStack([]);
    setDrawing(false);
  };

  const undo = useCallback(() => {
    setStrokes((current) => {
      if (!current.length) return current;
      const removed = current[current.length - 1];
      setRedoStack((redo) => [removed, ...redo]);
      return current.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((current) => {
      if (!current.length) return current;
      const [restored, ...remaining] = current;
      setStrokes((items) => [...items, restored]);
      return remaining;
    });
  }, []);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || isTextEntryTarget(event.target)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [redo, undo]);

  const clearDrawing = () => {
    if (!strokes.length) return;
    setRedoStack(strokes);
    setStrokes([]);
    notify("画布已清空，可点击重做恢复");
  };

  const createDrawingBlob = (mimeType) => new Promise((resolve, reject) => {
    const output = document.createElement("canvas");
    output.width = 1800;
    output.height = 1125;
    const context = output.getContext("2d");
    strokes.forEach((stroke) => paintDrawingStroke(context, stroke, output.width, output.height));
    context.save();
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, output.width, output.height);
    context.restore();
    output.toBlob((blob) => blob ? resolve(blob) : reject(new Error("画图编码失败")), mimeType, mimeType === "image/jpeg" ? 0.92 : undefined);
  });

  const saveDrawing = async () => {
    setSaving(true);
    try {
      const isJpg = saveFormat === "jpg";
      const blob = await createDrawingBlob(isJpg ? "image/jpeg" : "image/png");
      const result = await saveBlobToUser(
        `MindFlow-画图-${new Date().toISOString().slice(0, 10)}.${saveFormat}`,
        blob,
        [{ name: isJpg ? "JPG 图片" : "PNG 图片", extensions: [saveFormat] }],
      );
      if (result?.saved) {
        setSaveDialogOpen(false);
        notify(`画图已另存为 ${saveFormat.toUpperCase()}`);
      }
    } catch {
      notify("画图另存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="drawing-page">
      <header className="workspace-header">
        <div className="workspace-title"><span className="section-kicker">画图</span><div><h1>随手画布</h1><span className="saved-state"><CheckCircle size={13} weight="fill" />本地保存</span></div></div>
        <div className="header-actions"><button className="ghost-button" onClick={clearDrawing} disabled={!strokes.length}><Trash size={15} />清空</button><button className="primary-button" onClick={() => setSaveDialogOpen(true)}><Export size={15} />另存为…</button></div>
      </header>
      <div className="drawing-workspace">
        <div className="drawing-toolbar" aria-label="画图工具栏">
          <div className="drawing-tool-switch" role="group" aria-label="绘图工具">
            <button className={tool === "pen" ? "active" : ""} onClick={() => setTool("pen")} aria-pressed={tool === "pen"}><PencilLine size={16} />画笔</button>
            <button className={tool === "eraser" ? "active" : ""} onClick={() => setTool("eraser")} aria-pressed={tool === "eraser"}><Eraser size={16} />橡皮</button>
          </div>
          <div className="drawing-colors" role="group" aria-label="画笔颜色">
            {drawingColors.map((item) => <button key={item} className={color === item && tool === "pen" ? "selected" : ""} style={{ "--swatch": item }} onClick={() => { setColor(item); setTool("pen"); }} aria-label={`选择颜色 ${item}`} />)}
          </div>
          <label className="drawing-size"><span>粗细</span><input type="range" min="2" max="18" step="1" value={strokeSize} onChange={(event) => setStrokeSize(Number(event.target.value))} /><b style={{ width: Math.max(5, strokeSize), height: Math.max(5, strokeSize) }} /></label>
          <div className="drawing-history"><button onClick={undo} disabled={!strokes.length} aria-label="撤销" title="撤销 Ctrl+Z"><ArrowCounterClockwise size={16} /></button><button onClick={redo} disabled={!redoStack.length} aria-label="重做" title="重做 Ctrl+Shift+Z"><ArrowClockwise size={16} /></button></div>
        </div>
        <div ref={sheetRef} className={`drawing-sheet ${tool === "eraser" ? "eraser-active" : ""}`}>
          <canvas ref={canvasRef} onPointerDown={beginStroke} onPointerMove={continueStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke} aria-label="绘图画布" />
          {!strokes.length && !drawing && <div className="drawing-empty"><PencilLine size={22} /><strong>在画布上拖动开始画图</strong><span>内容会自动保存在本机</span></div>}
          <div className="drawing-canvas-status"><span>{tool === "pen" ? "画笔" : "橡皮"}</span><i />{strokeSize}px</div>
        </div>
      </div>
      {saveDialogOpen && (
        <div className="save-as-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSaveDialogOpen(false); }}>
          <section className="save-as-dialog drawing-save-dialog" role="dialog" aria-modal="true" aria-labelledby="drawing-save-title">
            <header><div><span className="section-kicker">导出画图</span><h2 id="drawing-save-title">另存为</h2></div><button className="icon-button" onClick={() => setSaveDialogOpen(false)} disabled={saving} aria-label="关闭"><X size={16} /></button></header>
            <div className="save-as-file"><span>MindFlow-画图-{new Date().toISOString().slice(0, 10)}</span><b>.{saveFormat}</b></div>
            <div className="save-as-formats" role="radiogroup" aria-label="文件格式">
              {[{ id: "png", label: "PNG", description: "无损保存，适合继续处理" }, { id: "jpg", label: "JPG", description: "文件更小，适合快速分享" }].map((item) => <button key={item.id} className={saveFormat === item.id ? "selected" : ""} role="radio" aria-checked={saveFormat === item.id} onClick={() => setSaveFormat(item.id)}><span>{item.label}</span><small>{item.description}</small><CheckCircle size={16} weight="fill" /></button>)}
            </div>
            <footer><span>下一步可选择文件名和保存位置</span><button className="primary-button" onClick={saveDrawing} disabled={saving}>{saving ? "正在生成…" : "选择位置并保存"}</button></footer>
          </section>
        </div>
      )}
    </section>
  );
}

const repeatOptions = [
  { value: "once", label: "仅一次" },
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "custom", label: "自定义" },
];

const createTaskDraft = (task, startDate = dateKeyFromDate()) => {
  if (task) return normalizeTask(task);
  return { ...normalizeTask({
    id: Date.now(),
    title: "新任务",
    details: "",
    startDate,
    repeatType: "once",
    weekdays: [parseDateKey(startDate)?.getDay() ?? 1],
    interval: 2,
    intervalUnit: "day",
    reminderEnabled: true,
    reminderTime: "09:00",
    noteId: "",
    completedDates: [],
  }), title: "" };
};

function TaskEditorDialog({ task, defaultDate, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => createTaskDraft(task, defaultDate));
  const notes = readStoredNotes();
  const update = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const toggleWeekday = (day) => {
    setDraft((current) => {
      const selected = current.weekdays.includes(day);
      if (selected && current.weekdays.length === 1) return current;
      return { ...current, weekdays: selected ? current.weekdays.filter((item) => item !== day) : [...current.weekdays, day] };
    });
  };
  const submit = (event) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    onSave(normalizeTask({ ...draft, title }));
  };
  const showWeekdays = draft.repeatType === "weekly" || (draft.repeatType === "custom" && draft.intervalUnit === "week");
  return (
    <div className="save-as-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="task-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="task-editor-title" onSubmit={submit}>
        <header>
          <div><span className="section-kicker">任务设置</span><h2 id="task-editor-title">{task ? "编辑任务" : "新建任务"}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={16} /></button>
        </header>
        <div className="task-editor-body">
          <label className="task-title-field">任务名称<input autoFocus value={draft.title} onChange={(event) => update({ title: event.target.value })} placeholder="例如：整理本周项目计划" required /></label>
          <label>说明<textarea value={draft.details} onChange={(event) => update({ details: event.target.value })} placeholder="补充任务范围、步骤或需要准备的内容" /></label>
          <div className="task-form-grid">
            <label>开始日期<input type="date" value={draft.startDate} onChange={(event) => update({ startDate: event.target.value })} required /></label>
            <label>重复<SelectMenu label="任务重复方式" value={draft.repeatType} onChange={(value) => update({ repeatType: value })} options={repeatOptions} /></label>
          </div>
          {draft.repeatType === "custom" && (
            <div className="task-custom-repeat">
              <span>间隔</span>
              <div><span>每</span><input type="number" min="1" max="99" value={draft.interval} onChange={(event) => update({ interval: Math.max(1, Number(event.target.value) || 1) })} /><SelectMenu label="重复间隔单位" value={draft.intervalUnit} onChange={(value) => update({ intervalUnit: value })} options={[{ value: "day", label: "天" }, { value: "week", label: "周" }]} /></div>
            </div>
          )}
          {showWeekdays && (
            <div className="task-weekdays">
              <span>重复日期</span>
              <div role="group" aria-label="选择每周重复日期">
                {weekdayOptions.map((item) => <button key={item.value} type="button" className={draft.weekdays.includes(item.value) ? "selected" : ""} aria-pressed={draft.weekdays.includes(item.value)} onClick={() => toggleWeekday(item.value)}>{item.label}</button>)}
              </div>
            </div>
          )}
          <div className="task-reminder-setting">
            <label className="toggle-line"><span><strong>任务提醒</strong><small>在任务发生当天发送本地通知</small></span><input type="checkbox" checked={draft.reminderEnabled} onChange={(event) => update({ reminderEnabled: event.target.checked })} /></label>
            {draft.reminderEnabled && <label className="task-reminder-time"><span>提醒时间</span><input type="time" value={draft.reminderTime} onChange={(event) => update({ reminderTime: event.target.value })} required /></label>}
          </div>
          <label>关联笔记<SelectMenu label="关联笔记" value={draft.noteId} onChange={(value) => update({ noteId: value })} options={[{ value: "", label: "不关联笔记" }, ...notes.map((note) => ({ value: note.id, label: note.title || "未命名笔记" }))]} /></label>
          <p className="task-editor-hint"><Info size={14} />完成周期任务只会勾选当前日期，之后的任务仍会按计划出现。</p>
        </div>
        <footer>
          <div>{task && <button className="danger-text" type="button" onClick={() => onDelete(task.id)}>删除任务</button>}</div>
          <div><button className="ghost-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存任务</button></div>
        </footer>
      </form>
    </div>
  );
}

function TasksPage({ notify, onOpenNote }) {
  const [tasks, setTasks] = useState(readStoredTasks);
  const [filter, setFilter] = useState("today");
  const [editorState, setEditorState] = useState(null);
  const today = dateKeyFromDate();
  useEffect(() => {
    const serialized = JSON.stringify(tasks.map(normalizeTask));
    if (localStorage.getItem(TASKS_STORAGE_KEY) === serialized) return;
    persistStoredTasks(tasks);
  }, [tasks]);
  useEffect(() => {
    const syncTasks = () => {
      const incoming = readStoredTasks();
      setTasks((current) => JSON.stringify(current) === JSON.stringify(incoming) ? current : incoming);
    };
    const handleStorage = (event) => {
      if (!event.key || event.key === TASKS_STORAGE_KEY) syncTasks();
    };
    const unsubscribe = window.mindflow?.onTasksUpdated?.(syncTasks);
    window.addEventListener("storage", handleStorage);
    return () => {
      unsubscribe?.();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const todayOccurrences = useMemo(() => createTaskOccurrences(tasks, today, 1), [tasks, today]);
  const displayed = useMemo(() => {
    if (filter === "today") {
      const overdue = tasks
        .filter((task) => task.repeatType === "once" && task.startDate < today && !task.completedDates.includes(task.startDate))
        .map((task) => ({ task, occurrenceDate: task.startDate, overdue: true }));
      return [...overdue, ...createTaskOccurrences(tasks, today, 1)];
    }
    if (filter === "week") return createTaskOccurrences(tasks, today, 7);
    if (filter === "completed") {
      return tasks.flatMap((task) => task.completedDates.map((occurrenceDate) => ({ task, occurrenceDate, completedArchive: true })))
        .sort((a, b) => b.occurrenceDate.localeCompare(a.occurrenceDate));
    }
    return tasks.map((task) => ({ task, occurrenceDate: task.repeatType === "once" ? task.startDate : findNextTaskOccurrence(task, today) }));
  }, [filter, tasks, today]);

  const grouped = useMemo(() => displayed.reduce((groups, item) => {
    const key = item.occurrenceDate;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {}), [displayed]);
  const groupKeys = Object.keys(grouped).sort((a, b) => filter === "completed" ? b.localeCompare(a) : a.localeCompare(b));
  const completedToday = todayOccurrences.filter(({ task, occurrenceDate }) => task.completedDates.includes(occurrenceDate)).length;
  const filterItems = [
    { id: "today", label: "今天", icon: CalendarCheck, count: displayed.length && filter === "today" ? displayed.length : todayOccurrences.length },
    { id: "week", label: "未来 7 天", icon: CalendarBlank },
    { id: "all", label: "全部任务", icon: CheckSquare, count: tasks.length },
    { id: "completed", label: "已完成", icon: CheckCircle },
  ];
  const filterCopy = {
    today: ["今天", "处理今天到期和已经逾期的任务"],
    week: ["未来 7 天", "查看接下来一周的任务安排"],
    all: ["全部任务", "管理一次性和周期任务"],
    completed: ["已完成", "查看每次完成记录"],
  }[filter];

  const toggleComplete = (taskId, occurrenceDate) => {
    setTasks((current) => current.map((task) => {
      if (task.id !== taskId) return task;
      const completed = task.completedDates.includes(occurrenceDate);
      return { ...task, completedDates: completed ? task.completedDates.filter((date) => date !== occurrenceDate) : [...task.completedDates, occurrenceDate] };
    }));
    notify("任务状态已更新");
  };
  const saveTask = (nextTask) => {
    setTasks((current) => current.some((task) => task.id === nextTask.id)
      ? current.map((task) => task.id === nextTask.id ? nextTask : task)
      : [nextTask, ...current]);
    setEditorState(null);
    notify(editorState?.task ? "任务已更新" : "任务已创建");
  };
  const deleteTask = (taskId) => {
    if (!window.confirm("确定删除这个任务吗？完成记录也会一起删除。")) return;
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setEditorState(null);
    notify("任务已删除");
  };

  useEffect(() => {
    const handleDelete = (event) => {
      if (event.key !== "Delete" || event.defaultPrevented || isTextEntryTarget(event.target)) return;
      const row = event.target.closest?.(".task-row");
      const taskId = Number(row?.dataset.taskId);
      if (!row || !taskId) return;
      event.preventDefault();
      deleteTask(taskId);
    };
    window.addEventListener("keydown", handleDelete);
    return () => window.removeEventListener("keydown", handleDelete);
  }, [tasks]);

  return (
    <section className="tasks-page">
      <header className="workspace-header task-workspace-header">
        <div className="workspace-title"><span className="eyebrow">计划</span><h1>任务</h1></div>
        <div className="task-header-actions"><span className="task-today-progress"><CheckCircle size={14} weight={completedToday ? "fill" : "regular"} />今天 {completedToday}/{todayOccurrences.length}</span><button className="primary-button" onClick={() => setEditorState({ task: null, date: today })}><Plus size={15} />新建任务</button></div>
      </header>
      <div className="tasks-body">
        <aside className="task-filter-pane">
          <div className="task-today-card"><span>{weekdayName(today)}</span><strong>{parseDateKey(today)?.getDate()}</strong><small>{parseDateKey(today)?.getFullYear()}年{parseDateKey(today)?.getMonth() + 1}月</small></div>
          <nav aria-label="任务筛选">
            {filterItems.map(({ id, label, icon: Icon, count }) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}><Icon size={17} weight={filter === id ? "fill" : "regular"} /><span>{label}</span>{Number.isFinite(count) && <small>{count}</small>}</button>)}
          </nav>
        </aside>
        <main className="task-content">
          <header><div><h2>{filterCopy[0]}</h2><p>{filterCopy[1]}</p></div>{filter !== "completed" && <button className="ghost-button" onClick={() => setEditorState({ task: null, date: filter === "week" ? shiftDateKey(today, 1) : today })}><Plus size={14} />添加</button>}</header>
          <div className="task-list">
            {groupKeys.map((dateKey) => (
              <section className="task-date-group" key={dateKey}>
                <header><span>{dateKey === today ? "今天" : formatCalendarDate(dateKey)}</span><small>{weekdayName(dateKey)}</small></header>
                <div className="task-group-surface">
                  {grouped[dateKey].map(({ task, occurrenceDate, overdue }) => {
                    const completed = task.completedDates.includes(occurrenceDate);
                    const note = task.noteId ? readStoredNotes().find((item) => item.id === task.noteId) : null;
                    return (
                      <article key={`${task.id}-${occurrenceDate}`} data-task-id={task.id} tabIndex={0} className={`task-row${completed ? " completed" : ""}`} onClick={() => setEditorState({ task, date: occurrenceDate })} onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === "Enter") setEditorState({ task, date: occurrenceDate }); }}>
                        <button className="task-check" type="button" aria-label={completed ? "标记为未完成" : "标记为已完成"} aria-pressed={completed} onClick={(event) => { event.stopPropagation(); toggleComplete(task.id, occurrenceDate); }}>{completed ? <CheckCircle size={22} weight="fill" /> : <Circle size={22} />}</button>
                        <div className="task-row-copy"><strong>{task.title}</strong>{task.details && <p>{task.details}</p>}<div className="task-row-meta">{overdue && <span className="task-overdue">已逾期</span>}<span><Repeat size={12} />{taskRepeatLabel(task)}</span>{task.reminderEnabled && <span><Bell size={12} />{task.reminderTime}</span>}{note && <button type="button" onClick={(event) => { event.stopPropagation(); onOpenNote(note.id); }}><NotePencil size={12} />{note.title}</button>}</div></div>
                        <div className="task-row-side"><span>{task.reminderEnabled ? task.reminderTime : formatCalendarDate(occurrenceDate)}</span><button type="button" aria-label="编辑任务" onClick={(event) => { event.stopPropagation(); setEditorState({ task, date: occurrenceDate }); }}><DotsThree size={18} /></button></div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
            {!groupKeys.length && <div className="task-empty"><CheckSquare size={25} weight="duotone" /><strong>{filter === "completed" ? "还没有完成记录" : "这里还没有任务"}</strong><span>{filter === "completed" ? "完成任务后会按日期保留记录" : "创建一个任务，安排日期、周期和提醒"}</span>{filter !== "completed" && <button className="primary-button" onClick={() => setEditorState({ task: null, date: today })}><Plus size={14} />新建任务</button>}</div>}
          </div>
        </main>
      </div>
      {editorState && <TaskEditorDialog key={editorState.task?.id || `new-${editorState.date}`} task={editorState.task} defaultDate={editorState.date} onClose={() => setEditorState(null)} onSave={saveTask} onDelete={deleteTask} />}
    </section>
  );
}

const defaultSettings = {
  defaultOpen: "notes",
  fontSize: "14",
  density: "comfortable",
  reduceMotion: false,
  theme: "mist",
};

const themeOptions = [
  { id: "system", name: "跟随系统", description: "自动匹配 Windows 明暗外观", preview: ["#e9eeec", "#242a28", "#4f8d87"] },
  { id: "mist", name: "雾白", description: "冷白表面与低饱和青绿", preview: ["#eef0ef", "#ffffff", "#3e817a"] },
  { id: "cream", name: "米白", description: "亚麻纸般柔和的暖白表面", preview: ["#f1eee5", "#fcfaf4", "#7b8064"] },
  { id: "parchment", name: "古朴淡黄", description: "旧书纸色与沉静茶褐", preview: ["#e8dfc6", "#f5eedb", "#8b6f45"] },
  { id: "glacier", name: "冰川", description: "冷银表面与沉静钢蓝", preview: ["#e8edf2", "#fbfcfd", "#4d7898"] },
  { id: "sage", name: "鼠尾草", description: "柔和灰绿与森林强调", preview: ["#e7ede7", "#fbfdf9", "#5d8065"] },
  { id: "rose", name: "灰粉", description: "冷调粉灰与干枯玫瑰", preview: ["#f0e9eb", "#fdfafb", "#9b6879"] },
  { id: "midnight", name: "深海", description: "深海军蓝与雾蓝高光", preview: ["#111922", "#1b2731", "#73a7c6"] },
  { id: "graphite", name: "夜墨", description: "深石墨表面与清晰青绿", preview: ["#171b1a", "#202625", "#67a9a2"] },
];

const validThemeIds = new Set(themeOptions.map((theme) => theme.id));
const migratedThemeIds = { salt: "glacier", yolk: "parchment" };

const readSettings = () => {
  try {
    const stored = { ...defaultSettings, ...JSON.parse(localStorage.getItem("mindflow-settings") || "{}") };
    const migratedTheme = migratedThemeIds[stored.theme] || stored.theme;
    return { ...stored, theme: validThemeIds.has(migratedTheme) ? migratedTheme : defaultSettings.theme };
  } catch {
    return defaultSettings;
  }
};

const defaultWidgetSettings = {
  overdueEnabled: true,
  nudgeTime: "18:00",
  alwaysOnTop: false,
  showTomorrow: true,
};

const readWidgetSettings = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(WIDGET_SETTINGS_STORAGE_KEY) || "{}");
    return {
      ...defaultWidgetSettings,
      ...stored,
      nudgeTime: /^\d{2}:\d{2}$/.test(stored.nudgeTime || "") ? stored.nudgeTime : defaultWidgetSettings.nudgeTime,
    };
  } catch {
    return defaultWidgetSettings;
  }
};

const persistWidgetSettings = (settings) => {
  const next = { ...defaultWidgetSettings, ...settings };
  localStorage.setItem(WIDGET_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("mindflow-widget-settings-change", { detail: next }));
  window.mindflow?.broadcastWidgetSettingsChanged?.();
  return next;
};

const readWidgetAlertDismissals = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(WIDGET_ALERT_STORAGE_KEY) || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
};

function WidgetTaskRow({ item, onToggle }) {
  const { task, occurrenceDate, overdue } = item;
  const completed = task.completedDates.includes(occurrenceDate);
  return (
    <article className={`widget-task-row${completed ? " completed" : ""}${overdue ? " overdue" : ""}`}>
      <button type="button" className="widget-task-check" aria-label={completed ? `恢复任务：${task.title}` : `完成任务：${task.title}`} aria-pressed={completed} onClick={() => onToggle(task.id, occurrenceDate)}>
        {completed ? <CheckCircle size={20} weight="fill" /> : <Circle size={20} />}
      </button>
      <div className="widget-task-copy">
        <strong>{task.title}</strong>
        <span>{overdue ? "已逾期" : task.reminderEnabled ? `提醒 ${task.reminderTime}` : taskRepeatLabel(task)}</span>
      </div>
    </article>
  );
}

function TaskWidget() {
  const [tasks, setTasks] = useState(readStoredTasks);
  const [widgetSettings, setWidgetSettings] = useState(readWidgetSettings);
  const [appearance, setAppearance] = useState(readSettings);
  const [alertState, setAlertState] = useState(null);
  const [compact, setCompact] = useState(() => Boolean(window.mindflow?.widgetInitialState?.compact));
  const alertSignatureRef = useRef("");
  const today = dateKeyFromDate();
  const tomorrow = shiftDateKey(today, 1);

  useEffect(() => {
    document.documentElement.classList.add("mindflow-widget-document");
    document.body.classList.add("mindflow-widget-document");
    return () => {
      document.documentElement.classList.remove("mindflow-widget-document");
      document.body.classList.remove("mindflow-widget-document");
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    window.mindflow?.getWidgetWindowState?.().then((state) => {
      if (!disposed) setCompact(Boolean(state?.compact));
    }).catch(() => {});
    const unsubscribe = window.mindflow?.onWidgetCompactUpdated?.((value) => setCompact(Boolean(value)));
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const syncTasks = () => setTasks(readStoredTasks());
    const syncAppearance = () => setAppearance(readSettings());
    const syncWidgetSettings = () => setWidgetSettings(readWidgetSettings());
    const handleStorage = (event) => {
      if (!event.key || event.key === TASKS_STORAGE_KEY) syncTasks();
      if (!event.key || event.key === "mindflow-settings") syncAppearance();
      if (!event.key || event.key === WIDGET_SETTINGS_STORAGE_KEY) syncWidgetSettings();
    };
    const unsubscribeTasks = window.mindflow?.onTasksUpdated?.(syncTasks);
    const unsubscribeSettings = window.mindflow?.onSettingsUpdated?.(syncAppearance);
    const unsubscribeWidget = window.mindflow?.onWidgetSettingsUpdated?.(syncWidgetSettings);
    window.addEventListener("storage", handleStorage);
    return () => {
      unsubscribeTasks?.();
      unsubscribeSettings?.();
      unsubscribeWidget?.();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const todayItems = useMemo(() => {
    const overdue = tasks
      .filter((task) => task.repeatType === "once" && task.startDate < today && !task.completedDates.includes(task.startDate))
      .map((task) => ({ task, occurrenceDate: task.startDate, overdue: true }));
    return [...overdue, ...createTaskOccurrences(tasks, today, 1)];
  }, [tasks, today]);
  const tomorrowItems = useMemo(() => createTaskOccurrences(tasks, tomorrow, 1), [tasks, tomorrow]);
  const completedToday = todayItems.filter(({ task, occurrenceDate }) => task.completedDates.includes(occurrenceDate)).length;

  useEffect(() => {
    const checkScheduledReminders = () => {
      const now = new Date();
      const currentDate = dateKeyFromDate(now);
      let notified = {};
      try {
        notified = JSON.parse(localStorage.getItem(NOTIFIED_STORAGE_KEY) || "{}") || {};
      } catch {
        notified = {};
      }
      const send = (key, title, body, dueAt) => {
        const lateness = now.getTime() - dueAt.getTime();
        if (lateness < 0 || lateness > 5 * 60 * 1000 || notified[key]) return;
        window.mindflow?.showNotification?.({ title, body });
        notified[key] = now.toISOString();
      };
      readStoredNotes().forEach((note) => {
        const reminder = parseReminderValue(note.reminder);
        if (reminder) send(`note:${note.id}:${note.reminder}`, "MindFlow 笔记提醒", note.title || "未命名笔记", reminder.date);
      });
      readStoredTasks().forEach((task) => {
        if (!task.reminderEnabled || !isTaskDueOn(task, currentDate) || task.completedDates.includes(currentDate)) return;
        const reminder = parseReminderValue(`${currentDate}T${task.reminderTime}:00`);
        if (reminder) send(`task:${task.id}:${currentDate}:${task.reminderTime}`, "MindFlow 任务提醒", task.title || "未命名任务", reminder.date);
      });
      const cutoff = now.getTime() - 14 * 86400000;
      localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(Object.fromEntries(Object.entries(notified).filter(([, value]) => new Date(value).getTime() >= cutoff))));
    };
    const initialTimer = window.setTimeout(checkScheduledReminders, 900);
    const interval = window.setInterval(checkScheduledReminders, 20000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const checkForUnfinishedTasks = () => {
      if (!widgetSettings.overdueEnabled) {
        if (alertSignatureRef.current) window.mindflow?.ackWidgetAlert?.(widgetSettings.alwaysOnTop);
        alertSignatureRef.current = "";
        setAlertState(null);
        return;
      }
      const now = new Date();
      const currentTime = `${padNumber(now.getHours())}:${padNumber(now.getMinutes())}`;
      if (dateKeyFromDate(now) !== today || currentTime < widgetSettings.nudgeTime) return;
      const unfinished = todayItems.filter(({ task, occurrenceDate }) => !task.completedDates.includes(occurrenceDate));
      if (!unfinished.length) {
        if (alertSignatureRef.current) window.mindflow?.ackWidgetAlert?.(widgetSettings.alwaysOnTop);
        alertSignatureRef.current = "";
        setAlertState(null);
        return;
      }
      const signature = unfinished.map(({ task, occurrenceDate }) => `${task.id}:${occurrenceDate}`).sort().join("|");
      if (readWidgetAlertDismissals()[today] === signature || alertSignatureRef.current === signature) return;
      alertSignatureRef.current = signature;
      setAlertState({ items: unfinished, signature });
      window.mindflow?.showWidgetAlert?.({ count: unfinished.length, title: unfinished[0].task.title });
    };
    const initialTimer = window.setTimeout(checkForUnfinishedTasks, 650);
    const interval = window.setInterval(checkForUnfinishedTasks, 15000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [tasks, today, todayItems, widgetSettings.alwaysOnTop, widgetSettings.nudgeTime, widgetSettings.overdueEnabled]);

  const toggleTask = (taskId, occurrenceDate) => {
    const next = readStoredTasks().map((task) => {
      if (task.id !== taskId) return task;
      const completed = task.completedDates.includes(occurrenceDate);
      return { ...task, completedDates: completed ? task.completedDates.filter((date) => date !== occurrenceDate) : [...task.completedDates, occurrenceDate] };
    });
    setTasks(persistStoredTasks(next));
  };

  const updateWidgetSetting = (key, value) => {
    const next = persistWidgetSettings({ ...widgetSettings, [key]: value });
    setWidgetSettings(next);
    if (key === "alwaysOnTop") window.mindflow?.setWidgetAlwaysOnTop?.(value);
  };

  const toggleCompact = async () => {
    if (!window.mindflow?.setWidgetCompact) {
      setCompact((current) => !current);
      return;
    }
    const result = await window.mindflow.setWidgetCompact(!compact);
    setCompact(Boolean(result?.compact));
  };

  const acknowledgeAlert = () => {
    if (!alertState) return;
    const saved = readWidgetAlertDismissals();
    saved[today] = alertState.signature;
    const recentEntries = Object.entries(saved).sort(([a], [b]) => b.localeCompare(a)).slice(0, 14);
    localStorage.setItem(WIDGET_ALERT_STORAGE_KEY, JSON.stringify(Object.fromEntries(recentEntries)));
    alertSignatureRef.current = "";
    setAlertState(null);
    window.mindflow?.ackWidgetAlert?.(widgetSettings.alwaysOnTop);
  };

  const alertMessage = alertState?.items.length === 1
    ? `您今日“${alertState.items[0].task.title}”任务未完成，请查看。`
    : `您今日还有 ${alertState?.items.length || 0} 项任务未完成，请查看。`;

  return (
    <div className={`task-widget-shell app-shell theme-${appearance.theme || "mist"}${compact ? " compact" : ""} ${appearance.reduceMotion ? "reduce-motion" : ""}`}>
      <section className="task-widget-surface" aria-label="MindFlow 今日任务挂件">
        <header className="task-widget-header">
          <div className="task-widget-brand"><img src={mindFlowAppIcon} alt="" /><span><strong>今日任务</strong><small>{formatCalendarDate(today, true)}</small></span></div>
          <div className="task-widget-actions">
            {!compact && <button type="button" className={widgetSettings.alwaysOnTop ? "active" : ""} aria-label={widgetSettings.alwaysOnTop ? "取消置顶" : "窗口置顶"} title={widgetSettings.alwaysOnTop ? "取消置顶" : "窗口置顶"} onClick={() => updateWidgetSetting("alwaysOnTop", !widgetSettings.alwaysOnTop)}><PushPinSimple size={16} weight={widgetSettings.alwaysOnTop ? "fill" : "regular"} /></button>}
            {!compact && <button type="button" aria-label="打开 MindFlow 任务页" title="打开 MindFlow" onClick={() => window.mindflow?.openMain?.("tasks")}><ArrowSquareOut size={16} /></button>}
            <button type="button" aria-label={compact ? "展开任务挂件" : "收起任务挂件"} title={compact ? "展开" : "收起"} onClick={toggleCompact}>{compact ? <CornersOut size={16} /> : <CornersIn size={16} />}</button>
            <button type="button" aria-label="隐藏任务挂件" title="隐藏" onClick={() => window.mindflow?.hideWidget?.()}><X size={16} /></button>
          </div>
        </header>

        <div className="task-widget-progress"><span><b>{completedToday}</b> / {todayItems.length} 已完成</span><i><b style={{ width: `${todayItems.length ? (completedToday / todayItems.length) * 100 : 0}%` }} /></i></div>

        <div className="task-widget-scroll">
          <section className="widget-day-section">
            <header><span>今天</span><small>{todayItems.length ? `${todayItems.length} 项` : "已清空"}</small></header>
            <div className="widget-task-list">
              {todayItems.map((item) => <WidgetTaskRow key={`${item.task.id}-${item.occurrenceDate}`} item={item} onToggle={toggleTask} />)}
              {!todayItems.length && <div className="widget-empty"><CheckCircle size={22} weight="duotone" /><strong>今天没有待办</strong><span>可以安心处理手头的事</span></div>}
            </div>
          </section>
          {widgetSettings.showTomorrow && (
            <section className="widget-day-section widget-tomorrow-section">
              <header><span>明天</span><small>{tomorrowItems.length ? `${tomorrowItems.length} 项` : "暂无安排"}</small></header>
              <div className="widget-task-list">
                {tomorrowItems.map((item) => <WidgetTaskRow key={`${item.task.id}-${item.occurrenceDate}`} item={item} onToggle={toggleTask} />)}
                {!tomorrowItems.length && <div className="widget-empty compact"><span>还没有明日任务</span></div>}
              </div>
            </section>
          )}
        </div>

        <footer className="task-widget-footer">
          <span><Bell size={13} />{widgetSettings.overdueEnabled ? `${widgetSettings.nudgeTime} 检查未完成任务` : "未完成提醒已关闭"}</span>
          <button type="button" onClick={() => window.mindflow?.openMain?.("tasks")}>管理任务</button>
        </footer>

        {alertState && (
          <div className="task-widget-alert" role="alertdialog" aria-modal="true" aria-labelledby="widget-alert-title">
            <div className="task-widget-alert-icon"><Bell size={23} weight="fill" /></div>
            <span>任务提醒</span>
            <h2 id="widget-alert-title">还有任务没有完成</h2>
            <p>{alertMessage}</p>
            <button type="button" onClick={acknowledgeAlert}>查看今日任务</button>
            <small>此提示会保留到你点击查看</small>
          </div>
        )}
      </section>
    </div>
  );
}

function SettingsPage({ notify }) {
  const [active, setActive] = useState("general");
  const [settings, setSettings] = useState(readSettings);
  const [widgetSettings, setWidgetSettings] = useState(readWidgetSettings);
  const [loginAtStartup, setLoginAtStartup] = useState(false);
  const [loginSettingBusy, setLoginSettingBusy] = useState(false);
  const items = [{ id: "general", label: "通用", icon: GearSix }, { id: "widget", label: "任务挂件", icon: SquaresFour }, { id: "appearance", label: "外观", icon: Palette }, { id: "data", label: "数据", icon: Database }, { id: "about", label: "关于", icon: Info }];
  const label = items.find((item) => item.id === active)?.label;
  useEffect(() => {
    let disposed = false;
    window.mindflow?.getLoginItemSettings?.().then((result) => {
      if (!disposed) setLoginAtStartup(Boolean(result?.openAtLogin));
    }).catch(() => {});
    return () => { disposed = true; };
  }, []);
  const updateSetting = (key, value) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      localStorage.setItem("mindflow-settings", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("mindflow-settings-change", { detail: next }));
      window.mindflow?.broadcastSettingsChanged?.();
      return next;
    });
    notify("设置已保存");
  };
  const updateWidgetSetting = (key, value) => {
    const next = persistWidgetSettings({ ...widgetSettings, [key]: value });
    setWidgetSettings(next);
    if (key === "alwaysOnTop") window.mindflow?.setWidgetAlwaysOnTop?.(value);
    notify("挂件设置已保存");
  };
  const updateLoginAtStartup = async (enabled) => {
    if (!window.mindflow?.setLoginItemSettings) return;
    setLoginSettingBusy(true);
    try {
      const result = await window.mindflow.setLoginItemSettings(enabled);
      setLoginAtStartup(Boolean(result?.openAtLogin));
      notify(result?.openAtLogin ? "开机启动任务挂件已开启" : "开机启动已关闭");
    } catch {
      notify("开机启动设置失败");
    } finally {
      setLoginSettingBusy(false);
    }
  };
  const exportAllData = () => {
    const storage = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key) storage[key] = localStorage.getItem(key);
    }
    downloadFile(`MindFlow-备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "MindFlow", version: "1.6.0", exportedAt: new Date().toISOString(), storage }, null, 2), "application/json");
    notify("全部本地数据已导出");
  };
  const clearAllData = () => {
    if (!window.confirm("确定清除所有笔记、任务、工作流、思维导图和设置吗？此操作无法撤销。")) return;
    localStorage.clear();
    window.location.reload();
  };
  const content = {
    general: <><section><h3>保存</h3><div className="setting-row"><label>自动保存<small>笔记、任务、画图和节点内容会即时保存到本机</small></label><span className="setting-status"><CheckCircle size={14} weight="fill" />已启用</span></div></section><section><h3>打开方式</h3><div className="setting-row"><label>启动后默认打开</label><SelectMenu label="启动后默认打开" value={settings.defaultOpen} onChange={(value) => updateSetting("defaultOpen", value)} options={[{ value: "notes", label: "笔记" }, { value: "tasks", label: "任务" }, { value: "drawing", label: "画图" }, { value: "workflow", label: "工作流" }, { value: "mindmap", label: "思维导图" }]} /></div><div className="setting-row"><label>笔记字号</label><SelectMenu label="笔记字号" value={settings.fontSize} onChange={(value) => updateSetting("fontSize", value)} options={[{ value: "13", label: "小 · 13px" }, { value: "14", label: "标准 · 14px" }, { value: "15", label: "大 · 15px" }]} /></div></section></>,
    widget: <>
      <section className="widget-settings-intro">
        <div className="widget-settings-preview" aria-hidden="true"><span><img src={mindFlowAppIcon} alt="" /><b>今日任务</b><small>2 / 4</small></span><i /><i /><i /></div>
        <div><h3>桌面任务挂件</h3><p>无需打开完整软件，也能查看今天和明天的安排、完成任务并接收未完成提示。</p><button className="primary-button" type="button" onClick={() => window.mindflow?.showWidget?.()}><SquaresFour size={15} />显示任务挂件</button></div>
      </section>
      <section><h3>启动与窗口</h3><div className="setting-row"><label>开机启动任务挂件<small>登录 Windows 后只显示挂件，不打开 MindFlow 主窗口</small></label><input type="checkbox" checked={loginAtStartup} disabled={loginSettingBusy || !window.mindflow?.setLoginItemSettings} onChange={(event) => updateLoginAtStartup(event.target.checked)} /></div><div className="setting-row"><label>窗口置顶<small>让任务挂件保持在其他窗口上方</small></label><input type="checkbox" checked={widgetSettings.alwaysOnTop} onChange={(event) => updateWidgetSetting("alwaysOnTop", event.target.checked)} /></div><div className="setting-row"><label>显示明日任务<small>在今日列表下方预览下一天安排</small></label><input type="checkbox" checked={widgetSettings.showTomorrow} onChange={(event) => updateWidgetSetting("showTomorrow", event.target.checked)} /></div></section>
      <section><h3>未完成提醒</h3><div className="setting-row"><label>持续提醒<small>到达设定时间后，未完成提示会保留到你点击查看</small></label><input type="checkbox" checked={widgetSettings.overdueEnabled} onChange={(event) => updateWidgetSetting("overdueEnabled", event.target.checked)} /></div><div className={`setting-row widget-time-setting${widgetSettings.overdueEnabled ? "" : " disabled"}`}><label>检查时间<small>每天在这个时间检查今日未完成任务</small></label><input type="time" value={widgetSettings.nudgeTime} disabled={!widgetSettings.overdueEnabled} onChange={(event) => updateWidgetSetting("nudgeTime", event.target.value)} /></div></section>
    </>,
    appearance: <>
      <section className="theme-setting-section">
        <h3>界面主题</h3>
        <div className="theme-options" role="radiogroup" aria-label="界面主题">
          {themeOptions.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`theme-option ${settings.theme === theme.id ? "selected" : ""}`}
              role="radio"
              aria-checked={settings.theme === theme.id}
              onClick={() => updateSetting("theme", theme.id)}
            >
              <span
                className={`theme-preview theme-preview-${theme.id}`}
                style={{ "--theme-preview-base": theme.preview[0], "--theme-preview-surface": theme.preview[1], "--theme-preview-accent": theme.preview[2] }}
                aria-hidden="true"
              >
                <i /><i /><b />
              </span>
              <span className="theme-option-copy"><strong>{theme.name}</strong><small>{theme.description}</small></span>
              <span className="theme-option-check" aria-hidden="true"><CheckCircle size={16} weight="fill" /></span>
            </button>
          ))}
        </div>
      </section>
      <section><h3>界面密度</h3><div className="setting-row"><label>内容密度<small>调整列表和设置页面的留白</small></label><SelectMenu label="内容密度" value={settings.density} onChange={(value) => updateSetting("density", value)} options={[{ value: "comfortable", label: "舒适" }, { value: "compact", label: "紧凑" }]} /></div></section>
      <section><h3>动态效果</h3><div className="setting-row"><label>减少动态效果<small>关闭非必要的过渡动画</small></label><input type="checkbox" checked={settings.reduceMotion} onChange={(event) => updateSetting("reduceMotion", event.target.checked)} /></div></section>
    </>,
    data: <><section><h3>本地存储</h3><div className="setting-row"><label>数据范围<small>笔记、任务和画布不会上传到云端</small></label><span className="setting-status"><Database size={14} />仅此设备</span></div></section><section><h3>备份与重置</h3><div className="data-actions"><button className="ghost-button" onClick={exportAllData}><Export size={15} />导出全部数据</button><button className="danger-button" onClick={clearAllData}><Trash size={15} />清除本地数据</button></div></section></>,
    about: <section className="about-section"><span className="about-mark"><img src={mindFlowAppIcon} alt="" /></span><div><h3>MindFlow 1.6.0</h3><p>一个本地优先的记录、任务与可视化整理工具。</p><span>笔记、任务、桌面挂件、工作流和思维导图都只保存在你的电脑上。</span></div></section>,
  };
  return (
    <section className="settings-page">
      <aside className="settings-nav"><span className="section-kicker">MindFlow</span><h1>设置</h1>{items.map(({ id, label: itemLabel, icon: Icon }) => <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}><Icon size={17} />{itemLabel}</button>)}</aside>
      <div className="settings-content">
        <header><div><span className="eyebrow">偏好设置</span><h2>{label}</h2></div><ShieldCheck size={26} weight="duotone" /></header>
        {content[active]}
      </div>
    </section>
  );
}

function MainApp() {
  const [appSettings, setAppSettings] = useState(readSettings);
  const [page, setPage] = useState(() => {
    const requested = window.location.hash.slice(1);
    return ["notes", "tasks", "drawing", "workflow", "mindmap", "settings"].includes(requested) ? requested : readSettings().defaultOpen;
  });
  const [activeNoteId, setActiveNoteId] = useState(() => {
    const notes = readStoredNotes();
    const saved = Number(localStorage.getItem("mindflow-active-note"));
    return notes.some((note) => note.id === saved) ? saved : notes[0]?.id;
  });
  const [toast, setToast] = useState("");
  useEffect(() => window.history.replaceState(null, "", `#${page}`), [page]);
  useEffect(() => localStorage.setItem("mindflow-active-note", String(activeNoteId || "")), [activeNoteId]);
  useEffect(() => {
    const applySettings = (event) => setAppSettings(event.detail || readSettings());
    const applyExternalSettings = () => setAppSettings(readSettings());
    const unsubscribe = window.mindflow?.onSettingsUpdated?.(applyExternalSettings);
    window.addEventListener("mindflow-settings-change", applySettings);
    return () => {
      unsubscribe?.();
      window.removeEventListener("mindflow-settings-change", applySettings);
    };
  }, []);
  useEffect(() => window.mindflow?.onNavigate?.((nextPage) => {
    if (["notes", "tasks", "drawing", "workflow", "mindmap", "settings"].includes(nextPage)) setPage(nextPage);
  }), []);
  useEffect(() => {
    window.mindflow?.setTitlebarTheme?.(appSettings.theme || "mist");
  }, [appSettings.theme]);
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const today = dateKeyFromDate(now);
      let notified = {};
      try {
        notified = JSON.parse(localStorage.getItem(NOTIFIED_STORAGE_KEY) || "{}") || {};
      } catch {
        notified = {};
      }
      const send = (key, title, body, dueAt) => {
        const lateness = now.getTime() - dueAt.getTime();
        if (lateness < 0 || lateness > 5 * 60 * 1000 || notified[key]) return;
        window.mindflow?.showNotification?.({ title, body });
        notified[key] = now.toISOString();
      };
      readStoredNotes().forEach((note) => {
        const reminder = parseReminderValue(note.reminder);
        if (reminder) send(`note:${note.id}:${note.reminder}`, "MindFlow 笔记提醒", note.title || "未命名笔记", reminder.date);
      });
      readStoredTasks().forEach((task) => {
        if (!task.reminderEnabled || !isTaskDueOn(task, today) || task.completedDates.includes(today)) return;
        const reminder = parseReminderValue(`${today}T${task.reminderTime}:00`);
        if (reminder) send(`task:${task.id}:${today}:${task.reminderTime}`, "MindFlow 任务提醒", task.title || "未命名任务", reminder.date);
      });
      const cutoff = now.getTime() - 14 * 86400000;
      notified = Object.fromEntries(Object.entries(notified).filter(([, value]) => new Date(value).getTime() >= cutoff));
      localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(notified));
    };
    const initialTimer = window.setTimeout(checkReminders, 800);
    const interval = window.setInterval(checkReminders, 20000);
    window.addEventListener("mindflow-tasks-change", checkReminders);
    window.addEventListener("focus", checkReminders);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener("mindflow-tasks-change", checkReminders);
      window.removeEventListener("focus", checkReminders);
    };
  }, []);
  const notify = useCallback((message) => { setToast(message); window.clearTimeout(window.__mindflowToast); window.__mindflowToast = window.setTimeout(() => setToast(""), 2200); }, []);
  const content = useMemo(() => {
    if (page === "tasks") return <TasksPage notify={notify} onOpenNote={(noteId) => { if (noteId) setActiveNoteId(noteId); setPage("notes"); notify("已打开关联笔记"); }} />;
    if (page === "workflow") return <WorkflowPage key={`workflow-${activeNoteId}`} activeNoteId={activeNoteId} onChangeNote={setActiveNoteId} onOpenMindMap={() => setPage("mindmap")} onOpenNote={(noteId) => { if (noteId) setActiveNoteId(noteId); setPage("notes"); notify("已打开对应笔记"); }} notify={notify} />;
    if (page === "mindmap") return <MindMapPage key={`mindmap-${activeNoteId}`} activeNoteId={activeNoteId} onChangeNote={setActiveNoteId} notify={notify} />;
    if (page === "drawing") return <DrawingPage notify={notify} />;
    if (page === "settings") return <SettingsPage notify={notify} />;
    return <NotesPage activeNoteId={activeNoteId} onChangeNote={setActiveNoteId} onOpenWorkflow={(noteId) => { setActiveNoteId(noteId); setPage("workflow"); }} notify={notify} />;
  }, [activeNoteId, page, notify]);
  return <ReactFlowProvider><div className={`app-shell theme-${appSettings.theme || "mist"} density-${appSettings.density} ${appSettings.reduceMotion ? "reduce-motion" : ""}`} style={{ "--editor-font-size": `${appSettings.fontSize}px` }}><div className="desktop-titlebar"><span><img className="titlebar-app-icon" src={mindFlowAppIcon} alt="" />MindFlow</span></div><AppSidebar page={page} setPage={setPage} /><main className="app-main">{content}</main>{toast && <div className="toast"><CheckCircle size={17} weight="fill" />{toast}</div>}</div></ReactFlowProvider>;
}

export function App() {
  return window.location.hash.slice(1) === "widget" ? <TaskWidget /> : <MainApp />;
}
