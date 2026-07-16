import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge, Background, ConnectionLineType, Controls, Handle,
  Position, ReactFlow, ReactFlowProvider, reconnectEdge, useEdgesState,
  useNodesState,
} from "@xyflow/react";
import {
  ArrowCounterClockwise, Bell, CaretDoubleLeft, CaretDoubleRight, CheckCircle, Copy, Database,
  CaretDown, DotsThree, Export, FloppyDisk, FlowArrow, GearSix, ImageSquare, Info,
  Link, ListBullets, MagnifyingGlass, NotePencil, Palette,
  Plus, ShieldCheck, SquaresFour, Star, TextB, TextItalic,
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

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const inlineMarkdownToHtml = (value = "") => {
  let html = escapeHtml(value);
  html = html.replace(/!\[([^\]]*)\]\(((?:data:image\/[^;]+;base64,|https?:\/\/)[^)]+)\)/gi, (_, alt, source) => `<img src="${source}" alt="${alt}" />`);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|mailto:[^)]+)\)/gi, (_, label, href) => `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`);
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  html = html.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/gi, "<u>$1</u>");
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
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    const listItem = line.match(/^\s*(?:[-*•])\s+(.+)$/);
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
  && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

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

const exportNoteAsJpg = async (note) => {
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
    const jpg = await new Promise((resolve, reject) => outputCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("JPG 编码失败")), "image/jpeg", 0.92));
    downloadBlob(`${(note.title || "未命名笔记").replace(/[\\/:*?"<>|]/g, "-")}.jpg`, jpg);
  } catch (error) {
    window.__mindflowLastExportError = String(error?.stack || error);
    throw error;
  }
};

const initialNotes = [
  { id: 1, title: "日本旅行计划", preview: "计划今年春天去日本旅行…", date: "14:30", tag: "旅行", tone: "violet", content: "## 旅行时间\n计划2026年3月下旬，樱花季\n\n## 目的地\n• 东京（3天）\n• 京都（2天）\n• 大阪（2天）\n\n## 预算\n总预算：15000元\n机票：5000元\n住宿：4000元\n餐饮：3000元\n交通：2000元\n其他：1000元\n\n## 想体验的\n• 樱花\n• 温泉\n• 日本美食" },
  { id: 2, title: "产品设计思路", preview: "记录这款思维工具的核心体验…", date: "12:15", tag: "工作", tone: "amber", content: "## 核心体验\n记录要足够轻，整理要足够直观。\n\n## 产品原则\n• 本地优先\n• 节点可解释\n• 结果可再次编辑" },
  { id: 3, title: "学习笔记 · 设计模式", preview: "结构型模式与组合思维…", date: "昨天", tag: "学习", tone: "green", content: "## 组合模式\n把对象组合成树形结构，以表示部分与整体。\n\n## 使用场景\n• 文件树\n• 组织结构\n• 思维导图" },
  { id: 4, title: "灵感收集", preview: "节点像一条会生长的思路…", date: "2026/07/12", tag: "灵感", tone: "rose", content: "## 灵感\n工作流的连线不只是连接，也可以表达思考的方向。" },
  { id: 5, title: "项目计划", preview: "桌面端 MVP 的迭代安排", date: "2026/07/11", tag: "工作", tone: "violet", content: "## 第一阶段\n笔记、工作流、思维导图。\n\n## 第二阶段\n模板、导出与快捷操作。" },
];

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

function NotesPage({ onOpenWorkflow, notify }) {
  const [notes, setNotes] = useState(readStoredNotes);
  const [selectedId, setSelectedId] = useState(notes[0]?.id);
  const [query, setQuery] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [editorMenu, setEditorMenu] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(() => localStorage.getItem("mindflow-note-list-collapsed") === "1");
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);
  const savedRangeRef = useRef(null);
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false, list: false });
  const selected = notes.find((note) => note.id === selectedId) || notes[0];
  useEffect(() => {
    try {
      localStorage.setItem("mindflow-notes", JSON.stringify(notes));
    } catch {
      notify("本地空间不足，请删除较大的图片后重试");
    }
  }, [notes, notify]);
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
      return;
    }
    setActiveFormats({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      list: document.queryCommandState("insertUnorderedList"),
    });
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
    const rawUrl = window.prompt("输入链接地址", "https://");
    const url = normalizeLinkUrl(rawUrl || "");
    if (!url) return;
    restoreEditorRange();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || range.collapsed) {
      document.execCommand("insertHTML", false, `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">链接文字</a>`);
    } else {
      document.execCommand("createLink", false, url);
      const anchor = selection.anchorNode?.parentElement?.closest?.("a");
      if (anchor) {
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
      }
    }
    rememberEditorRange();
    syncRichEditor();
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

  const toggleReminder = (id) => {
    const note = notes.find((item) => item.id === id);
    updateNote(id, { reminder: note?.reminder ? "" : "明天 09:00" });
    setContextMenu(null);
    notify(note?.reminder ? "提醒已取消" : "已设置明天 09:00 提醒");
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
  return (
    <section className={`notes-layout ${listCollapsed ? "notes-list-collapsed" : ""}`}>
      <aside className="notes-list-pane">
        <button className="notes-pane-expand" onClick={() => setListCollapsed(false)} aria-label="展开笔记列表" title="展开笔记列表"><CaretDoubleRight size={16} weight="bold" /></button>
        <header className="pane-title"><div><span className="section-kicker">资料库</span><h1>全部笔记</h1></div><div className="pane-actions"><button className="pane-collapse" onClick={() => setListCollapsed(true)} aria-label="收起笔记列表" title="收起笔记列表"><CaretDoubleLeft size={16} weight="bold" /></button><button className="icon-button" onClick={addNote} aria-label="新建笔记"><Plus size={17} /></button></div></header>
        <label className="search-box"><MagnifyingGlass size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索笔记…" /></label>
        <div className="note-rows">
          {filtered.map((note) => <button key={note.id} data-note-id={note.id} className={`note-row ${selectedId === note.id ? "selected" : ""}`} onClick={() => setSelectedId(note.id)} onContextMenu={(event) => openContextMenu(event, note)}><div className="note-row-top"><strong>{note.important && <Star className="note-priority" size={11} weight="fill" />}{note.title}</strong><span>{note.date}</span></div><p>{note.preview}</p><div className="note-row-meta"><span className={`tag ${note.tone}`}>{note.tag}</span>{note.reminder && <span className="note-reminder"><Bell size={10} weight="fill" />{note.reminder}</span>}</div></button>)}
          {!filtered.length && <div className="notes-empty"><MagnifyingGlass size={20} /><strong>没有匹配的笔记</strong><span>试试更短的关键词</span></div>}
        </div>
        <div className="list-footer"><span>{notes.length} 条笔记</span><span>本地保存</span></div>
      </aside>
      <article className="note-editor">
        <header className="editor-header">
          <div className="editor-title-line"><div className="document-heading"><span>全部笔记 / {selected?.tag || "笔记"}</span><input className="editor-title-input" value={selected?.title || ""} onChange={(event) => updateSelected({ title: event.target.value })} aria-label="笔记标题" disabled={!selected} /></div><div className="editor-actions"><button className="ghost-button" onClick={() => { localStorage.setItem("mindflow-notes", JSON.stringify(notes)); notify("笔记已保存"); }} disabled={!selected}><FloppyDisk size={15} />保存</button><button className="primary-button" onClick={() => selected && onOpenWorkflow(selected.id)} disabled={!selected}><FlowArrow size={15} />加入工作流</button><div className="editor-more-wrap" onPointerDown={(event) => event.stopPropagation()}><button className="icon-button" onClick={() => setEditorMenu((open) => !open)} aria-label="笔记选项" aria-expanded={editorMenu}><DotsThree size={18} /></button>{editorMenu && selected && <div className="action-menu editor-more-menu" role="menu"><button onClick={() => toggleImportant(selected.id)}><Star size={15} weight={selected.important ? "fill" : "regular"} />{selected.important ? "取消重点" : "标记重点"}</button><button onClick={() => { downloadFile(`${selected.title || "未命名笔记"}.md`, selected.content || ""); setEditorMenu(false); notify("笔记已导出"); }}><Export size={15} />导出 Markdown</button><button onClick={async () => { setEditorMenu(false); try { await exportNoteAsJpg(selected); notify("JPG 已导出"); } catch { notify("JPG 导出失败"); } }}><ImageSquare size={15} />导出为 JPG</button><button onClick={() => duplicateNote(selected.id)}><Copy size={15} />创建副本</button><i /><button className="danger" onClick={() => deleteNote(selected.id)}><Trash size={15} />删除笔记</button></div>}</div></div></div>
          <div className="format-bar" aria-label="文本格式工具栏">
            <button className={activeFormats.bold ? "active" : ""} onPointerDown={(event) => { rememberEditorRange(); event.preventDefault(); }} onClick={() => runRichCommand("bold")} aria-label="加粗" aria-pressed={activeFormats.bold} title="加粗 Ctrl+B"><TextB size={16} /></button>
            <button className={activeFormats.italic ? "active" : ""} onPointerDown={(event) => { rememberEditorRange(); event.preventDefault(); }} onClick={() => runRichCommand("italic")} aria-label="斜体" aria-pressed={activeFormats.italic} title="斜体 Ctrl+I"><TextItalic size={16} /></button>
            <button className={activeFormats.underline ? "active" : ""} onPointerDown={(event) => { rememberEditorRange(); event.preventDefault(); }} onClick={() => runRichCommand("underline")} aria-label="下划线" aria-pressed={activeFormats.underline} title="下划线 Ctrl+U"><TextUnderline size={16} /></button>
            <i />
            <button className={activeFormats.list ? "active" : ""} onPointerDown={(event) => { rememberEditorRange(); event.preventDefault(); }} onClick={() => runRichCommand("insertUnorderedList")} aria-label="列表" aria-pressed={activeFormats.list} title="项目列表"><ListBullets size={16} /></button>
            <button onPointerDown={(event) => { rememberEditorRange(); event.preventDefault(); }} onClick={insertLink} aria-label="链接" title="插入链接"><Link size={16} /></button>
            <button onPointerDown={rememberEditorRange} onClick={chooseImage} aria-label="图片" title="插入本地图片"><ImageSquare size={16} /></button>
            <input ref={imageInputRef} className="format-file-input" type="file" accept="image/*" onChange={insertPickedImage} tabIndex={-1} aria-hidden="true" />
          </div>
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
      {contextMenu && (() => { const note = notes.find((item) => item.id === contextMenu.id); return note ? <div className="action-menu note-context-menu" style={{ left: contextMenu.left, top: contextMenu.top }} role="menu" onPointerDown={(event) => event.stopPropagation()}><button onClick={() => toggleImportant(note.id)}><Star size={15} weight={note.important ? "fill" : "regular"} />{note.important ? "取消重点" : "标记重点"}</button><button onClick={() => toggleReminder(note.id)}><Bell size={15} weight={note.reminder ? "fill" : "regular"} />{note.reminder ? "取消提醒" : "明天提醒"}</button><button onClick={() => duplicateNote(note.id)}><Copy size={15} />创建副本</button><button onClick={() => { downloadFile(`${note.title || "未命名笔记"}.md`, note.content || ""); setContextMenu(null); notify("笔记已导出"); }}><Export size={15} />导出 Markdown</button><button onClick={async () => { setContextMenu(null); try { await exportNoteAsJpg(note); notify("JPG 已导出"); } catch { notify("JPG 导出失败"); } }}><ImageSquare size={15} />导出为 JPG</button><i /><button className="danger" onClick={() => deleteNote(note.id)}><Trash size={15} />删除笔记</button></div> : null; })()}
    </section>
  );
}

function NodeInspector({ node, onClose, onDelete, onUpdate, notify }) {
  if (!node) return null;
  return (
    <aside className="node-inspector">
      <header><div><span className="eyebrow">模块设置</span><h3>{node.data.label}</h3></div><button className="icon-button" onClick={onClose}><X size={16} /></button></header>
      <label>名称<input value={node.data.label} onChange={(event) => onUpdate(node.id, { label: event.target.value })} /></label>
      <label>类型<select value={node.data.kind || "模块"} onChange={(event) => onUpdate(node.id, { kind: event.target.value })}><option>笔记</option><option>文本</option><option>分组</option><option>清单</option><option>条件</option><option>里程碑</option><option>导图</option><option>模块</option></select></label>
      <label>说明<textarea value={node.data.subtitle || ""} onChange={(event) => onUpdate(node.id, { subtitle: event.target.value })} placeholder="说明这个模块记录什么" /></label>
      <div className="inspector-note"><Info size={16} /><span>拖动两侧圆点连接模块；把连线松开在空白处可以直接新建模块。</span></div>
      <div className="inspector-actions"><button className="danger-text" onClick={onDelete}>删除模块</button><button className="primary-button" onClick={() => { notify("模块设置已保存"); onClose(); }}>完成</button></div>
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

function WorkflowPage({ activeNoteId, onChangeNote, onOpenMindMap, notify }) {
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
  return (
    <section className="workflow-page">
      <header className="workspace-header"><div className="workspace-title"><span className="section-kicker">工作流</span><div><NoteSwitcher value={activeNote?.id} onChange={onChangeNote} /><span className="saved-state"><CheckCircle size={13} weight="fill" />已保存</span></div></div><div className="header-actions"><button className="ghost-button" onClick={saveWorkflow}><FloppyDisk size={15} />保存</button><button className="primary-button" onClick={onOpenMindMap}><TreeStructure size={15} />查看导图</button></div></header>
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
        <div className="canvas-mode">拖线新建 <i aria-hidden="true" /> Delete 删除</div>
        <div className="canvas-status"><span />所有内容保存在本机</div>
        <WorkflowNodeMenu menu={nodeMenu} query={nodeQuery} setQuery={setNodeQuery} onChoose={addWorkflowNode} onClose={() => { setNodeMenu(null); setNodeQuery(""); }} />
        <NodeInspector node={selectedNode} onClose={() => setSelectedNode(null)} onDelete={deleteNode} onUpdate={updateNode} notify={notify} />
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

  const resetLayout = () => {
    const recommended = makeMindState(activeNote);
    setNodes(recommended.nodes);
    setEdges(recommended.edges);
    setSelectedId("root");
    setSelectedEdgeId(null);
    notify("已恢复推荐布局");
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
          <button className="ghost-button" onClick={resetLayout}><ArrowCounterClockwise size={15} />整理布局</button>
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
  { id: "salt", name: "海盐", description: "蓝灰表面与沉静海蓝", preview: ["#e9eef1", "#fbfcfd", "#527b90"] },
  { id: "graphite", name: "夜墨", description: "深石墨表面与清晰青绿", preview: ["#171b1a", "#202625", "#67a9a2"] },
];

const validThemeIds = new Set(themeOptions.map((theme) => theme.id));

const readSettings = () => {
  try {
    const stored = { ...defaultSettings, ...JSON.parse(localStorage.getItem("mindflow-settings") || "{}") };
    return { ...stored, theme: validThemeIds.has(stored.theme) ? stored.theme : defaultSettings.theme };
  } catch {
    return defaultSettings;
  }
};

function SettingsPage({ notify }) {
  const [active, setActive] = useState("general");
  const [settings, setSettings] = useState(readSettings);
  const items = [{ id: "general", label: "通用", icon: GearSix }, { id: "appearance", label: "外观", icon: Palette }, { id: "data", label: "数据", icon: Database }, { id: "about", label: "关于", icon: Info }];
  const label = items.find((item) => item.id === active)?.label;
  const updateSetting = (key, value) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      localStorage.setItem("mindflow-settings", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("mindflow-settings-change", { detail: next }));
      return next;
    });
    notify("设置已保存");
  };
  const exportAllData = () => {
    const storage = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key) storage[key] = localStorage.getItem(key);
    }
    downloadFile(`MindFlow-备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "MindFlow", version: "1.2.3", exportedAt: new Date().toISOString(), storage }, null, 2), "application/json");
    notify("全部本地数据已导出");
  };
  const clearAllData = () => {
    if (!window.confirm("确定清除所有笔记、工作流、思维导图和设置吗？此操作无法撤销。")) return;
    localStorage.clear();
    window.location.reload();
  };
  const content = {
    general: <><section><h3>保存</h3><div className="setting-row"><label>自动保存<small>笔记、节点位置和连线会即时保存到本机</small></label><span className="setting-status"><CheckCircle size={14} weight="fill" />已启用</span></div></section><section><h3>打开方式</h3><div className="setting-row"><label>启动后默认打开</label><select value={settings.defaultOpen} onChange={(event) => updateSetting("defaultOpen", event.target.value)}><option value="notes">笔记</option><option value="workflow">工作流</option><option value="mindmap">思维导图</option></select></div><div className="setting-row"><label>笔记字号</label><select value={settings.fontSize} onChange={(event) => updateSetting("fontSize", event.target.value)}><option value="13">小 · 13px</option><option value="14">标准 · 14px</option><option value="15">大 · 15px</option></select></div></section></>,
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
      <section><h3>界面密度</h3><div className="setting-row"><label>内容密度<small>调整列表和设置页面的留白</small></label><select value={settings.density} onChange={(event) => updateSetting("density", event.target.value)}><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></div></section>
      <section><h3>动态效果</h3><div className="setting-row"><label>减少动态效果<small>关闭非必要的过渡动画</small></label><input type="checkbox" checked={settings.reduceMotion} onChange={(event) => updateSetting("reduceMotion", event.target.checked)} /></div></section>
    </>,
    data: <><section><h3>本地存储</h3><div className="setting-row"><label>数据范围<small>笔记和画布不会上传到云端</small></label><span className="setting-status"><Database size={14} />仅此设备</span></div></section><section><h3>备份与重置</h3><div className="data-actions"><button className="ghost-button" onClick={exportAllData}><Export size={15} />导出全部数据</button><button className="danger-button" onClick={clearAllData}><Trash size={15} />清除本地数据</button></div></section></>,
    about: <section className="about-section"><span className="about-mark"><img src={mindFlowAppIcon} alt="" /></span><div><h3>MindFlow 1.2.3</h3><p>一个本地优先的记录与可视化整理工具。</p><span>每条笔记拥有独立的工作流和思维导图，所有数据仅保存在你的电脑上。</span></div></section>,
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

export function App() {
  const [appSettings, setAppSettings] = useState(readSettings);
  const [page, setPage] = useState(() => {
    const requested = window.location.hash.slice(1);
    return ["notes", "workflow", "mindmap", "settings"].includes(requested) ? requested : readSettings().defaultOpen;
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
    window.addEventListener("mindflow-settings-change", applySettings);
    return () => window.removeEventListener("mindflow-settings-change", applySettings);
  }, []);
  useEffect(() => {
    window.mindflow?.setTitlebarTheme?.(appSettings.theme || "mist");
  }, [appSettings.theme]);
  const notify = useCallback((message) => { setToast(message); window.clearTimeout(window.__mindflowToast); window.__mindflowToast = window.setTimeout(() => setToast(""), 2200); }, []);
  const content = useMemo(() => {
    if (page === "workflow") return <WorkflowPage key={`workflow-${activeNoteId}`} activeNoteId={activeNoteId} onChangeNote={setActiveNoteId} onOpenMindMap={() => setPage("mindmap")} notify={notify} />;
    if (page === "mindmap") return <MindMapPage key={`mindmap-${activeNoteId}`} activeNoteId={activeNoteId} onChangeNote={setActiveNoteId} notify={notify} />;
    if (page === "settings") return <SettingsPage notify={notify} />;
    return <NotesPage onOpenWorkflow={(noteId) => { setActiveNoteId(noteId); setPage("workflow"); }} notify={notify} />;
  }, [activeNoteId, page, notify]);
  return <ReactFlowProvider><div className={`app-shell theme-${appSettings.theme || "mist"} density-${appSettings.density} ${appSettings.reduceMotion ? "reduce-motion" : ""}`} style={{ "--editor-font-size": `${appSettings.fontSize}px` }}><div className="desktop-titlebar"><span><img className="titlebar-app-icon" src={mindFlowAppIcon} alt="" />MindFlow</span></div><AppSidebar page={page} setPage={setPage} /><main className="app-main">{content}</main>{toast && <div className="toast"><CheckCircle size={17} weight="fill" />{toast}</div>}</div></ReactFlowProvider>;
}
