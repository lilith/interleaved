# Interleaved

Claude-native CMS for static sites. Fork of Pages CMS.

## Project Structure

```
lib/renderer/     — Isomorphic Handlebars + marked renderer
lib/media/        — Pluggable media storage (git, S3/R2)
lib/infer-*.ts    — Schema inference from frontmatter/JSON
templates/default/ — Default site template
scripts/build-site.ts — Static site generator CLI
mcp-server.ts     — MCP server for Claude Code
```

## Site Template Structure

Sites managed by Interleaved follow this layout:

```
templates/     — Handlebars .html files
  base.html    — Default layout (wraps pages)
  post.html    — Blog post layout
  index.html   — Collection index (lists posts)
  _header.html — Partial (prefix _ = partial)
  _footer.html — Partial
content/       — Markdown and JSON content
  posts/       — Blog posts (*.md)
  about.md     — Standalone pages
data/          — Global JSON data
  site.json    — Site name, nav, description
static/        — Copied as-is to output
```

## Template Syntax (Handlebars)

Templates are plain HTML with `{{}}` tags:

- `{{title}}` — escaped variable
- `{{{content}}}` — unescaped HTML (for rendered markdown)
- `{{> header}}` — include partial
- `{{#if draft}}...{{/if}}` — conditional
- `{{#each posts}}...{{/each}}` — loop
- `{{formatDate date}}` — format date
- `{{truncate description 120}}` — truncate text
- `{{sortBy posts "date" "desc"}}` — sort array

## Content Format

Markdown files with YAML frontmatter:
```markdown
---
title: My Post
date: 2026-04-07
description: A short summary
layout: post
---

Content in **markdown**.
```

JSON data files are objects with fields that become editable in the admin.

## Build

```bash
npx tsx scripts/build-site.ts --src ./my-site --out ./_site
```

## Running Tests

```bash
npx playwright test
```
