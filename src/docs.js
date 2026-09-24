// 「我的资料」：上传的简历、项目经历、职位描述等。
// 上传时把文字提取出来，保存在本机 data/profile.json，生成提示时交给 AI 参考。
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

const DATA_DIR = process.env.DATA_DIR || path.resolve("data");
const FILE = path.join(DATA_DIR, "profile.json");

// 资料太长会让每次提示变慢、变贵。超过上限的直接拒绝，并告诉用户，不偷偷截断。
export const MAX_DOC_CHARS = 60_000;
export const MAX_TOTAL_CHARS = 150_000;

/** @typedef {{id:string, name:string, chars:number, enabled:boolean, uploadedAt:string, text:string}} Doc */

/** @type {Doc[] | null} */
let docs = null;

async function load() {
  if (docs) return docs;
  try {
    docs = JSON.parse(await fs.readFile(FILE, "utf8")).docs ?? [];
  } catch (err) {
    if (err.code !== "ENOENT") console.error("读取 profile.json 失败：", err);
    docs = [];
  }
  return docs;
}

async function save() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify({ docs }, null, 2));
  await fs.rename(tmp, FILE);
}

export class DocError extends Error {}

/** 不含正文的列表，给页面显示用 */
export async function listDocs() {
  return (await load()).map(({ text, ...meta }) => ({ ...meta, preview: text.slice(0, 200) }));
}

/** @param {string} name @param {Buffer} buf */
async function extract(name, buf) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (ext === ".docx") {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }
  if ([".txt", ".md", ".markdown", ".csv", ".json"].includes(ext)) {
    return buf.toString("utf8");
  }
  throw new DocError(`不支持「${ext || "无扩展名"}」文件。请上传 PDF、Word（.docx）或文本（.txt / .md）。老的 .doc 请先另存为 .docx。`);
}

function tidy(text) {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 添加一份资料：上传文件（buf）或直接粘贴的文字（text）
 * @param {{name:string, buf?:Buffer, text?:string}} input
 */
export async function addDoc({ name, buf, text }) {
  name = (name || "").trim().slice(0, 120) || "我的资料";
  const content = tidy(text ?? (await extract(name, buf)));
  if (!content) {
    throw new DocError(`「${name}」里读不出文字。如果是扫描件或图片 PDF，请把内容复制成文字后用「粘贴文字」添加。`);
  }
  if (content.length > MAX_DOC_CHARS) {
    throw new DocError(`「${name}」有 ${content.length} 个字符，超过单份上限 ${MAX_DOC_CHARS}。请只保留和面试相关的部分再上传。`);
  }
  const all = await load();
  const total = all.filter((d) => d.enabled).reduce((n, d) => n + d.chars, 0) + content.length;
  if (total > MAX_TOTAL_CHARS) {
    throw new DocError(`启用的资料加起来会有 ${total} 个字符，超过上限 ${MAX_TOTAL_CHARS}。请先停用或删除一些资料。`);
  }
  const doc = { id: randomUUID(), name, chars: content.length, enabled: true, uploadedAt: new Date().toISOString(), text: content };
  all.push(doc);
  await save();
  const { text: _t, ...meta } = doc;
  return meta;
}

export async function updateDoc(id, { enabled }) {
  const all = await load();
  const doc = all.find((d) => d.id === id);
  if (!doc) throw new DocError("找不到这份资料");
  if (typeof enabled === "boolean") {
    if (enabled && !doc.enabled) {
      const total = all.filter((d) => d.enabled).reduce((n, d) => n + d.chars, 0) + doc.chars;
      if (total > MAX_TOTAL_CHARS) throw new DocError(`启用后资料总长度 ${total} 会超过上限 ${MAX_TOTAL_CHARS}`);
    }
    doc.enabled = enabled;
  }
  await save();
}

export async function deleteDoc(id) {
  const all = await load();
  const i = all.findIndex((d) => d.id === id);
  if (i === -1) throw new DocError("找不到这份资料");
  all.splice(i, 1);
  await save();
}

/** 启用的资料全文，按上传顺序（顺序固定，方便 AI 服务端缓存） */
export async function enabledDocs() {
  return (await load()).filter((d) => d.enabled).map(({ name, text }) => ({ name, text }));
}
