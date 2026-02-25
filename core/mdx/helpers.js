import path from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import matter from 'gray-matter';

const projectRoot = path.resolve(process.cwd());
export const slidesDirectory = path.join(projectRoot, 'templates', 'mdx');

function resolveMdxPath(targetPath = '') {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }
  return path.join(slidesDirectory, targetPath);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`MDX validation error: ${message}`);
  }
}

export function validateFrontmatter(frontmatter) {
  assert(frontmatter && typeof frontmatter === 'object', 'frontmatter must be an object');

  assert(typeof frontmatter.title === 'string' && frontmatter.title.trim(), 'title is required');
  assert(typeof frontmatter.phase === 'string' && frontmatter.phase.trim(), 'phase is required');
  assert(
    typeof frontmatter.maxWords === 'number' && Number.isFinite(frontmatter.maxWords),
    'maxWords must be a number'
  );

  const layout = frontmatter.layout;
  assert(layout && typeof layout === 'object', 'layout must be provided');
  assert(typeof layout.type === 'string' && layout.type.trim(), 'layout.type is required');
  assert(typeof layout.template === 'string' && layout.template.trim(), 'layout.template is required');
  assert(
    Array.isArray(layout.components) && layout.components.every((c) => typeof c === 'string'),
    'layout.components must be an array of strings'
  );

  const regions = frontmatter.regions;
  assert(Array.isArray(regions) && regions.length > 0, 'regions must be a non-empty array');
  regions.forEach((region, index) => {
    assert(region && typeof region === 'object', `region[${index}] must be an object`);
    assert(typeof region.id === 'string' && region.id.trim(), `region[${index}] id is required`);
    assert(typeof region.role === 'string' && region.role.trim(), `region[${index}] role is required`);
    assert(typeof region.area === 'string' && region.area.trim(), `region[${index}] area is required`);
    if ('maxWords' in region) {
      assert(
        typeof region.maxWords === 'number' && Number.isFinite(region.maxWords),
        `region[${index}] maxWords must be a number`
      );
    }
  });

  if ('tags' in frontmatter) {
    assert(
      Array.isArray(frontmatter.tags) && frontmatter.tags.every((tag) => typeof tag === 'string'),
      'tags must be an array of strings'
    );
  }
}

export async function readMdxFile(targetPath, { validate = true } = {}) {
  const mdxPath = resolveMdxPath(targetPath);
  const source = await readFile(mdxPath, 'utf8');
  const parsed = matter(source);
  if (validate) {
    validateFrontmatter(parsed.data);
  }

  return {
    path: mdxPath,
    frontmatter: parsed.data,
    content: parsed.content.trimEnd(),
    raw: source,
  };
}

export async function writeMdxFile(targetPath, frontmatter, content = '', { validate = true } = {}) {
  if (validate) {
    validateFrontmatter(frontmatter);
  }
  const mdxPath = resolveMdxPath(targetPath);
  await mkdir(path.dirname(mdxPath), { recursive: true });

  const normalizedContent = content.endsWith('\n') ? content : `${content}\n`;
  const serialized = matter.stringify(normalizedContent, frontmatter, {
    lineWidth: Infinity,
  });

  await writeFile(mdxPath, serialized, 'utf8');
  return mdxPath;
}
