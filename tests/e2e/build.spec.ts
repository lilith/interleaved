/**
 * Tests for the static site build script.
 *
 * Runs the build against the default template and verifies output.
 */

import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const TEMPLATE_DIR = path.resolve(__dirname, "../../templates/default");
const OUT_DIR = path.resolve(__dirname, `../../_test_site_output_${process.pid}`);

test.describe("Build script", () => {
  test.beforeAll(() => {
    // Clean output directory
    if (fs.existsSync(OUT_DIR)) {
      fs.rmSync(OUT_DIR, { recursive: true });
    }

    // Run the build
    execSync(
      `npx tsx scripts/build-site.ts --src "${TEMPLATE_DIR}" --out "${OUT_DIR}"`,
      { cwd: path.resolve(__dirname, "../.."), stdio: "pipe" },
    );
  });

  test.afterAll(() => {
    if (fs.existsSync(OUT_DIR)) {
      fs.rmSync(OUT_DIR, { recursive: true });
    }
  });

  test("generates index.html", () => {
    const indexPath = path.join(OUT_DIR, "index.html");
    expect(fs.existsSync(indexPath)).toBe(true);

    const html = fs.readFileSync(indexPath, "utf-8");
    expect(html).toContain("My Site");
    expect(html).toContain("Hello World");
  });

  test("generates post HTML from markdown", () => {
    const postPath = path.join(OUT_DIR, "posts/hello-world.html");
    expect(fs.existsSync(postPath)).toBe(true);

    const html = fs.readFileSync(postPath, "utf-8");
    expect(html).toContain("Hello World");
    expect(html).toContain("Getting Started");
    expect(html).toContain("<strong>");
  });

  test("generates about page with base layout", () => {
    const aboutPath = path.join(OUT_DIR, "about.html");
    expect(fs.existsSync(aboutPath)).toBe(true);

    const html = fs.readFileSync(aboutPath, "utf-8");
    expect(html).toContain("About");
    expect(html).toContain("Interleaved");
  });

  test("index page lists posts with links", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, "index.html"), "utf-8");

    // Should contain a link to the post
    expect(html).toContain("hello-world.html");
  });

  test("post page includes site name from data/site.json", () => {
    const html = fs.readFileSync(
      path.join(OUT_DIR, "posts/hello-world.html"),
      "utf-8",
    );

    expect(html).toContain("My Site");
  });

  test("post page includes formatted date", () => {
    const html = fs.readFileSync(
      path.join(OUT_DIR, "posts/hello-world.html"),
      "utf-8",
    );

    expect(html).toContain("April");
    expect(html).toContain("2026");
  });

  test("generates valid HTML structure", () => {
    const html = fs.readFileSync(
      path.join(OUT_DIR, "posts/hello-world.html"),
      "utf-8",
    );

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain("<head>");
    expect(html).toContain("<body");
  });

  test("header partial renders navigation", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, "index.html"), "utf-8");

    expect(html).toContain("Home");
    expect(html).toContain("About");
    expect(html).toContain("<nav");
  });

  test("footer partial renders", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, "index.html"), "utf-8");

    expect(html).toContain("<footer");
    expect(html).toContain("My Site");
  });
});
