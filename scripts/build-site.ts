#!/usr/bin/env npx tsx
/**
 * Static site generator for Interleaved.
 *
 * Reads content (markdown + JSON), templates (Handlebars .html), and data
 * (.json) from a source directory, renders everything, and writes to _site/.
 *
 * Usage:
 *   npx tsx scripts/build-site.ts [--src ./my-site] [--out ./_site]
 *
 * Directory structure expected:
 *   templates/     — Handlebars .html files (base.html, post.html, index.html)
 *   content/       — Markdown and JSON content files
 *   data/          — Global JSON data files (site.json, etc.)
 *   static/        — Copied as-is to output
 */

import fs from "fs";
import path from "path";
import { SiteRenderer } from "../lib/renderer";

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

const SRC = path.resolve(getArg("src", "."));
const OUT = path.resolve(getArg("out", "./_site"));

function readDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...readDir(full));
    } else {
      entries.push(full);
    }
  }
  return entries;
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyDir(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      ensureDir(destPath);
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const start = Date.now();
const renderer = new SiteRenderer();

// Step 1: Load templates
const templatesDir = path.join(SRC, "templates");
if (fs.existsSync(templatesDir)) {
  for (const file of readDir(templatesDir)) {
    if (!file.endsWith(".html")) continue;
    const name = path.relative(templatesDir, file)
      .replace(/\.html$/, "")
      .replace(/\\/g, "/");
    const source = fs.readFileSync(file, "utf-8");

    // Files starting with _ are partials
    if (path.basename(file).startsWith("_")) {
      renderer.registerPartial(name.replace(/^_/, ""), source);
    } else {
      renderer.registerTemplate(name, source);
    }
  }
}

// Step 2: Load global data
const dataDir = path.join(SRC, "data");
if (fs.existsSync(dataDir)) {
  for (const file of readDir(dataDir)) {
    if (!file.endsWith(".json")) continue;
    const name = path.basename(file, ".json");
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    renderer.registerData(name, data);
  }
}

// Step 3: Render content
const contentDir = path.join(SRC, "content");
const pages: ReturnType<typeof renderer.renderMarkdown>[] = [];
let fileCount = 0;

if (fs.existsSync(contentDir)) {
  for (const file of readDir(contentDir)) {
    const rel = path.relative(contentDir, file).replace(/\\/g, "/");
    const ext = path.extname(file).toLowerCase();

    if (ext === ".md" || ext === ".mdx" || ext === ".markdown") {
      const content = fs.readFileSync(file, "utf-8");
      const rendered = renderer.renderMarkdown(rel, content);
      const outPath = path.join(OUT, rendered.outputPath);
      ensureDir(outPath);
      fs.writeFileSync(outPath, rendered.html);
      pages.push(rendered);
      fileCount++;
    } else if (ext === ".json") {
      const content = fs.readFileSync(file, "utf-8");
      const rendered = renderer.renderJson(rel, content);
      const outPath = path.join(OUT, rendered.outputPath);
      ensureDir(outPath);
      fs.writeFileSync(outPath, rendered.html);
      pages.push(rendered);
      fileCount++;
    }
  }
}

// Step 4: Render index page if template exists
const indexHtml = renderer.renderCollectionIndex("index", pages, "posts");
if (indexHtml) {
  const outPath = path.join(OUT, "index.html");
  ensureDir(outPath);
  fs.writeFileSync(outPath, indexHtml);
  fileCount++;
}

// Step 5: Copy static files
copyDir(path.join(SRC, "static"), OUT);

const elapsed = Date.now() - start;
console.log(`Built ${fileCount} pages in ${elapsed}ms → ${OUT}`);
