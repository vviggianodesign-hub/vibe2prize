#!/usr/bin/env node

import path from 'node:path';
import fs from 'fs-extra';
import matter from 'gray-matter';
import { evaluateTextOverflow } from '../core/layout/overflow-metrics.js';

const GRID_AREA_REGEX = /<GridArea\s+[^>]*area=\"([^\"]+)\"/g;

const ROOT = path.resolve(process.cwd());
const SLIDES_DIR = path.join(ROOT, 'templates');
const DEFAULT_CONFIG_PATHS = [
  path.join(ROOT, 'templates', 'slide_sets', 'slides.json'),
  path.join(ROOT, 'slide_sets', 'slides.json'),
  path.join(ROOT, 'config', 'slides.json'),
];
let resolvedConfigPath = null;

const args = process.argv.slice(2);
const configArgPath = extractConfigArgPath(args);

const MAX_TABLE_COLUMNS = 4;
const MAX_TABLE_ROWS = 8;

async function main() {
  const errors = [];

  const config = await loadConfig(errors);
  if (!config) {
    report(errors);
    process.exitCode = 1;
    return;
  }

  await fs.ensureDir(SLIDES_DIR);

  for (const slide of config.slides || []) {
    const absolutePath = path.join(SLIDES_DIR, slide.file);
    if (!(await fs.pathExists(absolutePath))) {
      errors.push(`Missing slide file: ${slide.file}`);
      continue;
    }

    const raw = await fs.readFile(absolutePath, 'utf8');
    const { content, data } = matter(raw);

    if (!data.title && !slide.title) {
      errors.push(`${slide.file}: missing title in frontmatter or config`);
    }

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const maxWords = slide.maxWords ?? 400;
    if (wordCount > maxWords) {
      errors.push(`${slide.file}: ${wordCount} words (limit ${maxWords})`);
    }

    detectOverflowTables(content, slide.file, errors);
    detectRegionOverflow({
      file: slide.file,
      layout: data?.layout,
      regions: data?.regions,
      content,
      errors
    });
    detectPotentialWidows(content, slide.file, errors);
    detectGridOverlap(content, slide.file, data?.layout, errors);
  }

  report(errors);
  if (errors.length) {
    process.exitCode = 1;
  }
}

function detectGridOverlap(content, file, layoutData, errors) {
  if (!layoutData || layoutData.type !== 'grid-designer') {
    return;
  }

  const areaCounts = new Map();
  let match;

  while ((match = GRID_AREA_REGEX.exec(content))) {
    const areaName = match[1];
    areaCounts.set(areaName, (areaCounts.get(areaName) || 0) + 1);
  }

  for (const [area, count] of areaCounts.entries()) {
    if (count > 1) {
      errors.push(`${file}: Grid area "${area}" used ${count} times – potential overlap. Consider using unique regions or stacked content.`);
    }
  }

  if (layoutData.regions) {
    const declaredAreas = new Set(layoutData.regions.map((region) => region.area));
    for (const [area] of areaCounts.entries()) {
      if (!declaredAreas.has(area)) {
        errors.push(`${file}: Grid area "${area}" is rendered but not declared in frontmatter regions.`);
      }
    }
  }
}


function detectOverflowTables(content, file, errors) {
  detectHtmlTables(content, file, errors);
  detectMarkdownTables(content, file, errors);
}

function detectRegionOverflow({ file, layout, regions, content, errors }) {
  if (!layout || layout.type !== 'grid-designer' || !Array.isArray(regions) || !regions.length) {
    return;
  }

  const regionByArea = new Map();
  for (const region of regions) {
    if (!region?.area) continue;
    const grid = region.grid || {};
    regionByArea.set(region.area, {
      id: region.id || region.area,
      role: region.role || region.fieldTypes?.[0],
      gridWidth: grid.width || grid.w || 1,
      gridHeight: grid.height || grid.h || 1,
      maxWords: region.maxWords,
      areaLabel: region.area
    });
  }

  if (!regionByArea.size) {
    return;
  }

  const regionContent = extractRegionContentMap(content);
  for (const [area, region] of regionByArea.entries()) {
    const sample = regionContent.get(area) || '';
    const metrics = evaluateTextOverflow({
      text: sample,
      gridWidth: region.gridWidth,
      gridHeight: region.gridHeight,
      role: region.role,
      maxWords: region.maxWords
    });
    if (metrics.overflowChars > 0) {
      const percentOver = metrics.capacity > 0
        ? Math.round((metrics.overflowChars / metrics.capacity) * 100)
        : 0;
      errors.push(`${file}: region "${area}" exceeds capacity by ${metrics.overflowChars} chars (~${percentOver}% over). Trim ~${metrics.suggestedTrim} characters or enlarge the box.`);
    }
  }
}

function extractRegionContentMap(content) {
  const map = new Map();
  const areaRegex = /<GridArea[^>]*area="([^"]+)"[^>]*>([\s\S]*?)<\/GridArea>/gi;
  let match;
  while ((match = areaRegex.exec(content))) {
    const [, area, inner] = match;
    if (!area) continue;
    const text = inner
      .replace(/<ContentRenderer[^>]*content={"([^"]*)"}[^>]*\/>/gi, (_, value) => value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    map.set(area, text);
  }
  return map;
}

function detectPotentialWidows(content, file, errors) {
  // Check for short lines that might end with a single word
  const lines = content.split(/\r?\n/);
  let lineNumber = 0;
  let inTable = false;
  
  for (const line of lines) {
    lineNumber++;
    const trimmedLine = line.trim();

    // Skip empty lines, frontmatter, and code blocks
    if (!trimmedLine || trimmedLine.startsWith('---') || trimmedLine.startsWith('```')) {
      continue;
    }

    // Detect if we're in a markdown table
    if (trimmedLine.includes('|')) {
      inTable = true;
    } else if (inTable && trimmedLine === '') {
      inTable = false;
    }

    // Skip table content
    if (inTable) {
      continue;
    }

    // Skip headers
    if (trimmedLine.startsWith('#')) {
      continue;
    }

    // Skip JSX/HTML component lines which generate false positives
    if (trimmedLine.startsWith('<')) {
      continue;
    }

    // Check for lines that end with a short word (potential widow)
    const words = trimmedLine.split(/\s+/);
    if (words.length >= 3) {
      const lastWord = words[words.length - 1];
      const secondToLastWord = words[words.length - 2];
      
      // Only flag if the last word is very short (1-3 characters) and not a number/symbol
      // and if we have meaningful content (not just table markers)
      if (lastWord.length <= 3 && 
          !/^\d+$/.test(lastWord) && 
          !/^[|>]+$/.test(lastWord) &&
          !lastWord.includes('|') &&
          secondToLastWord.length >= 4) {
        errors.push(`${file}: line ${lineNumber}: potential widow: "${secondToLastWord} ${lastWord}" - consider rephrasing`);
      }
    }
  }
}

function detectHtmlTables(content, file, errors) {
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  const tables = content.match(tableRegex) || [];
  tables.forEach((table, index) => {
    const rowMatches = table.match(/<tr\b/gi) || [];
    const firstRowMatch = table.match(/<tr[\s\S]*?<\/tr>/i);
    const columnMatches = firstRowMatch ? String(firstRowMatch).match(/<t[hd]\b/gi) || [] : [];

    reportIfOversized({
      file,
      tableType: 'HTML',
      index,
      rows: rowMatches.length,
      columns: columnMatches.length,
      errors,
    });
  });
}

function detectMarkdownTables(content, file, errors) {
  const lines = content.split(/\r?\n/);
  let index = 0;
  let tableCount = 0;

  while (index < lines.length) {
    if (!/^\s*\|.*\|\s*$/.test(lines[index])) {
      index += 1;
      continue;
    }

    const block = [];
    while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
      block.push(lines[index]);
      index += 1;
    }

    if (block.length < 2 || !/\|\s*-{3,}/.test(block[1])) {
      continue;
    }

    tableCount += 1;

    const headerColumns = block[0]
      .split('|')
      .map((segment) => segment.trim())
      .filter(Boolean).length;
    const dataRows = Math.max(block.length - 2, 0);

    reportIfOversized({
      file,
      tableType: 'Markdown',
      index: tableCount - 1,
      rows: dataRows,
      columns: headerColumns,
      errors,
    });
  }
}

function reportIfOversized({ file, tableType, index, rows, columns, errors }) {
  const issues = [];
  if (columns > MAX_TABLE_COLUMNS) {
    issues.push(`columns=${columns} (limit ${MAX_TABLE_COLUMNS})`);
  }
  if (rows > MAX_TABLE_ROWS) {
    issues.push(`rows=${rows} (limit ${MAX_TABLE_ROWS})`);
  }

  if (issues.length) {
    errors.push(`${file}: ${tableType} table #${index + 1} may overflow (${issues.join(', ')})`);
  }
}

async function loadConfig(errors) {
  try {
    const configPath = await resolveConfigPath();
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.slides)) {
      errors.push('config/slides.json must contain a "slides" array');
      return null;
    }

    const seen = new Set();
    for (const slide of parsed.slides) {
      if (!slide.file) {
        errors.push('Each slide entry requires a "file" property');
        continue;
      }
      if (seen.has(slide.file)) {
        errors.push(`Duplicate slide file reference: ${slide.file}`);
      }
      seen.add(slide.file);
    }

    return parsed;
  } catch (error) {
    errors.push(`Unable to parse slide config: ${error.message}`);
    return null;
  }
}

async function resolveConfigPath() {
  if (resolvedConfigPath) {
    return resolvedConfigPath;
  }

  const searchPaths = configArgPath
    ? [resolveConfigArg(configArgPath)]
    : DEFAULT_CONFIG_PATHS;

  for (const candidate of searchPaths) {
    if (await fs.pathExists(candidate)) {
      resolvedConfigPath = candidate;
      return candidate;
    }
  }

  throw new Error(
    `Missing slide config. Looked in: ${searchPaths
      .map((candidate) => path.relative(ROOT, candidate))
      .join(', ')}`,
  );
}

function resolveConfigArg(value) {
  return path.isAbsolute(value) ? value : path.join(ROOT, value);
}

function extractConfigArgPath(argv) {
  for (const arg of argv) {
    if (arg.startsWith('--config=')) {
      return arg.split('=')[1];
    }
    if (arg.startsWith('-c=')) {
      return arg.split('=')[1];
    }
  }

  const longIndex = argv.indexOf('--config');
  if (longIndex !== -1 && argv[longIndex + 1]) {
    return argv[longIndex + 1];
  }

  const shortIndex = argv.indexOf('-c');
  if (shortIndex !== -1 && argv[shortIndex + 1]) {
    return argv[shortIndex + 1];
  }

  return null;
}

function report(errors) {
  if (!errors.length) {
    console.log('✅ Slides lint passed');
    return;
  }

  console.error('❌ Slide lint issues:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
}

main();
